import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (serviceRoleKey) {
    return createClient(url, serviceRoleKey);
  }

  console.warn('[migrate-thumbnails] ⚠️ Service Role Key 없음 → Anon Key 사용');
  return createClient(url, anonKey);
}

const SUPABASE_STORAGE_BUCKET = 'drum-sheets';
const THUMBNAIL_FOLDER = 'thumbnails';
const DOWNLOAD_TIMEOUT_MS = 15000;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const BATCH_DELAY_MS = 500;

function isExternalUrl(url: string): boolean {
  if (!url || !url.startsWith('http')) return false;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseDomain = supabaseUrl.replace('https://', '').replace('http://', '');
  return !url.includes(supabaseDomain);
}

function getContentTypeFromResponse(
  contentType: string | null,
  url: string
): { mime: string; ext: string } {
  if (contentType?.includes('image/png')) return { mime: 'image/png', ext: 'png' };
  if (contentType?.includes('image/webp')) return { mime: 'image/webp', ext: 'webp' };
  if (contentType?.includes('image/gif')) return { mime: 'image/gif', ext: 'gif' };

  const urlLower = url.toLowerCase();
  if (urlLower.includes('.png')) return { mime: 'image/png', ext: 'png' };
  if (urlLower.includes('.webp')) return { mime: 'image/webp', ext: 'webp' };

  return { mime: 'image/jpeg', ext: 'jpg' };
}

