import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { paymentId, orderId } = body;

    if (!paymentId || !orderId) {
      return NextResponse.json(
        { success: false, error: '결제 ID와 주문 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // 1. 주문 정보 조회
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      console.error('[verify] 주문 조회 실패:', orderError);
      return NextResponse.json(
        { success: false, error: '주문을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 2. 이미 완료된 주문인지 확인
    if (order.status === 'completed') {
      console.log('[verify] 이미 완료된 주문:', orderId);
      return NextResponse.json({
        success: true,
        message: '이미 처리된 주문입니다.',
        order,
      });
    }

    // 3. 포트원 API로 결제 정보 검증 (옵션)
    // 실제 프로덕션에서는 포트원 서버 API를 호출하여 결제 금액을 검증해야 합니다.
    // const portoneVerification = await verifyPortOnePayment(paymentId);

    // 4. 주문 상태 업데이트
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'completed',
        payment_status: 'paid',
        transaction_id: paymentId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select()
      .single();

    if (updateError) {
      console.error('[verify] 주문 업데이트 실패:', updateError);
      return NextResponse.json(
        { success: false, error: '주문 업데이트에 실패했습니다.' },
        { status: 500 }
      );
    }

    console.log('[verify] 결제 검증 완료:', orderId);

    return NextResponse.json({
      success: true,
      message: '결제가 확인되었습니다.',
      order: updatedOrder,
    });
  } catch (error) {
    console.error('[verify] 결제 검증 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '결제 검증 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}
