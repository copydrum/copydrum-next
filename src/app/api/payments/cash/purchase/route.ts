import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/requireUser';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { validateOrderPricing } from '@/lib/pricing/validateOrderPricing';
import { generateOrderNumber } from '@/lib/payments/orderUtils';
import { completeOrderAfterPayment } from '@/lib/payments/completeOrderAfterPayment';
import {
  applyCash,
  getCashBalance,
  InsufficientCashError,
} from '@/lib/payments/wallet';

interface CashPurchaseRequestItem {
  sheetId: string;
  sheetTitle?: string | null;
  price: number;
}

/**
 * 보유 캐쉬로 악보 구매.
 * 가격 검증 → 주문 생성 → 캐쉬 차감 → 주문 완료를 서버에서 처리한다.
 */
export async function POST(request: NextRequest) {
  const authUser = await getAuthenticatedUser();
  if (!authUser) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  let body: {
    items?: CashPurchaseRequestItem[];
    totalPrice?: number;
    description?: string;
    sheetIdForTransaction?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items.filter((item) => item?.sheetId) : [];
  const totalPrice = Math.max(0, Math.round(Number(body.totalPrice) || 0));
  const description = (body.description ?? '').slice(0, 200);

  if (items.length === 0) {
    return NextResponse.json({ success: false, error: 'No items' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const pricingError = await validateOrderPricing(
    supabase,
    items.map((item) => ({ sheetId: item.sheetId, price: Number(item.price) })),
    totalPrice
  );
  if (pricingError) {
    console.warn('[cash-purchase] ⛔ 가격 검증 실패:', { userId: authUser.id, totalPrice, reason: pricingError });
    return NextResponse.json({ success: false, error: pricingError }, { status: 400 });
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: authUser.id,
      order_number: generateOrderNumber(),
      total_amount: totalPrice,
      status: 'pending',
      payment_status: 'pending',
      payment_method: 'cash',
      order_type: 'product',
      metadata: { type: 'sheet_purchase', description },
    })
    .select('id')
    .single();

  if (orderError || !order) {
    console.error('[cash-purchase] 주문 생성 실패:', orderError);
    return NextResponse.json({ success: false, error: 'Failed to create order' }, { status: 500 });
  }

  const orderId = order.id as string;
  const discardOrder = async () => {
    await supabase.from('order_items').delete().eq('order_id', orderId);
    await supabase.from('orders').delete().eq('id', orderId);
  };

  const { error: itemsError } = await supabase.from('order_items').insert(
    items.map((item) => ({
      order_id: orderId,
      drum_sheet_id: item.sheetId,
      sheet_title: item.sheetTitle ?? '제목 미등록',
      price: Math.max(0, Math.round(Number(item.price) || 0)),
    }))
  );

  if (itemsError) {
    console.error('[cash-purchase] order_items 생성 실패:', itemsError);
    await discardOrder();
    return NextResponse.json({ success: false, error: 'Failed to create order items' }, { status: 500 });
  }

  const transactionSheetId =
    body.sheetIdForTransaction ?? (items.length === 1 ? items[0].sheetId : null);

  let newCredits: number;
  if (totalPrice > 0) {
    try {
      newCredits = await applyCash(supabase, {
        userId: authUser.id,
        amount: -totalPrice,
        type: 'use',
        description,
        orderId,
        sheetId: transactionSheetId,
      });
    } catch (error) {
      await discardOrder();
      if (error instanceof InsufficientCashError) {
        const currentCredits = await getCashBalance(supabase, authUser.id).catch(() => 0);
        return NextResponse.json({ success: false, reason: 'INSUFFICIENT_CREDIT', currentCredits });
      }
      console.error('[cash-purchase] 캐쉬 차감 실패:', error);
      return NextResponse.json({ success: false, error: 'Failed to deduct cash' }, { status: 500 });
    }
  } else {
    newCredits = await getCashBalance(supabase, authUser.id);
  }

  try {
    await completeOrderAfterPayment(
      orderId,
      'cash',
      { transactionId: `cash-${orderId}`, paymentProvider: 'cash' },
      supabase
    );
  } catch (error) {
    console.error('[cash-purchase] 주문 완료 처리 실패, 캐쉬 환불:', { orderId, error });
    if (totalPrice > 0) {
      try {
        await applyCash(supabase, {
          userId: authUser.id,
          amount: totalPrice,
          type: 'refund',
          description: `환불: 주문 완료 처리 실패 (${orderId})`,
          orderId,
        });
      } catch (refundError) {
        console.error('[cash-purchase] 캐쉬 환불 실패 (수동 확인 필요):', { orderId, refundError });
      }
    }
    await supabase
      .from('orders')
      .update({ status: 'cancelled', payment_status: 'cancelled' })
      .eq('id', orderId);
    return NextResponse.json({ success: false, error: 'Failed to complete order' }, { status: 500 });
  }

  return NextResponse.json({ success: true, newCredits, orderId });
}
