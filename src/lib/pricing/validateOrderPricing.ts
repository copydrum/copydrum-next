import type { SupabaseClient } from '@supabase/supabase-js';

export interface PricedOrderItem {
  sheetId: string;
  price: number;
}

/**
 * 🔒 서버 측 주문 금액 검증.
 * 클라이언트가 보낸 amount/item.price 를 그대로 신뢰하지 않고,
 * 서버가 신뢰하는 가격(정가 또는 활성 이벤트 할인가)과 모음집 할인가를 기준으로
 * 주문 총액이 정당한 최소 금액 이상인지 검증한다.
 *
 * - 일반/장바구니 주문: 총액 >= Σ(각 곡의 할인 적용가)  (언더프라이싱 차단)
 * - 모음집 주문: 곡별 가격이 sale_price 비례 배분이므로 개별 단가보다 낮을 수 있음.
 *   → 동일 구성의 활성 모음집(sale_price == amount)이 존재하면 정당한 것으로 인정.
 *
 * @returns null 이면 통과, 문자열이면 거절 사유
 */
export async function validateOrderPricing(
  supabase: SupabaseClient,
  items: PricedOrderItem[],
  amount: number
): Promise<string | null> {
  const requestedIds: string[] = items.map((it) => it?.sheetId).filter(Boolean);
  if (requestedIds.length === 0) {
    return '유효한 상품이 없습니다.';
  }

  // amount 와 item.price 합계의 정합성 + 음수/비정수 차단
  let itemsSum = 0;
  for (const it of items) {
    const p = Number(it?.price);
    if (!Number.isFinite(p) || p < 0) {
      return '상품 가격이 올바르지 않습니다.';
    }
    itemsSum += Math.round(p);
  }
  const orderAmount = Math.round(Number(amount));
  if (!Number.isFinite(orderAmount) || orderAmount < 0) {
    return '주문 금액이 올바르지 않습니다.';
  }
  if (itemsSum !== orderAmount) {
    return '주문 금액과 상품 금액 합계가 일치하지 않습니다.';
  }

  // 요청된 곡들의 서버 기준 정가 조회 (존재 검증 포함)
  const { data: sheetRows, error: sheetsError } = await supabase
    .from('drum_sheets')
    .select('id, price')
    .in('id', requestedIds);

  if (sheetsError) {
    console.error('[validateOrderPricing] drum_sheets 조회 실패:', sheetsError);
    return '상품 정보를 확인할 수 없습니다.';
  }

  const priceMap = new Map<string, number>();
  for (const row of sheetRows || []) {
    priceMap.set(row.id, Math.max(0, Math.round(Number(row.price) || 0)));
  }

  // 존재하지 않는 상품이 포함되면 거절
  for (const id of requestedIds) {
    if (!priceMap.has(id)) {
      return '존재하지 않는 상품이 포함되어 있습니다.';
    }
  }

  // 활성 이벤트 할인가 적용 → 곡별 최저 정당 가격
  const nowIso = new Date().toISOString();
  const { data: discountRows } = await supabase
    .from('event_discount_sheet_view')
    .select('sheet_id, discount_price, is_active, event_start, event_end')
    .in('sheet_id', requestedIds)
    .eq('is_active', true)
    .lte('event_start', nowIso)
    .gte('event_end', nowIso);

  const discountMap = new Map<string, number>();
  for (const row of discountRows || []) {
    const dp = Math.max(0, Math.round(Number(row.discount_price) || 0));
    discountMap.set(row.sheet_id, dp);
  }

  // 곡별 할인 적용가 합계 = 정당한 최소 총액(floor)
  let floor = 0;
  for (const id of requestedIds) {
    const base = priceMap.get(id) ?? 0;
    const discounted = discountMap.has(id) ? Math.min(base, discountMap.get(id)!) : base;
    floor += discounted;
  }

  if (orderAmount >= floor) {
    return null; // 정상 (일반/장바구니/할인 주문)
  }

  // floor 미만 → 모음집(번들) 주문인지 확인
  // 동일하게 활성화되어 있고 sale_price == amount 인 모음집 중,
  // 요청 곡 구성과 정확히 일치하는 것이 있으면 정당한 모음집 결제로 인정.
  const { data: candidateCollections } = await supabase
    .from('collections')
    .select('id, sale_price')
    .eq('is_active', true)
    .eq('sale_price', orderAmount);

  if (candidateCollections && candidateCollections.length > 0) {
    const collectionIds = candidateCollections.map((c) => c.id);
    const { data: collectionSheetRows } = await supabase
      .from('collection_sheets')
      .select('collection_id, drum_sheet_id')
      .in('collection_id', collectionIds);

    const grouped = new Map<string, Set<string>>();
    for (const row of collectionSheetRows || []) {
      if (!grouped.has(row.collection_id)) grouped.set(row.collection_id, new Set());
      grouped.get(row.collection_id)!.add(row.drum_sheet_id);
    }

    const requestedSet = new Set(requestedIds);
    for (const [, sheetSet] of grouped) {
      if (
        sheetSet.size === requestedSet.size &&
        [...requestedSet].every((id) => sheetSet.has(id))
      ) {
        return null; // 정당한 모음집 결제
      }
    }
  }

  return '주문 금액이 정상 가격보다 낮습니다.';
}
