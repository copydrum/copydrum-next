import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
 * 예상 완료일 업데이트 API
 * PUT /api/orders/[orderId]/expected-completion-date
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const { orderId } = params;
    const { expected_completion_date } = await request.json();

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: '주문 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    if (!expected_completion_date) {
      return NextResponse.json(
        { success: false, error: '예상 완료일이 필요합니다.' },
        { status: 400 }
      );
    }

    // 날짜 형식 검증 (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(expected_completion_date)) {
      return NextResponse.json(
        { success: false, error: '날짜 형식이 올바르지 않습니다. (YYYY-MM-DD 형식 필요)' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 주문 존재 여부 확인
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { success: false, error: '주문을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 예상 완료일 업데이트
    const { error: updateError } = await supabase
      .from('orders')
      .update({ expected_completion_date })
      .eq('id', orderId);

    if (updateError) {
      console.error('[update-expected-completion-date] 업데이트 실패:', updateError);
      return NextResponse.json(
        {
          success: false,
          error: '예상 완료일 업데이트에 실패했습니다.',
          details: updateError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '예상 완료일이 업데이트되었습니다.',
      expected_completion_date,
    });
  } catch (error) {
    console.error('[update-expected-completion-date] 예외 발생:', error);
    return NextResponse.json(
      {
        success: false,
        error: '예상 완료일 업데이트 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
