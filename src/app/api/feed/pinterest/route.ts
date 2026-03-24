import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/** Vercel Pro+: 긴 피드 생성 시 타임아웃 완화 (Hobby은 플랫폼 상한 유지) */
export const maxDuration = 60;

const BASE_URL = 'https://www.copydrum.com';
const BATCH_SIZE = 1000;

/** title_en / title_translations 이 있으면 우선 사용 (없으면 프로브 후 최소 컬럼만 조회) */
const FEED_SELECT_WITH_I18N =
  'id, title, title_en, title_translations, price, slug, thumbnail_url, preview_image_url';
const FEED_SELECT_MINIMAL =
  'id, title, price, slug, thumbnail_url, preview_image_url';

const CSV_COLUMNS = [
  'id',
  'title',
  'description',
  'link',
  'image_link',
  'price',
  'availability',
  'condition',
] as const;

type SheetFeedRow = {
  id: string;
  title: string | null;
  title_en?: string | null;
  title_translations?: Record<string, string> | null;
  price: number | null;
  slug: string | null;
  thumbnail_url: string | null;
  preview_image_url: string | null;
};

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    return null;
  }

  if (serviceKey) {
    return createClient(url, serviceKey);
  }

  return createClient(url, anonKey);
}

async function resolveFeedSelectColumns(
  supabase: SupabaseClient
): Promise<string> {
  const { error } = await supabase
    .from('drum_sheets')
    .select(FEED_SELECT_WITH_I18N)
    .limit(1);

  if (
    error &&
    (error.code === 'PGRST204' ||
      /column|does not exist|schema cache/i.test(error.message))
  ) {
    return FEED_SELECT_MINIMAL;
  }

  return FEED_SELECT_WITH_I18N;
}

/** 사이트 글로벌(영어) USD 표시 규칙과 동일: 1000 KRW = 1 USD (currency.ts `convertFromKrw` en 표준) */
function krwToUsdStandard(krw: number): number {
  return krw / 1000;
}

function formatUsdPrice(krw: number | null | undefined): string {
  if (krw == null || Number.isNaN(Number(krw))) {
    return '0.00 USD';
  }
  const usd = krwToUsdStandard(Number(krw));
  return `${usd.toFixed(2)} USD`;
}

/** RFC 4180 스타일: 쉼표·따옴표·개행이 있으면 따옴표로 감싸고 내부 " 는 이스케이프 */
function escapeCsvField(raw: string): string {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function resolveFeedTitle(row: SheetFeedRow): string {
  const fromEn = row.title_en?.trim();
  if (fromEn) return fromEn;
  const fromTranslations = row.title_translations?.en?.trim();
  if (fromTranslations) return fromTranslations;
  const fallback = row.title?.trim();
  if (fallback) return fallback;
  return 'Drum sheet music';
}

function buildSheetLink(slug: string | null | undefined): string | null {
  const s = slug?.trim();
  if (!s) return null;
  return `${BASE_URL}/drum-sheet/${s}`;
}

function resolveImageLink(
  preview: string | null | undefined,
  thumbnail: string | null | undefined
): string {
  const p = preview?.trim();
  if (p) return p;
  const t = thumbnail?.trim();
  return t ?? '';
}

function rowToCsvLine(row: SheetFeedRow): string | null {
  const link = buildSheetLink(row.slug);
  if (!link) {
    return null;
  }

  const title = resolveFeedTitle(row);
  const description = `High-quality drum sheet music for ${title} by Copydrum.`;
  const imageLink = resolveImageLink(row.preview_image_url, row.thumbnail_url);
  const price = formatUsdPrice(row.price);

  const fields = [
    row.id,
    title,
    description,
    link,
    imageLink,
    price,
    'in stock',
    'new',
  ];

  return fields.map(escapeCsvField).join(',') + '\r\n';
}

export async function GET() {
  const supabase = getSupabase();

  if (!supabase) {
    return new Response('Supabase URL or anon key is not configured.', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  let selectColumns: string;
  try {
    selectColumns = await resolveFeedSelectColumns(supabase);
  } catch (e) {
    return new Response(
      `Failed to resolve drum_sheets columns: ${e instanceof Error ? e.message : String(e)}`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }
    );
  }

  const encoder = new TextEncoder();
  const headerLine = CSV_COLUMNS.join(',') + '\r\n';

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(headerLine));

        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from('drum_sheets')
            .select(selectColumns)
            .eq('is_active', true)
            .not('slug', 'is', null)
            .neq('slug', '')
            .order('id', { ascending: true })
            .range(offset, offset + BATCH_SIZE - 1);

          if (error) {
            controller.error(error);
            return;
          }

          const batch = (data ?? []) as SheetFeedRow[];
          if (batch.length === 0) {
            break;
          }

          const lines = batch
            .map(rowToCsvLine)
            .filter((line): line is string => line != null);
          const chunk = lines.join('');
          controller.enqueue(encoder.encode(chunk));

          offset += batch.length;
          hasMore = batch.length === BATCH_SIZE;
        }

        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'public, max-age=600, s-maxage=600',
    },
  });
}
