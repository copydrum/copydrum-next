import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, orderId, amount } = body;

    if (!userId || !orderId || !amount) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // 1. 사용자 포인트 조회
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error('[point-deduct] 사용자 조회 실패:', profileError);
      return NextResponse.json(
        { success: false, error: '사용자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const currentCredits = profile.credits || 0;

    // 2. 포인트 잔액 확인
    if (currentCredits < amount) {
      return NextResponse.json(
        {
          success: false,
          error: '포인트가 부족합니다.',
          current: currentCredits,
          required: amount,
        },
        { status: 400 }
      );
    }

    // 3. 주문 정보 조회
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      console.error('[point-deduct] 주문 조회 실패:', orderError);
      return NextResponse.json(
        { success: false, error: '주문을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 4. 이미 완료된 주문인지 확인
    if (order.status === 'completed') {
      return NextResponse.json({
        success: true,
        message: '이미 처리된 주문입니다.',
        order,
      });
    }

    // 5. 포인트 차감
    const newCredits = currentCredits - amount;
    const { error: updateCreditsError } = await supabase
      .from('profiles')
      .update({ credits: newCredits })
      .eq('id', userId);

    if (updateCreditsError) {
      console.error('[point-deduct] 포인트 차감 실패:', updateCreditsError);
      return NextResponse.json(
        { success: false, error: '포인트 차감에 실패했습니다.' },
        { status: 500 }
      );
    }

    // 6. 주문 상태 업데이트
    const { data: updatedOrder, error: updateOrderError } = await supabase
      .from('orders')
      .update({
        status: 'completed',
        payment_status: 'paid',
        payment_method: 'credits',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select()
      .single();

    if (updateOrderError) {
      // 롤백: 포인트 복구
      await supabase
        .from('profiles')
        .update({ credits: currentCredits })
        .eq('id', userId);

      console.error('[point-deduct] 주문 업데이트 실패:', updateOrderError);
      return NextResponse.json(
        { success: false, error: '주문 처리에 실패했습니다.' },
        { status: 500 }
      );
    }

    // 7. 포인트 사용 내역 기록 (cash_transactions 테이블이 있다면)
    try {
      await supabase.from('cash_transactions').insert({
        user_id: userId,
        amount: -amount,
        transaction_type: 'purchase',
        description: `주문 결제: ${orderId}`,
        status: 'completed',
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.warn('[point-deduct] 포인트 사용 내역 기록 실패 (중요하지 않음):', error);
    }

    console.log('[point-deduct] 포인트 결제 완료:', {
      userId,
      orderId,
      deducted: amount,
      remaining: newCredits,
    });

    return NextResponse.json({
      success: true,
      message: '포인트 결제가 완료되었습니다.',
      order: updatedOrder,
      remainingCredits: newCredits,
    });
  } catch (error) {
    console.error('[point-deduct] 포인트 결제 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '포인트 결제 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}
