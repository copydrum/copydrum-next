import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/auth/requireUser';

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

/**
 * 🔒 서버 측 주문 금액 검증.
 * 클라이언트가 보낸 amount/item.price 를 그대로 신뢰하지 않고,
 * 서버가 신뢰하는 가격(정가 또는 활성 이벤트 할인가)과 모음집 할인가를 기준으로
 * 주문 총액이 정당한 최소 금액 이상인지 검증한다.
 *
 * - 일반/장바구니 주문: 총액 >= Σ(각 곡의 할인 적용가)  (언더프라이싱 차단)
 * - 모음집 주문: 곡별 가격이 sale_price 비례 배분이므로 개별 단가보다 낮을 수 있음.
 *   → 동일 구성의 활성 모음집(sale_price == amount)이 존재하면 정당한 것으로 인정.
 *
 * @returns null 이면 통과, 문자열이면 거절 사유
 */
async function validateOrderPricing(
  supabase: SupabaseClient,
  items: any[],
  amount: number
): Promise<string | null> {
  const requestedIds: string[] = items.map((it) => it?.sheetId).filter(Boolean);
  if (requestedIds.length === 0) {
    return '유효한 상품이 없습니다.';
  }

  // amount 와 item.price 합계의 정합성 + 음수/비정수 차단
  let itemsSum = 0;
  for (const it of items) {
    const p = Number(it?.price);
    if (!Number.isFinite(p) || p < 0) {
      return '상품 가격이 올바르지 않습니다.';
    }
    itemsSum += Math.round(p);
  }
  const orderAmount = Math.round(Number(amount));
  if (!Number.isFinite(orderAmount) || orderAmount < 0) {
    return '주문 금액이 올바르지 않습니다.';
  }
  if (itemsSum !== orderAmount) {
    return '주문 금액과 상품 금액 합계가 일치하지 않습니다.';
  }

  // 요청된 곡들의 서버 기준 정가 조회 (존재 검증 포함)
  const { data: sheetRows, error: sheetsError } = await supabase
    .from('drum_sheets')
    .select('id, price')
    .in('id', requestedIds);

  if (sheetsError) {
    console.error('[create-order] 가격 검증용 drum_sheets 조회 실패:', sheetsError);
    return '상품 정보를 확인할 수 없습니다.';
  }

  const priceMap = new Map<string, number>();
  for (const row of sheetRows || []) {
    priceMap.set(row.id, Math.max(0, Math.round(Number(row.price) || 0)));
  }

  // 존재하지 않는 상품이 포함되면 거절
  for (const id of requestedIds) {
    if (!priceMap.has(id)) {
      return '존재하지 않는 상품이 포함되어 있습니다.';
    }
  }

  // 활성 이벤트 할인가 적용 → 곡별 최저 정당 가격
  const nowIso = new Date().toISOString();
  const { data: discountRows } = await supabase
    .from('event_discount_sheet_view')
    .select('sheet_id, discount_price, is_active, event_start, event_end')
    .in('sheet_id', requestedIds)
    .eq('is_active', true)
    .lte('event_start', nowIso)
    .gte('event_end', nowIso);

  const discountMap = new Map<string, number>();
  for (const row of discountRows || []) {
    const dp = Math.max(0, Math.round(Number(row.discount_price) || 0));
    discountMap.set(row.sheet_id, dp);
  }

  // 곡별 할인 적용가 합계 = 정당한 최소 총액(floor)
  let floor = 0;
  for (const id of requestedIds) {
    const base = priceMap.get(id) ?? 0;
    const discounted = discountMap.has(id) ? Math.min(base, discountMap.get(id)!) : base;
    floor += discounted;
  }

  if (orderAmount >= floor) {
    return null; // 정상 (일반/장바구니/할인 주문)
  }

  // floor 미만 → 모음집(번들) 주문인지 확인
  // 동일하게 활성화되어 있고 sale_price == amount 인 모음집 중,
  // 요청 곡 구성과 정확히 일치하는 것이 있으면 정당한 모음집 결제로 인정.
  const { data: candidateCollections } = await supabase
    .from('collections')
    .select('id, sale_price')
    .eq('is_active', true)
    .eq('sale_price', orderAmount);

  if (candidateCollections && candidateCollections.length > 0) {
    const collectionIds = candidateCollections.map((c) => c.id);
    const { data: collectionSheetRows } = await supabase
      .from('collection_sheets')
      .select('collection_id, drum_sheet_id')
      .in('collection_id', collectionIds);

    const grouped = new Map<string, Set<string>>();
    for (const row of collectionSheetRows || []) {
      if (!grouped.has(row.collection_id)) grouped.set(row.collection_id, new Set());
      grouped.get(row.collection_id)!.add(row.drum_sheet_id);
    }

    const requestedSet = new Set(requestedIds);
    for (const [, sheetSet] of grouped) {
      if (
        sheetSet.size === requestedSet.size &&
        [...requestedSet].every((id) => sheetSet.has(id))
      ) {
        return null; // 정당한 모음집 결제
      }
    }
  }

  return '주문 금액이 정상 가격보다 낮습니다.';
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

    // 🔒 세션 인증: 본인 계정으로만 주문을 생성할 수 있다.
    const authUser = await getAuthenticatedUser();
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }
    if (authUser.id !== userId) {
      return NextResponse.json(
        { success: false, error: '권한이 없습니다.' },
        { status: 403 }
      );
    }

    const supabase = createAdminClient();

    // 🔒 서버 측 가격 검증 (가격 조작/언더프라이싱 차단)
    const pricingError = await validateOrderPricing(supabase, items, Number(amount));
    if (pricingError) {
      console.warn('[create-order] ⛔ 가격 검증 실패:', {
        userId,
        amount,
        items: items.map((it: any) => ({ sheetId: it?.sheetId, price: it?.price })),
        reason: pricingError,
      });
      return NextResponse.json(
        { success: false, error: pricingError },
        { status: 400 }
      );
    }

    // ============================================================
    // Upsert 로직: 동일 유저 + 동일 장바구니 + 동일 금액의 pending 주문 재활용
    // → 페이지 새로고침 등으로 인한 단순 중복 생성 방지가 목적
    //
    // 🛡️ [중요] transaction_id가 이미 세팅된 주문은 재활용하지 않음.
    //   PayPal SPB 결제는 비동기(PAY_PENDING) 처리 시간이 길어서
    //   사용자가 1차 결제를 시작한 뒤 페이지를 닫고 2차 결제를 시도하는 경우,
    //   기존 pending 주문에는 이미 1차 결제의 transaction_id가 저장되어 있음.
    //   이를 재활용해 2차 결제를 진행하면 verify가 transaction_id를 덮어써서
    //   1차 결제의 PortOne 웹훅이 도착해도 매칭되는 주문을 찾을 수 없게 됨
    //   → 1차 결제 흔적이 DB에서 사라지는 치명적 문제 발생.
    //   따라서 결제가 한 번이라도 시도된 주문(transaction_id가 있는 주문)은
    //   재활용하지 않고 새 주문을 생성한다.
    // ============================================================

    // 요청된 아이템의 sheetId 목록을 정렬하여 비교용 키 생성
    const requestedSheetIds = items
      .map((item: any) => item.sheetId)
      .filter(Boolean)
      .sort();

    // 동일 유저의 pending 상태 주문 중 동일 금액 + 결제 시도가 없었던(transaction_id IS NULL) 것만 조회
    // → 이미 결제 시도가 진행 중인 주문은 재활용 후보에서 제외
    const { data: existingPendingOrders } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        total_amount,
        transaction_id,
        order_items (
          drum_sheet_id
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .eq('total_amount', amount)
      .is('transaction_id', null)
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
          // (transaction_id가 NULL인 주문이므로 결제 시도가 없었음 — 안전하게 재활용 가능)
          await supabase
            .from('orders')
            .update({
              updated_at: new Date().toISOString(),
              payment_method: paymentMethod || null, // 결제수단이 바뀔 수 있으므로 갱신
            })
            .eq('id', existingOrder.id);

          console.log('[create-order] ♻️ 기존 pending 주문 재활용 (transaction_id NULL):', {
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

    // 참고용 로그: transaction_id가 이미 있는 pending 주문이 있는지 확인 (재활용은 하지 않지만 모니터링)
    const { count: inflightCount } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending')
      .eq('total_amount', amount)
      .not('transaction_id', 'is', null);

    if (inflightCount && inflightCount > 0) {
      console.log('[create-order] ℹ️ 동일 금액의 in-flight 결제 주문 발견 — 재활용하지 않고 새 주문 생성:', {
        userId,
        amount,
        inflightCount,
        note: '1차 결제 PAY_PENDING 진행 중에 2차 결제 시도 시나리오',
      });
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