async function downloadAndUploadImage(
  supabase: ReturnType<typeof createAdminClient>,
  imageUrl: string,
  sheetId: string
): Promise<{ success: boolean; storageUrl?: string; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const imageResponse = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CopyDrumBot/1.0)',
        'Accept': 'image/*',
      },
    });

    if (!imageResponse.ok) {
      return { success: false, error: `HTTP ${imageResponse.status}` };
    }

    const contentType = imageResponse.headers.get('content-type');
    if (contentType && !contentType.startsWith('image/')) {
      return { success: false, error: `이미지가 아닌 콘텐츠: ${contentType}` };
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return { success: false, error: '빈 이미지' };
    }
    if (arrayBuffer.byteLength > MAX_FILE_SIZE) {
      return { success: false, error: `크기 초과 (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)}MB)` };
    }

    const { mime, ext } = getContentTypeFromResponse(contentType, imageUrl);
    const fileName = `thumb_${sheetId}_${Date.now()}.${ext}`;
    const filePath = `${THUMBNAIL_FOLDER}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(filePath, arrayBuffer, {
        contentType: mime,
        upsert: true,
      });

    if (uploadError) {
      return { success: false, error: `업로드 실패: ${uploadError.message}` };
    }

    const { data: urlData } = supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .getPublicUrl(filePath);

    return { success: true, storageUrl: urlData.publicUrl };
  } catch (fetchError: any) {
    const isTimeout = fetchError.name === 'AbortError';
    return {
      success: false,
      error: isTimeout ? '다운로드 시간 초과' : `다운로드 실패: ${fetchError.message}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * POST /api/admin/migrate-thumbnails
 *
 * 기존 DB에 외부 URL로 저장된 모든 썸네일을 Supabase Storage로 마이그레이션합니다.
 *
 * Body (optional): { dryRun?: boolean, limit?: number }
 *   - dryRun: true이면 실제 작업 없이 대상 목록만 반환
 *   - limit: 한 번에 처리할 최대 개수 (기본: 전체)
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const limit = typeof body.limit === 'number' ? body.limit : 0;

    const supabase = createAdminClient();

    let query = supabase
      .from('drum_sheets')
      .select('id, title, artist, thumbnail_url')
      .not('thumbnail_url', 'is', null)
      .neq('thumbnail_url', '');

    if (limit > 0) {
      query = query.limit(limit);
    }

    const { data: sheets, error: fetchError } = await query;

    if (fetchError) {
      console.error('[migrate-thumbnails] ❌ DB 조회 실패:', fetchError);
      return NextResponse.json(
        { success: false, error: `DB 조회 실패: ${fetchError.message}` },
        { status: 500 }
      );
    }

    if (!sheets || sheets.length === 0) {
      return NextResponse.json({
        success: true,
        message: '마이그레이션할 썸네일이 없습니다.',
        stats: { total: 0, external: 0, migrated: 0, failed: 0, skipped: 0 },
      });
    }

    const externalSheets = sheets.filter(
      (s) => s.thumbnail_url && isExternalUrl(s.thumbnail_url)
    );

    if (dryRun) {
      return NextResponse.json({
        success: true,
        message: `Dry Run: ${externalSheets.length}개의 외부 썸네일을 마이그레이션해야 합니다.`,
        dryRun: true,
        stats: {
          total: sheets.length,
          external: externalSheets.length,
          internal: sheets.length - externalSheets.length,
        },
        targets: externalSheets.map((s) => ({
          id: s.id,
          title: s.title,
          artist: s.artist,
          thumbnail_url: s.thumbnail_url,
        })),
      });
    }

    console.log(`[migrate-thumbnails] 🚀 마이그레이션 시작: ${externalSheets.length}개 대상`);

    const results: {
      migrated: Array<{ id: string; title: string; artist: string; oldUrl: string; newUrl: string }>;
      failed: Array<{ id: string; title: string; artist: string; url: string; error: string }>;
      skipped: number;
    } = { migrated: [], failed: [], skipped: 0 };

    for (let i = 0; i < externalSheets.length; i++) {
      const sheet = externalSheets[i];
      const logPrefix = `[${i + 1}/${externalSheets.length}]`;

      console.log(`[migrate-thumbnails] ${logPrefix} 처리 중: ${sheet.artist} - ${sheet.title}`);

      const uploadResult = await downloadAndUploadImage(
        supabase,
        sheet.thumbnail_url!,
        sheet.id
      );

      if (!uploadResult.success || !uploadResult.storageUrl) {
        console.error(`[migrate-thumbnails] ${logPrefix} ❌ 실패: ${uploadResult.error}`);
        results.failed.push({
          id: sheet.id,
          title: sheet.title,
          artist: sheet.artist,
          url: sheet.thumbnail_url!,
          error: uploadResult.error || '알 수 없는 오류',
        });

        if (i < externalSheets.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
        }
        continue;
      }

      const { error: updateError } = await supabase
        .from('drum_sheets')
        .update({ thumbnail_url: uploadResult.storageUrl })
        .eq('id', sheet.id);

      if (updateError) {
        console.error(`[migrate-thumbnails] ${logPrefix} ❌ DB 업데이트 실패: ${updateError.message}`);
        results.failed.push({
          id: sheet.id,
          title: sheet.title,
          artist: sheet.artist,
          url: sheet.thumbnail_url!,
          error: `DB 업데이트 실패: ${updateError.message}`,
        });
      } else {
        console.log(`[migrate-thumbnails] ${logPrefix} ✅ 완료: ${sheet.thumbnail_url} → ${uploadResult.storageUrl}`);
        results.migrated.push({
          id: sheet.id,
          title: sheet.title,
          artist: sheet.artist,
          oldUrl: sheet.thumbnail_url!,
          newUrl: uploadResult.storageUrl,
        });
      }

      if (i < externalSheets.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`[migrate-thumbnails] 🏁 마이그레이션 완료 (${elapsed}초)`);
    console.log(`  ✅ 성공: ${results.migrated.length}개`);
    console.log(`  ❌ 실패: ${results.failed.length}개`);

    return NextResponse.json({
      success: true,
      message: `마이그레이션 완료: ${results.migrated.length}개 성공, ${results.failed.length}개 실패 (${elapsed}초 소요)`,
      stats: {
        total: sheets.length,
        external: externalSheets.length,
        migrated: results.migrated.length,
        failed: results.failed.length,
        elapsed: `${elapsed}s`,
      },
      migrated: results.migrated,
      failed: results.failed,
    });
  } catch (error) {
    console.error('[migrate-thumbnails] 🔥 예외 발생:', error);
    return NextResponse.json(
      {
        success: false,
        error: `서버 오류: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/migrate-thumbnails
 *
 * 마이그레이션 대상 현황을 조회합니다 (dry run과 동일).
 */
export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data: sheets, error } = await supabase
      .from('drum_sheets')
      .select('id, title, artist, thumbnail_url')
      .not('thumbnail_url', 'is', null)
      .neq('thumbnail_url', '');

    if (error) {
      return NextResponse.json(
        { success: false, error: `DB 조회 실패: ${error.message}` },
        { status: 500 }
      );
    }

    const external = (sheets || []).filter(
      (s) => s.thumbnail_url && isExternalUrl(s.thumbnail_url)
    );
    const internal = (sheets || []).filter(
      (s) => s.thumbnail_url && !isExternalUrl(s.thumbnail_url)
    );

    return NextResponse.json({
      success: true,
      stats: {
        total: sheets?.length || 0,
        external: external.length,
        internal: internal.length,
        noThumbnail:
          (sheets?.length || 0) - external.length - internal.length,
      },
      externalUrls: external.map((s) => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        thumbnail_url: s.thumbnail_url,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: `서버 오류: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 }
    );
  }
}
