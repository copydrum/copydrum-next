import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/requireUser';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { findCashChargePackage } from '@/lib/payments/cashPackages';
import { generateOrderNumber } from '@/lib/payments/orderUtils';

const CHARGE_METHODS = new Set(['card', 'bank_transfer', 'paypal', 'kakaopay']);

/**
 * 캐쉬 충전 주문 생성. 충전 금액은 패키지 금액만 허용하고, 보너스는 서버 패키지표로 정한다.
 */
export async function POST(request: NextRequest) {
  const authUser = await getAuthenticatedUser();
  if (!authUser) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  let body: { amount?: number; paymentMethod?: string; depositorName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  const chargePackage = findCashChargePackage(Number(body.amount));
  if (!chargePackage) {
    return NextResponse.json({ success: false, error: 'Invalid charge amount' }, { status: 400 });
  }

  const paymentMethod = String(body.paymentMethod ?? '');
  if (!CHARGE_METHODS.has(paymentMethod)) {
    return NextResponse.json({ success: false, error: 'Invalid payment method' }, { status: 400 });
  }

  const isBankTransfer = paymentMethod === 'bank_transfer';
  const depositorName = body.depositorName?.trim().slice(0, 50) || null;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('orders')
    .insert({
      user_id: authUser.id,
      order_number: generateOrderNumber(),
      total_amount: chargePackage.amount,
      status: 'pending',
      payment_status: isBankTransfer ? 'awaiting_deposit' : 'pending',
      raw_status: isBankTransfer ? 'awaiting_deposit' : 'pending',
      payment_method: paymentMethod,
      order_type: 'cash',
      depositor_name: depositorName,
      metadata: { type: 'cash_charge', bonusAmount: chargePackage.bonus },
    })
    .select('id, order_number')
    .single();

  if (error || !data) {
    console.error('[cash-charge-orders] 주문 생성 실패:', error);
    return NextResponse.json({ success: false, error: 'Failed to create charge order' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    orderId: data.id,
    orderNumber: data.order_number,
    amount: chargePackage.amount,
    bonus: chargePackage.bonus,
  });
}
