import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/requireUser';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import {
  ensureMyBookPaymentOrder,
  fulfillMyBookAfterPayment,
  loadMyBookPaymentTarget,
} from '@/lib/myBook/payment.server';
import { PointsError, releaseOrderPoints, setOrderPoints } from '@/lib/points/server';
import {
  applyCash,
  DuplicateCashTransactionError,
  getCashBalance,
  InsufficientCashError,
} from '@/lib/payments/wallet';

// 결제 직후 같은 함수에서 악보집 PDF 를 만든다
export const maxDuration = 300;

const PAID_STATUSES = ['payment_confirmed', 'in_progress', 'completed'];

/**
 * 나만의 악보집을 포인트·캐쉬로 결제한다.
 * 포인트를 먼저 차감하고, 남은 금액은 보유 캐쉬(유료+보너스)로 낸다. 캐쉬가 모자라면 부족한 금액을 돌려준다.
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
  if (PAID_STATUSES.includes(book.status)) {
    return NextResponse.json({ success: true, alreadyPaid: true });
  }
  if (book.status !== 'quoted') {
    return NextResponse.json({ success: false, error: 'NOT_PAYABLE' }, { status: 400 });
  }

  let paymentOrderId: string;
  let payable: number;
  try {
    const paymentOrder = await ensureMyBookPaymentOrder(service, book);
    paymentOrderId = paymentOrder.id;
    const result = await setOrderPoints(service, {
      orderId: paymentOrder.id,
      userId: user.id,
      points: Number(body.points) || 0,
    });
    payable = result.payable;
  } catch (error) {
    if (error instanceof PointsError) {
      return NextResponse.json({ success: false, error: error.code }, { status: 400 });
    }
    console.error('[my-book/pay/wallet] 결제 준비 실패:', { customOrderId: book.id, error });
    return NextResponse.json({ success: false, error: 'PREPARE_FAILED' }, { status: 500 });
  }

  const title = book.book_title || '나만의 악보집';
  let newCredits: number | null = null;

  if (payable > 0) {
    try {
      newCredits = await applyCash(service, {
        userId: user.id,
        amount: -payable,
        type: 'use',
        description: `나만의 악보집: ${title}`.slice(0, 200),
        orderId: paymentOrderId,
      });
    } catch (error) {
      if (error instanceof InsufficientCashError) {
        const currentCredits = await getCashBalance(service, user.id).catch(() => 0);
        return NextResponse.json({
          success: false,
          reason: 'INSUFFICIENT_CREDIT',
          payable,
          currentCredits,
          shortfall: Math.max(0, payable - currentCredits),
        });
      }
      if (error instanceof DuplicateCashTransactionError) {
        return NextResponse.json({ success: false, error: 'PAYMENT_IN_PROGRESS' }, { status: 409 });
      }
      console.error('[my-book/pay/wallet] 캐쉬 차감 실패:', { customOrderId: book.id, error });
      return NextResponse.json({ success: false, error: 'CASH_FAILED' }, { status: 500 });
    }
  }

  const { data: confirmed, error: confirmError } = await service
    .from('custom_orders')
    .update({ status: 'in_progress', updated_at: new Date().toISOString() })
    .eq('id', book.id)
    .eq('status', 'quoted')
    .select('id')
    .maybeSingle();

  if (confirmError || !confirmed) {
    // 다른 결제가 먼저 끝났거나 상태를 바꾸지 못했으면 이번에 낸 캐쉬·포인트를 돌려준다
    console.error('[my-book/pay/wallet] 결제 확인 실패, 되돌림:', { customOrderId: book.id, confirmError });
    if (payable > 0) {
      try {
        newCredits = await applyCash(service, {
          userId: user.id,
          amount: payable,
          type: 'refund',
          description: `환불: 나만의 악보집 결제 확인 실패 (${title})`.slice(0, 200),
          orderId: paymentOrderId,
        });
      } catch (refundError) {
        console.error('[my-book/pay/wallet] 캐쉬 환불 실패 (수동 확인 필요):', { paymentOrderId, refundError });
      }
    }
    const { data: paymentOrder } = await service.from('orders').select('status').eq('id', paymentOrderId).maybeSingle();
    if (paymentOrder?.status === 'pending') {
      await releaseOrderPoints(service, paymentOrderId).catch((releaseError) =>
        console.error('[my-book/pay/wallet] 포인트 복구 실패 (수동 확인 필요):', { paymentOrderId, releaseError })
      );
    }
    const { data: latest } = await service.from('custom_orders').select('status').eq('id', book.id).maybeSingle();
    if (latest && PAID_STATUSES.includes(latest.status)) {
      return NextResponse.json({ success: true, alreadyPaid: true, newCredits });
    }
    return NextResponse.json({ success: false, error: 'CONFIRM_FAILED' }, { status: 500 });
  }

  await fulfillMyBookAfterPayment(book.id, {
    method: payable > 0 ? 'cash' : 'reward_points',
    transactionId: `mybook-${payable > 0 ? 'cash' : 'points'}-${paymentOrderId}`,
    provider: payable > 0 ? 'cash' : 'reward_points',
  });

  return NextResponse.json({ success: true, newCredits });
}
