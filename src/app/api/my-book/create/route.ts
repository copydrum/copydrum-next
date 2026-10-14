import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/requireUser';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import {
  calculateMyBookPrice,
  MY_BOOK_MAX_SONGS,
  MY_BOOK_MEMO_MAX_LENGTH,
  MY_BOOK_MIN_SONGS,
  MY_BOOK_TITLE_MAX_LENGTH,
} from '@/lib/myBook/pricing';
import {
  getMyBookIneligibleReason,
  MY_BOOK_SHEET_COLUMNS,
  type MyBookSheetRow,
} from '@/lib/myBook/catalog';
import { fetchOwnedSheetIdsOnServer } from '@/lib/myBook/ownership.server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CreateMyBookBody {
  sheetIds?: unknown;
  title?: unknown;
  memo?: unknown;
  coverPath?: unknown;
  coverFileName?: unknown;
  agreed?: unknown;
}

const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ success: false, error, ...extra }, { status });

/**
 * 나만의 악보집 주문 생성.
 * 금액은 DB 정가와 구매내역으로 서버에서 계산하고, 바로 결제할 수 있도록 status='quoted' 로 만든다.
 * 결제 검증은 기존 /api/payments/portone/verify-custom-order 가 estimated_price 와 대조한다.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return fail('로그인이 필요합니다.', 401);

  let body: CreateMyBookBody;
  try {
    body = await request.json();
  } catch {
    return fail('잘못된 요청입니다.');
  }

  const rawIds = Array.isArray(body.sheetIds) ? body.sheetIds.map((id) => String(id ?? '').trim()) : [];
  const sheetIds = rawIds.filter((id) => UUID_RE.test(id));
  if (sheetIds.length !== rawIds.length) return fail('곡 정보가 올바르지 않습니다.');
  if (new Set(sheetIds).size !== sheetIds.length) return fail('같은 곡이 두 번 담겨 있습니다.');
  if (sheetIds.length < MY_BOOK_MIN_SONGS) return fail(`최소 ${MY_BOOK_MIN_SONGS}곡 이상 담아 주세요.`);
  if (sheetIds.length > MY_BOOK_MAX_SONGS) return fail(`최대 ${MY_BOOK_MAX_SONGS}곡까지 담을 수 있습니다.`);

  const title = String(body.title ?? '').trim();
  if (!title) return fail('악보집 제목을 입력해 주세요.');
  if (title.length > MY_BOOK_TITLE_MAX_LENGTH) {
    return fail(`악보집 제목은 ${MY_BOOK_TITLE_MAX_LENGTH}자 이내로 입력해 주세요.`);
  }

  const memo = String(body.memo ?? '').trim().slice(0, MY_BOOK_MEMO_MAX_LENGTH);
  if (body.agreed !== true) return fail('제작 및 환불 안내에 동의해 주세요.');

  const coverPath = body.coverPath ? String(body.coverPath) : null;
  if (coverPath && !coverPath.startsWith(`${user.id}/my-book/`)) {
    return fail('표지 파일 정보가 올바르지 않습니다.');
  }
  const coverFileName = coverPath ? String(body.coverFileName ?? '').slice(0, 200) || null : null;

  const service = createServiceRoleClient();

  const { data: sheetRows, error: sheetError } = await service
    .from('drum_sheets')
    .select(MY_BOOK_SHEET_COLUMNS)
    .in('id', sheetIds);
  if (sheetError) {
    console.error('[my-book/create] 악보 조회 실패:', sheetError);
    return fail('곡 정보를 확인하지 못했습니다.', 500);
  }

  // 결제 즉시 자동 제작하므로 원본 PDF 가 없는 곡은 받지 않는다 (pdf_url 은 브라우저에 내려주지 않도록 서버에서만 확인)
  const { data: pdfRows, error: pdfError } = await service
    .from('drum_sheets')
    .select('id, pdf_url')
    .in('id', sheetIds);
  if (pdfError) {
    console.error('[my-book/create] 악보 파일 확인 실패:', pdfError);
    return fail('곡 정보를 확인하지 못했습니다.', 500);
  }
  const hasPdf = new Set(
    ((pdfRows ?? []) as Array<{ id: string; pdf_url: string | null }>)
      .filter((row) => row.pdf_url?.trim())
      .map((row) => row.id)
  );

  const sheetsById = new Map(((sheetRows ?? []) as unknown as MyBookSheetRow[]).map((row) => [row.id, row]));
  const unavailable = sheetIds.filter((id) => {
    const sheet = sheetsById.get(id);
    return !sheet || getMyBookIneligibleReason(sheet) !== null || !hasPdf.has(id);
  });
  if (unavailable.length > 0) {
    return fail('악보집에 담을 수 없는 곡이 있습니다. 목록을 다시 확인해 주세요.', 400, {
      unavailableSheetIds: unavailable,
    });
  }

  let owned: Set<string>;
  try {
    owned = await fetchOwnedSheetIdsOnServer(service, user.id, sheetIds);
  } catch (ownErr) {
    console.error('[my-book/create] 구매내역 조회 실패:', ownErr);
    return fail('구매 내역을 확인하지 못했습니다.', 500);
  }

  const items = sheetIds.map((id, index) => {
    const sheet = sheetsById.get(id)!;
    return {
      drum_sheet_id: id,
      sheet_title: sheet.title,
      artist: sheet.artist,
      position: index + 1,
      list_price: Math.max(0, Math.round(sheet.price ?? 0)),
      is_owned: owned.has(id),
    };
  });

  const price = calculateMyBookPrice(
    items.map((item) => ({ listPrice: item.list_price, isOwned: item.is_owned }))
  );

  const { data: profile } = await service
    .from('profiles')
    .select('name, email')
    .eq('id', user.id)
    .maybeSingle<{ name: string | null; email: string | null }>();
  const email = user.email || profile?.email || '';
  const name = profile?.name || user.user_metadata?.name || email.split('@')[0] || '고객';

  const { data: order, error: orderError } = await service
    .from('custom_orders')
    .insert({
      user_id: user.id,
      name,
      email,
      phone: '',
      song_title: title,
      artist: `${items.length}곡`,
      requirements: memo,
      status: 'quoted',
      estimated_price: price.finalPrice,
      max_download_count: 20,
      locale: 'ko',
      order_type: 'book',
      book_title: title,
      cover_file_path: coverPath,
      cover_file_name: coverFileName,
      book_item_count: items.length,
      book_list_price: price.listTotal,
      book_discount_rate: price.discountPercent,
    })
    .select('id')
    .single();

  if (orderError || !order) {
    console.error('[my-book/create] 주문 생성 실패:', orderError);
    return fail('주문을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
  }

  const { error: itemsError } = await service
    .from('custom_order_items')
    .insert(items.map((item) => ({ ...item, custom_order_id: order.id })));

  if (itemsError) {
    console.error('[my-book/create] 곡 목록 저장 실패:', itemsError);
    await service.from('custom_orders').delete().eq('id', order.id);
    return fail('주문을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
  }

  return NextResponse.json({
    success: true,
    orderId: order.id,
    finalPrice: price.finalPrice,
    discountPercent: price.discountPercent,
    ownedCount: price.ownedCount,
  });
}
