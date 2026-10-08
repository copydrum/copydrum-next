import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/requireUser';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import {
  findCashChargePackage,
  getCashChargeMethods,
  getCashChargeRegion,
  type CashChargeMethod,
} from '@/lib/payments/cashPackages';
import { generateOrderNumber } from '@/lib/payments/orderUtils';

/**
 * 캐쉬 충전 주문 생성. 사이트 언어로 정한 지역의 충전 상품·결제수단만 허용한다.
 * 보너스는 결제 완료 때 DB 충전 상품 표로 정해진다.
 */
export async function POST(request: NextRequest) {
  const authUser = await getAuthenticatedUser();
  if (!authUser) {
    return NextResponse.json({ success: false, error: 'AUTH_REQUIRED' }, { status: 401 });
  }

  let body: { amount?: number; paymentMethod?: string; locale?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const region = getCashChargeRegion(body.locale);
  const chargePackage = findCashChargePackage(region, Number(body.amount));
  if (!chargePackage) {
    return NextResponse.json({ success: false, error: 'INVALID_AMOUNT' }, { status: 400 });
  }

  const paymentMethod = String(body.paymentMethod ?? '') as CashChargeMethod;
  if (!getCashChargeMethods(region).includes(paymentMethod)) {
    return NextResponse.json({ success: false, error: 'INVALID_METHOD' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('orders')
    .insert({
      user_id: authUser.id,
      order_number: generateOrderNumber(),
      total_amount: chargePackage.amount,
      status: 'pending',
      payment_status: 'pending',
      raw_status: 'pending',
      payment_method: paymentMethod,
      order_type: 'cash',
      metadata: {
        type: 'cash_charge',
        bonusAmount: chargePackage.bonus,
        region,
        locale: body.locale ?? null,
      },
    })
    .select('id, order_number')
    .single();

  if (error || !data) {
    console.error('[cash-charge-orders] 주문 생성 실패:', error);
    return NextResponse.json({ success: false, error: 'CREATE_FAILED' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    orderId: data.id,
    orderNumber: data.order_number,
    amount: chargePackage.amount,
    bonus: chargePackage.bonus,
  });
}
