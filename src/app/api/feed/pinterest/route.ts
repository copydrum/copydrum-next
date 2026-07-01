import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/** Vercel Pro+: 긴 피드 생성 시 타임아웃 완화 (Hobby은 플랫폼 상한 유지) */
export const maxDuration = 60;

// 사이트 표준 도메인(www 미사용) + 글로벌 SEO x-default 와 동일한 /en locale 사용.
// 피드 title/description 이 영어 기준이므로 영어 locale URL 로 연결한다.
const BASE_URL = 'https://www.copydrum.com';
const FEED_LOCALE = 'en';
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
  'google_product_category',
] as const;

/** Google Product Taxonomy — Sheet Music (핀터레스트/구글 카탈로그 표준 ID) */
const GOOGLE_PRODUCT_CATEGORY_SHEET_MUSIC = '6083';

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

const UTF8_BOM = '\uFEFF';

/**
 * 엑셀/핀터레스트 호환: 모든 셀을 RFC 4180 방식으로 항상 큰따옴표로 감쌈.
 * - 내부 " → ""
 * - CR/LF 정규화(필드 내 줄바꿈도 한 필드로 유지)
 */
function escapeCSV(text: string | number | null | undefined): string {
  const raw = text == null ? '' : String(text);
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const escaped = normalized.replace(/"/g, '""');
  return `"${escaped}"`;
}

function buildCsvRow(
  colId: string,
  title: string,
  description: string,
  link: string,
  imageLink: string,
  price: string,
  availability: string,
  condition: string,
  googleProductCategory: string
): string {
  return [
    colId,
    title,
    description,
    link,
    imageLink,
    price,
    availability,
    condition,
    googleProductCategory,
  ]
    .map(escapeCSV)
    .join(',') + '\r\n';
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
  return `${BASE_URL}/${FEED_LOCALE}/drum-sheet/${s}`;
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

  return buildCsvRow(
    row.id,
    title,
    description,
    link,
    imageLink,
    price,
    'in stock',
    'new',
    GOOGLE_PRODUCT_CATEGORY_SHEET_MUSIC
  );
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
  const headerLine = buildCsvRow(...CSV_COLUMNS);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(UTF8_BOM + headerLine));

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
