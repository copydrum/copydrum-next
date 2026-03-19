import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (serviceRoleKey) {
    return createClient(url, serviceRoleKey);
  }

  console.warn('[upload-thumbnail] ⚠️ Service Role Key 없음 → Anon Key 사용');
  return createClient(url, anonKey);
}

const SUPABASE_STORAGE_BUCKET = 'drum-sheets';
const THUMBNAIL_FOLDER = 'thumbnails';
const DOWNLOAD_TIMEOUT_MS = 15000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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

/**
 * POST /api/admin/upload-thumbnail-from-url
 *
 * 외부 이미지 URL을 다운로드하여 Supabase Storage에 업로드하고,
 * 생성된 내부 공개 URL을 반환합니다.
 *
 * Body: { imageUrl: string, sheetId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { imageUrl, sheetId } = await request.json();

    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: '이미지 URL이 필요합니다.' },
        { status: 400 }
      );
    }

    const trimmedUrl = imageUrl.trim();

    if (!isExternalUrl(trimmedUrl)) {
      return NextResponse.json({
        success: true,
        storageUrl: trimmedUrl,
        message: '이미 Supabase Storage URL이므로 변환이 필요하지 않습니다.',
        skipped: true,
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

    let imageResponse: Response;
    try {
      imageResponse = await fetch(trimmedUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CopyDrumBot/1.0)',
          'Accept': 'image/*',
        },
      });
    } catch (fetchError: any) {
      clearTimeout(timeout);
      const isTimeout = fetchError.name === 'AbortError';
      return NextResponse.json(
        {
          success: false,
          error: isTimeout
            ? `이미지 다운로드 시간 초과 (${DOWNLOAD_TIMEOUT_MS / 1000}초)`
            : `이미지 다운로드 실패: ${fetchError.message}`,
        },
        { status: 502 }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!imageResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `이미지 다운로드 실패: HTTP ${imageResponse.status}`,
        },
        { status: 502 }
      );
    }

    const contentType = imageResponse.headers.get('content-type');
    if (contentType && !contentType.startsWith('image/')) {
      return NextResponse.json(
        { success: false, error: `이미지가 아닌 콘텐츠 타입: ${contentType}` },
        { status: 400 }
      );
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return NextResponse.json(
        { success: false, error: '다운로드된 이미지가 비어 있습니다.' },
        { status: 400 }
      );
    }
    if (arrayBuffer.byteLength > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `이미지 크기가 너무 큽니다 (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)}MB > ${MAX_FILE_SIZE / 1024 / 1024}MB)` },
        { status: 400 }
      );
    }

    const { mime, ext } = getContentTypeFromResponse(contentType, trimmedUrl);
    const uniqueId = sheetId || crypto.randomUUID();
    const fileName = `thumb_${uniqueId}_${Date.now()}.${ext}`;
    const filePath = `${THUMBNAIL_FOLDER}/${fileName}`;

    const supabase = createAdminClient();

    const { error: uploadError } = await supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(filePath, arrayBuffer, {
        contentType: mime,
        upsert: true,
      });

    if (uploadError) {
      console.error('[upload-thumbnail] ❌ Storage 업로드 실패:', uploadError);
      return NextResponse.json(
        {
          success: false,
          error: `Storage 업로드 실패: ${uploadError.message}`,
        },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .getPublicUrl(filePath);

    console.log(`[upload-thumbnail] ✅ 썸네일 업로드 완료: ${trimmedUrl} → ${urlData.publicUrl}`);

    return NextResponse.json({
      success: true,
      storageUrl: urlData.publicUrl,
      originalUrl: trimmedUrl,
      message: '외부 이미지를 Supabase Storage에 저장했습니다.',
      skipped: false,
    });
  } catch (error) {
    console.error('[upload-thumbnail] 🔥 예외 발생:', error);
    return NextResponse.json(
      {
        success: false,
        error: `서버 오류: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 }
    );
  }
}
