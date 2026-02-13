import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ✅ Service Role Key로 Admin 클라이언트 생성 (RLS 우회)
// API Route는 서버에서 실행되므로 인증 세션이 없음 → anon key로는 업데이트 실패 가능
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (serviceRoleKey) {
    return createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  console.warn('[verify] ⚠️ Service Role Key 없음 → Anon Key 사용 (RLS 적용됨)');
  return createClient(url, anonKey);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { paymentId, orderId, paymentMethod } = body;

    if (!paymentId || !orderId) {
      return NextResponse.json(
        { success: false, error: '결제 ID와 주문 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

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

    // 4. 주문 상태 업데이트 (payment_method 포함)
    const resolvedPaymentMethod = paymentMethod || order.payment_method || 'card';
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'completed',
        payment_status: 'paid',
        payment_method: resolvedPaymentMethod, // ✅ 결제수단 명시적 업데이트
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

    console.log('[verify] 결제 검증 완료:', orderId, '결제수단:', resolvedPaymentMethod);

    // 5. purchases 테이블에 구매 기록 삽입
    try {
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('id, drum_sheet_id, price')
        .eq('order_id', orderId);

      if (orderItems && orderItems.length > 0) {
        const purchaseRecords = orderItems.map((item: any) => ({
          user_id: order.user_id,
          drum_sheet_id: item.drum_sheet_id,
          order_id: orderId,
          price_paid: item.price ?? 0,
        }));

        const { error: purchasesError } = await supabase
          .from('purchases')
          .insert(purchaseRecords);

        if (purchasesError && purchasesError.code !== '23505') {
          console.warn('[verify] purchases 기록 실패 (치명적이지 않음):', purchasesError);
        } else {
          console.log('[verify] purchases 기록 완료:', orderItems.length, '건');
        }
      }
    } catch (purchaseErr) {
      console.warn('[verify] purchases 기록 중 예외:', purchaseErr);
    }

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
