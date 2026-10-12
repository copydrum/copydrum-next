import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/requireUser';
import { createServiceRoleClient } from '@/lib/supabase/admin';

const SHEET_BUCKET = 'drum-sheets';

/** pdf_url 이 전체 URL 로 저장된 경우 버킷 안의 경로만 남긴다 */
function normalizeStoragePath(rawPath: string | null | undefined): string | null {
  let path = rawPath?.trim();
  if (!path) return null;

  if (path.startsWith('http://') || path.startsWith('https://')) {
    try {
      const segments = new URL(path).pathname.split('/').filter(Boolean);
      const bucketIndex = segments.indexOf(SHEET_BUCKET);
      if (bucketIndex >= 0 && bucketIndex < segments.length - 1) {
        path = segments.slice(bucketIndex + 1).join('/');
      } else if (segments.length > 0) {
        path = segments[segments.length - 1];
      }
    } catch {
      // 원래 값을 그대로 쓴다
    }
  }

  return path.replace(/^\/+/, '');
}

/**
 * 이전 사이트(아임웹·카페24)에서 구매한 악보 다운로드.
 * 본인 구매인지 legacy_purchases_for 로 확인한 뒤 1분짜리 서명 URL 을 돌려준다.
 */
export async function POST(request: NextRequest) {
  const authUser = await getAuthenticatedUser();
  if (!authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { legacyOrderId?: number; sheetId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const legacyOrderId = Number(body.legacyOrderId);
  const sheetId = typeof body.sheetId === 'string' ? body.sheetId : '';
  if (!Number.isInteger(legacyOrderId) || legacyOrderId <= 0 || !sheetId) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: owned, error: ownedError } = await supabase
    .rpc('legacy_purchases_for', { p_user_id: authUser.id })
    .eq('legacy_order_id', legacyOrderId)
    .eq('drum_sheet_id', sheetId)
    .limit(1);
  if (ownedError) {
    console.error('[legacy-download] 구매 확인 실패:', ownedError);
    return NextResponse.json({ error: '구매 내역을 확인하지 못했습니다.' }, { status: 500 });
  }
  if (!owned || owned.length === 0) {
    return NextResponse.json({ error: '다운로드가 제한된 주문입니다.' }, { status: 403 });
  }

  const { data: sheet } = await supabase
    .from('drum_sheets')
    .select('title, artist, pdf_url')
    .eq('id', sheetId)
    .maybeSingle();
  const pdfPath = normalizeStoragePath(sheet?.pdf_url);
  if (!pdfPath) {
    return NextResponse.json({ error: '악보 파일을 찾을 수 없습니다. 고객센터로 문의해주세요.' }, { status: 404 });
  }

  const nameParts = [sheet?.artist, sheet?.title].filter(Boolean).join(' - ');
  const downloadName = nameParts ? `${nameParts.replace(/[\\/:*?"<>|]+/g, '_')}.pdf` : `sheet-${sheetId.slice(0, 8)}.pdf`;

  const { data: signed, error: signedError } = await supabase.storage
    .from(SHEET_BUCKET)
    .createSignedUrl(pdfPath, 60, { download: downloadName });
  if (signedError || !signed?.signedUrl) {
    console.error('[legacy-download] 서명 URL 발급 실패:', signedError);
    return NextResponse.json({ error: '다운로드 링크를 만들지 못했습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
