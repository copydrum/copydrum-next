import type { SupabaseClient } from '@supabase/supabase-js';

export interface RevenueOrderRow {
  created_at: string | null;
  total_amount: number | null;
  points_used?: number | null;
  payment_method?: string | null;
}

/** 보유 캐쉬로 낸 주문. 'points' 는 결제 화면의 캐쉬 결제, 'cash' 는 예전 캐쉬 구매 경로 */
const WALLET_PAYMENT_METHODS = new Set(['cash', 'points', 'point']);

export const isWalletPaidOrder = (order: { payment_method?: string | null }): boolean =>
  WALLET_PAYMENT_METHODS.has((order.payment_method ?? '').trim().toLowerCase());

/**
 * 매출 = 실제로 받은 돈.
 * 캐쉬로 산 악보는 충전할 때 이미 매출로 잡혔고, 적립 포인트로 낸 금액은 받은 돈이 아니다.
 */
export const orderRevenue = (order: RevenueOrderRow): number =>
  isWalletPaidOrder(order)
    ? 0
    : Math.max(0, (Number(order.total_amount) || 0) - (Number(order.points_used) || 0));

export const REVENUE_ORDER_COLUMNS = 'created_at,total_amount,points_used,payment_method';

/** 완료 주문을 1,000건 제한 없이 모두 읽는다 */
export async function fetchCompletedRevenueOrders(
  client: SupabaseClient,
  range: { startIso?: string; endIso?: string } = {},
): Promise<RevenueOrderRow[]> {
  const pageSize = 1000;
  const rows: RevenueOrderRow[] = [];

  for (let page = 0; ; page += 1) {
    let query = client.from('orders').select(REVENUE_ORDER_COLUMNS).eq('status', 'completed');
    if (range.startIso) query = query.gte('created_at', range.startIso);
    if (range.endIso) query = query.lte('created_at', range.endIso);

    const { data, error } = await query
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as RevenueOrderRow[]));
    if (!data || data.length < pageSize) return rows;
  }
}
