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
 * 예상 완료일 일괄 업데이트 API
 * PUT /api/orders/bulk-update-expected-completion-date
 * 
 * 여러 주문의 예상 완료일을 한 번에 업데이트합니다.
 * 선주문 상품이 포함된 주문만 업데이트됩니다.
 */
export async function PUT(request: NextRequest) {
  try {
    const { orderIds, expected_completion_date } = await request.json();

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        { success: false, error: '주문 ID 배열이 필요합니다.' },
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

    // 1단계: 선택된 주문들의 order_items를 조회하여 선주문 상품이 포함된 주문만 필터링
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select(
        `
        id,
        order_items (
          id,
          drum_sheet_id,
          drum_sheets (
            id,
            sales_type
          )
        )
      `
      )
      .in('id', orderIds);

    if (ordersError) {
      console.error('[bulk-update-expected-completion-date] 주문 조회 실패:', {
        code: ordersError.code,
        message: ordersError.message,
        details: ordersError.details,
        hint: ordersError.hint,
        error: ordersError,
      });
      return NextResponse.json(
        {
          success: false,
          error: '주문 정보를 조회하는 중 오류가 발생했습니다.',
          details: ordersError.message || String(ordersError),
          code: ordersError.code,
          hint: ordersError.hint,
        },
        { status: 500 }
      );
    }

    if (!ordersData || ordersData.length === 0) {
      return NextResponse.json(
        { success: false, error: '선택한 주문을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 2단계: 선주문 상품이 포함된 주문 ID만 필터링
    const preorderOrderIds: string[] = [];

    for (const order of ordersData) {
      const orderItems = order.order_items || [];
      
      // 이 주문에 선주문 상품이 포함되어 있는지 확인
      const hasPreorderItems = orderItems.some((item: any) => {
        const salesType = item.drum_sheets?.sales_type;
        return salesType === 'PREORDER';
      });

      if (hasPreorderItems) {
        preorderOrderIds.push(order.id);
      }
    }

    if (preorderOrderIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: '선택한 주문 중 선주문 상품이 포함된 주문이 없습니다.',
          details: '일반 다운로드 상품만 포함된 주문은 예상 완료일을 설정할 수 없습니다.',
        },
        { status: 400 }
      );
    }

    // 3단계: 선주문 상품이 포함된 주문만 업데이트
    // 방어 로직: WHERE 절에서 선주문 상품이 포함된 주문만 업데이트
    // 하지만 Supabase는 WHERE 절에서 중첩된 관계를 직접 필터링할 수 없으므로,
    // 먼저 필터링한 ID 배열만 사용하여 업데이트합니다.
    
    const { data: updateData, error: updateError } = await supabase
      .from('orders')
      .update({ expected_completion_date })
      .in('id', preorderOrderIds)
      .select('id, expected_completion_date');

    if (updateError) {
      console.error('[bulk-update-expected-completion-date] 업데이트 실패:', updateError);
      return NextResponse.json(
        {
          success: false,
          error: '예상 완료일 업데이트에 실패했습니다.',
          details: updateError.message,
        },
        { status: 500 }
      );
    }

    const updatedCount = updateData?.length || 0;
    const skippedCount = orderIds.length - preorderOrderIds.length;

    return NextResponse.json({
      success: true,
      message: '예상 완료일이 업데이트되었습니다.',
      updatedCount,
      skippedCount,
      updatedOrderIds: preorderOrderIds,
      skippedOrderIds: orderIds.filter((id: string) => !preorderOrderIds.includes(id)),
      expected_completion_date,
    });
  } catch (error) {
    console.error('[bulk-update-expected-completion-date] 예외 발생:', error);
    return NextResponse.json(
      {
        success: false,
        error: '예상 완료일 일괄 업데이트 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
