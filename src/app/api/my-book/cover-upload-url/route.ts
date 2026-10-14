import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getAuthenticatedUser } from '@/lib/auth/requireUser';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { getCoverExtension, MY_BOOK_COVER_MAX_BYTES } from '@/lib/myBook/pricing';

/**
 * 나만의 악보집 표지 업로드용 서명 URL 발급.
 * 파일은 브라우저가 스토리지로 바로 올린다 (API 요청 본문 크기 제한 회피).
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { fileName?: string; fileSize?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const ext = getCoverExtension(String(body.fileName ?? ''));
  if (!ext) {
    return NextResponse.json(
      { success: false, error: '표지는 jpg, png, pdf 파일만 올릴 수 있습니다.' },
      { status: 400 }
    );
  }
  if (Number(body.fileSize) > MY_BOOK_COVER_MAX_BYTES) {
    return NextResponse.json(
      { success: false, error: '표지 파일은 10MB 이하만 올릴 수 있습니다.' },
      { status: 400 }
    );
  }

  const path = `${user.id}/my-book/${randomUUID()}.${ext}`;
  const service = createServiceRoleClient();
  const { data, error } = await service.storage.from('custom-orders').createSignedUploadUrl(path);

  if (error || !data) {
    console.error('[my-book/cover-upload-url] 서명 URL 발급 실패:', error);
    return NextResponse.json(
      { success: false, error: '표지 업로드를 준비하지 못했습니다.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, path: data.path, token: data.token });
}
