import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { completeOrderAfterPayment } from '@/lib/payments/completeOrderAfterPayment';

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (serviceRoleKey) {
    return createClient(url, serviceRoleKey);
  }

  return createClient(url, anonKey);
}

/**
 * 주문 완료 처리 API
 * POST /api/orders/complete
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, paymentMethod, transactionId, paymentConfirmedAt, paymentProvider, depositorName, metadata } = body;

    if (!orderId || !paymentMethod) {
      return NextResponse.json(
        { success: false, error: 'orderId와 paymentMethod가 필요합니다.' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 주문 존재 여부 확인
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, payment_status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { success: false, error: '주문을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 이미 완료된 주문인지 확인
    if (order.payment_status === 'paid' || order.status === 'completed') {
      console.log('[orders/complete] 이미 완료된 주문:', { orderId });
      return NextResponse.json({
        success: true,
        message: '이미 완료된 주문입니다.',
        orderId,
      });
    }

    // completeOrderAfterPayment 호출
    await completeOrderAfterPayment(orderId, paymentMethod, {
      transactionId,
      paymentConfirmedAt: paymentConfirmedAt || new Date().toISOString(),
      paymentProvider,
      depositorName,
      metadata,
    });

    return NextResponse.json({
      success: true,
      message: '주문 완료 처리되었습니다.',
      orderId,
    });
  } catch (error) {
    console.error('[orders/complete] 예외 발생:', error);
    return NextResponse.json(
      {
        success: false,
        error: '주문 완료 처리 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
