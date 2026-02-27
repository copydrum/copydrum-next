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
  { params }: { params: Promise<{ orderId: string }> | { orderId: string } }
) {
  try {
    // Next.js App Router에서 params가 Promise일 수 있으므로 처리
    const resolvedParams = params instanceof Promise ? await params : params;
    const orderId = resolvedParams.orderId;
    
    // URL에서 직접 파싱하는 fallback 방법
    let finalOrderId = orderId;
    if (!finalOrderId) {
      const url = request.nextUrl.pathname;
      const match = url.match(/\/api\/orders\/([^\/]+)\/expected-completion-date/);
      if (match && match[1]) {
        finalOrderId = match[1];
        console.log('[update-expected-completion-date] URL에서 orderId 추출:', finalOrderId);
      }
    }
    
    const { expected_completion_date } = await request.json();

    if (!finalOrderId) {
      console.error('[update-expected-completion-date] orderId 추출 실패:', {
        params: resolvedParams,
        url: request.nextUrl.pathname,
      });
      return NextResponse.json(
        { success: false, error: '주문 ID가 필요합니다.' },
        { status: 400 }
      );
    }
    
    const orderId = finalOrderId;

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
      console.error('[update-expected-completion-date] 주문 조회 실패:', {
        orderId,
        code: orderError?.code,
        message: orderError?.message,
        details: orderError?.details,
        hint: orderError?.hint,
        error: orderError,
      });
      return NextResponse.json(
        { 
          success: false, 
          error: '주문을 찾을 수 없습니다.',
          details: orderError?.message || String(orderError),
          code: orderError?.code,
        },
        { status: 404 }
      );
    }

    // 예상 완료일 업데이트
    const { error: updateError } = await supabase
      .from('orders')
      .update({ expected_completion_date })
      .eq('id', orderId);

    if (updateError) {
      console.error('[update-expected-completion-date] 업데이트 실패:', {
        orderId,
        expected_completion_date,
        code: updateError.code,
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
        error: updateError,
      });
      return NextResponse.json(
        {
          success: false,
          error: '예상 완료일 업데이트에 실패했습니다.',
          details: updateError.message || String(updateError),
          code: updateError.code,
          hint: updateError.hint,
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
