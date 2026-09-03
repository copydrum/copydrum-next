import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { tryGenerateNormalizedKey } from '@/lib/utils/normalizedKey';

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (serviceRoleKey) {
    return createClient(url, serviceRoleKey);
  }

  console.warn('[backfill-normalized-keys] ⚠️ Service Role Key 없음 → Anon Key 사용');
  return createClient(url, anonKey);
}

/**
 * GET /api/admin/backfill-normalized-keys
 * normalized_key가 NULL인 악보 개수를 반환합니다.
 */
export async function GET() {
  try {
    const supabase = createAdminClient();

    const { count, error } = await supabase
      .from('drum_sheets')
      .select('id', { count: 'exact', head: true })
      .is('normalized_key', null);

    if (error) {
      return NextResponse.json(
        { success: false, error: `조회 실패: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      nullCount: count ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/backfill-normalized-keys
 *
 * normalized_key가 NULL인 악보에 검색용 키를 일괄 생성합니다.
 * 프론트엔드 또는 curl에서 limit(기본 100) 단위로 반복 호출하세요.
 *
 * Body: { limit?: number; force?: boolean }
 *   - limit: 이번 배치 처리 개수 (기본 100)
 *   - force: true면 NULL이 아닌 행도 artist/title 기준으로 재생성
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit =
      typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 500) : 100;
    const force = body.force === true;

    const supabase = createAdminClient();

    let query = supabase
      .from('drum_sheets')
      .select('id, artist, title, normalized_key')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!force) {
      query = query.is('normalized_key', null);
    }

    const { data: sheets, error: fetchError } = await query;

    if (fetchError) {
      return NextResponse.json(
        { success: false, error: `DB 조회 실패: ${fetchError.message}` },
        { status: 500 }
      );
    }

    if (!sheets || sheets.length === 0) {
      return NextResponse.json({
        success: true,
        message: force
          ? '처리할 악보가 없습니다.'
          : 'normalized_key가 NULL인 악보가 없습니다.',
        stats: { updated: 0, skipped: 0, failed: 0, processed: 0 },
        done: true,
      });
    }

    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const failedItems: Array<{ id: string; label: string; error: string }> = [];

    for (const sheet of sheets) {
      const artist = (sheet.artist ?? '').trim();
      const title = (sheet.title ?? '').trim();
      const label = `${artist} - ${title}`;

      const normalizedKey = tryGenerateNormalizedKey(artist, title);
      if (!normalizedKey) {
        skipped++;
        continue;
      }

      if (!force && sheet.normalized_key === normalizedKey) {
        skipped++;
        continue;
      }

      const { error: updateError } = await supabase
        .from('drum_sheets')
        .update({ normalized_key: normalizedKey })
        .eq('id', sheet.id);

      if (updateError) {
        failed++;
        failedItems.push({
          id: sheet.id,
          label,
          error: updateError.message,
        });
      } else {
        updated++;
      }
    }

    const { count: remainingCount } = await supabase
      .from('drum_sheets')
      .select('id', { count: 'exact', head: true })
      .is('normalized_key', null);

    const remaining = remainingCount ?? 0;

    return NextResponse.json({
      success: true,
      stats: {
        updated,
        skipped,
        failed,
        processed: sheets.length,
        remaining,
      },
      failedItems: failedItems.slice(0, 20),
      done: remaining === 0,
      message:
        remaining === 0
          ? '백필이 완료되었습니다.'
          : `배치 처리 완료. NULL ${remaining}건 남음 — POST를 반복 호출하세요.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
