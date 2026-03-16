import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ✅ Service Role Key가 있으면 Admin 권한으로 RLS 우회
// 없으면 Anon Key로 폴백 (이 경우 RLS 정책에 의존)
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (serviceRoleKey) {
    console.log('[create-order] ✅ Service Role Key 사용 (Admin 권한, RLS 우회)');
    return createClient(url, serviceRoleKey);
  }

  console.warn('[create-order] ⚠️ Service Role Key 없음 → Anon Key 사용 (RLS 적용됨)');
  return createClient(url, anonKey);
}

export async function POST(request: NextRequest) {
  try {
    const { userId, items, amount, description, paymentMethod } = await request.json();

    // ============================================================
    // 입력 검증
    // ============================================================
    if (!userId || !items || !Array.isArray(items) || items.length === 0 || !amount) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // ============================================================
    // Upsert 로직: 동일 유저 + 동일 장바구니 + 동일 금액의 pending 주문 재활용
    // → PayPal 등에서 체크아웃 페이지 재진입 시 결제대기 주문이 중복 생성되는 것 방지
    // ============================================================

    // 요청된 아이템의 sheetId 목록을 정렬하여 비교용 키 생성
    const requestedSheetIds = items
      .map((item: any) => item.sheetId)
      .filter(Boolean)
      .sort();

    // 동일 유저의 pending 상태 주문 중 동일 금액인 것 조회
    const { data: existingPendingOrders } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        total_amount,
        order_items (
          drum_sheet_id
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .eq('total_amount', amount)
      .order('created_at', { ascending: false });

    if (existingPendingOrders && existingPendingOrders.length > 0) {
      // 아이템 구성까지 동일한 기존 주문 찾기
      for (const existingOrder of existingPendingOrders) {
        const existingSheetIds = (existingOrder.order_items || [])
          .map((item: any) => item.drum_sheet_id)
          .filter(Boolean)
          .sort();

        // 아이템 개수 및 구성이 완전히 동일한지 비교
        const isSameItems =
          existingSheetIds.length === requestedSheetIds.length &&
          existingSheetIds.every((id: string, idx: number) => id === requestedSheetIds[idx]);

        if (isSameItems) {
          // ✅ 기존 pending 주문 재활용: updated_at만 갱신
          await supabase
            .from('orders')
            .update({
              updated_at: new Date().toISOString(),
              payment_method: paymentMethod || null, // 결제수단이 바뀔 수 있으므로 갱신
            })
            .eq('id', existingOrder.id);

          console.log('[create-order] ♻️ 기존 pending 주문 재활용:', {
            orderId: existingOrder.id,
            orderNumber: existingOrder.order_number,
          });

          return NextResponse.json({
            success: true,
            orderId: existingOrder.id,
            orderNumber: existingOrder.order_number,
            reused: true, // 기존 주문 재활용 여부
          });
        }
      }
    }

    // ============================================================
    // 기존 pending 주문 없음 → 새 주문 생성
    // ============================================================
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    const orderNumber = `ORDER-${dateStr}-${randomStr}`;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: userId,
        order_number: orderNumber,
        total_amount: amount,
        status: 'pending',
        payment_status: 'pending',
        payment_method: paymentMethod || null,
        order_type: 'product',
        metadata: {
          type: 'sheet_purchase',
          description,
        },
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error('[create-order] ❌ 주문 생성 실패:', orderError);
      return NextResponse.json(
        {
          success: false,
          error: '주문 생성에 실패했습니다.',
          details: orderError?.message,
          code: orderError?.code,
        },
        { status: 500 }
      );
    }

    console.log('[create-order] ✅ 새 주문 생성 성공:', {
      orderId: order.id,
      orderNumber: order.order_number,
    });

    // ============================================================
    // 2단계: 주문 아이템(order_items) 생성
    // ============================================================
    // 프론트엔드 필드명 → DB 컬럼명 명시적 매핑
    //   item.sheetId  → drum_sheet_id  (FK → drum_sheets.id)
    //   item.title    → sheet_title
    //   item.price    → price
    const orderItems = items.map((item: any) => ({
      order_id: order.id,
      drum_sheet_id: item.sheetId,              // 👈 sheetId → drum_sheet_id 매핑
      sheet_title: item.title || '제목 미확인',   // 👈 title → sheet_title 매핑
      price: Math.max(0, Math.round(item.price ?? 0)),
    }));

    console.log('[create-order] 📦 order_items 삽입 데이터:', JSON.stringify(orderItems, null, 2));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsError) {
      console.error('[create-order] ❌ 주문 아이템 생성 실패:', {
        message: itemsError.message,
        details: itemsError.details,
        hint: itemsError.hint,
        code: itemsError.code,
      });

      // 아이템 생성 실패 시 주문도 롤백(삭제)
      await supabase.from('orders').delete().eq('id', order.id);

      return NextResponse.json(
        {
          success: false,
          error: '주문 아이템 생성에 실패했습니다.',
          details: itemsError.message,
          hint: itemsError.hint,
          code: itemsError.code,
        },
        { status: 500 }
      );
    }

    console.log('[create-order] ✅ 주문 아이템 생성 성공 - 총', orderItems.length, '건');

    return NextResponse.json({
      success: true,
      orderId: order.id,
      orderNumber: order.order_number,
      reused: false,
    });
  } catch (error) {
    console.error('[create-order] 🔥 예외 발생:', error);
    return NextResponse.json(
      {
        success: false,
        error: '주문 생성 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
