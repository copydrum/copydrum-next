import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/requireUser';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { completeOrderAfterPayment } from '@/lib/payments/completeOrderAfterPayment';
import { getPayableAmount } from '@/lib/points/server';

/**
 * 포인트만으로 결제가 끝나는 주문(결제할 금액 0원)을 완료한다.
 * 포인트는 /api/orders/[orderId]/points 에서 이미 차감된 상태여야 한다.
 */
export async function POST(request: NextRequest) {
  const authUser = await getAuthenticatedUser();
  if (!authUser) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  let orderId: string | undefined;
  try {
    orderId = (await request.json())?.orderId;
  } catch {
    // handled below
  }
  if (!orderId) {
    return NextResponse.json({ success: false, error: 'orderId is required' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, user_id, total_amount, points_used, status, payment_status, order_type')
    .eq('id', orderId)
    .maybeSingle();

  if (error || !order) {
    return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
  }
  if (order.user_id !== authUser.id) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }
  if (order.status === 'completed') {
    return NextResponse.json({ success: true, orderId });
  }
  if (order.order_type === 'cash' || (order.points_used ?? 0) <= 0 || getPayableAmount(order) !== 0) {
    return NextResponse.json({ success: false, error: 'POINTS_DO_NOT_COVER_ORDER' }, { status: 400 });
  }

  try {
    await completeOrderAfterPayment(
      orderId,
      'reward_points',
      { transactionId: `points-${orderId}`, paymentProvider: 'reward_points' },
      supabase,
    );
  } catch (completeError) {
    console.error('[reward-points] 주문 완료 처리 실패:', { orderId, completeError });
    return NextResponse.json({ success: false, error: 'Failed to complete order' }, { status: 500 });
  }

  return NextResponse.json({ success: true, orderId });
}
