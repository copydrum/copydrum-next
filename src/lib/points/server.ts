import type { SupabaseClient } from '@supabase/supabase-js';

export type PointsErrorCode =
  | 'INSUFFICIENT_POINTS'
  | 'POINTS_EXCEED_TOTAL'
  | 'ORDER_NOT_PENDING'
  | 'POINTS_NOT_ALLOWED'
  | 'ORDER_NOT_FOUND'
  | 'FORBIDDEN';

export class PointsError extends Error {
  constructor(public code: PointsErrorCode) {
    super(code);
    this.name = 'PointsError';
  }
}

export interface OrderPointsResult {
  pointsUsed: number;
  payable: number;
  pointBalance: number;
}

const KNOWN_CODES: PointsErrorCode[] = [
  'INSUFFICIENT_POINTS',
  'POINTS_EXCEED_TOTAL',
  'ORDER_NOT_PENDING',
  'POINTS_NOT_ALLOWED',
];

/**
 * 결제 대기 주문에 사용할 포인트를 정한다 (0 이면 사용 취소).
 * 차감·복구와 orders.points_used 갱신은 DB 함수가 한 트랜잭션으로 처리한다.
 */
export async function setOrderPoints(
  supabase: SupabaseClient,
  params: { orderId: string; userId: string; points: number },
): Promise<OrderPointsResult> {
  const { data, error } = await supabase.rpc('points_set_for_order', {
    p_order_id: params.orderId,
    p_user_id: params.userId,
    p_points: Math.max(0, Math.floor(params.points)),
  });

  if (error) {
    const code = KNOWN_CODES.find((c) => error.message?.includes(c));
    if (code) throw new PointsError(code);
    if (error.code === 'P0002') throw new PointsError('ORDER_NOT_FOUND');
    if (error.code === '42501') throw new PointsError('FORBIDDEN');
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    pointsUsed: Number(row?.used_points) || 0,
    payable: Number(row?.payable_amount) || 0,
    pointBalance: Number(row?.point_balance) || 0,
  };
}

/** 결제 대기 주문에 묶인 포인트를 되돌린다 */
export async function releaseOrderPoints(supabase: SupabaseClient, orderId: string): Promise<number> {
  const { data, error } = await supabase.rpc('points_release_order', { p_order_id: orderId });
  if (error) throw error;
  return Number(data) || 0;
}

/** 결제할 금액 = 주문 총액 - 사용한 포인트 */
export function getPayableAmount(order: { total_amount?: number | null; points_used?: number | null }): number {
  const total = Math.round(Number(order.total_amount) || 0);
  const used = Math.round(Number(order.points_used) || 0);
  return Math.max(0, total - used);
}
