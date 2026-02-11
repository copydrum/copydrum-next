import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ✅ Service Role Key가 있으면 Admin 권한으로 RLS 우회
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (serviceRoleKey) {
    return createClient(url, serviceRoleKey);
  }

  console.warn('[points-pay] ⚠️ Service Role Key 없음 → Anon Key 사용');
  return createClient(url, anonKey);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, amount, pointsToUse, userId } = body;

    if (!orderId || !amount || !pointsToUse || !userId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 사용자 포인트 확인
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { success: false, error: 'User profile not found' },
        { status: 404 }
      );
    }

    if (profile.credits < pointsToUse) {
      return NextResponse.json(
        { success: false, error: 'Insufficient points' },
        { status: 400 }
      );
    }

    if (pointsToUse < amount) {
      return NextResponse.json(
        { success: false, error: 'Points amount is less than order amount' },
        { status: 400 }
      );
    }

    // 트랜잭션 시작: 포인트 차감 및 주문 완료 처리
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({
        credits: profile.credits - pointsToUse,
      })
      .eq('id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('[Points Payment] Profile update error:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to deduct points' },
        { status: 500 }
      );
    }

    // 주문 상태 업데이트
    const { error: orderError } = await supabase
      .from('orders')
      .update({
        status: 'completed',
        payment_status: 'paid',
        payment_method: 'points',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (orderError) {
      console.error('[Points Payment] Order update error:', orderError);

      // 포인트 롤백
      await supabase
        .from('profiles')
        .update({
          credits: profile.credits,
        })
        .eq('id', userId);

      return NextResponse.json(
        { success: false, error: 'Failed to update order status' },
        { status: 500 }
      );
    }

    // 캐시 트랜잭션 기록
    const { error: transactionError } = await supabase
      .from('cash_transactions')
      .insert({
        user_id: userId,
        amount: -pointsToUse,
        transaction_type: 'use',
        description: `Points payment for order ${orderId}`,
        balance_after: updatedProfile.credits,
        order_id: orderId,
      });

    if (transactionError) {
      console.error('[Points Payment] Transaction log error:', transactionError);
    }

    return NextResponse.json({
      success: true,
      remainingPoints: updatedProfile.credits,
    });
  } catch (error) {
    console.error('[Points Payment] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
