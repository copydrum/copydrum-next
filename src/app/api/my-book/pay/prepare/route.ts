import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/requireUser';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { ensureMyBookPaymentOrder, loadMyBookPaymentTarget } from '@/lib/myBook/payment.server';
import { PointsError, setOrderPoints } from '@/lib/points/server';

/**
 * 카드·카카오페이 결제창을 열기 직전에 사용할 포인트를 결제용 주문에 적용하고, 카드로 낼 금액을 돌려준다.
 * 결제 검증(verify-custom-order)은 이 주문의 "주문 금액 - 사용 포인트" 와 결제 금액을 대조한다.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { customOrderId?: string; points?: number };
  if (!body.customOrderId) {
    return NextResponse.json({ success: false, error: 'customOrderId required' }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const book = await loadMyBookPaymentTarget(service, body.customOrderId).catch(() => null);
  if (!book || book.user_id !== user.id || book.order_type !== 'book') {
    return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
  }
  if (book.status !== 'quoted') {
    return NextResponse.json({ success: false, error: 'ALREADY_PAID' }, { status: 409 });
  }

  try {
    const paymentOrder = await ensureMyBookPaymentOrder(service, book);
    const result = await setOrderPoints(service, {
      orderId: paymentOrder.id,
      userId: user.id,
      points: Number(body.points) || 0,
    });
    return NextResponse.json({ success: true, payable: result.payable, pointsUsed: result.pointsUsed });
  } catch (error) {
    if (error instanceof PointsError) {
      return NextResponse.json({ success: false, error: error.code }, { status: 400 });
    }
    console.error('[my-book/pay/prepare] 결제 준비 실패:', { customOrderId: book.id, error });
    return NextResponse.json({ success: false, error: 'PREPARE_FAILED' }, { status: 500 });
  }
}
