import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateOrderPricing } from '@/lib/pricing/validateOrderPricing';
import { getAuthenticatedUser } from '@/lib/auth/requireUser';
import { releaseOrderPoints } from '@/lib/points/server';

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
        points_used,
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

          // 이전 시도에서 묶인 포인트는 되돌린다. 포인트를 쓸 결제 화면은 결제 직전에 다시 적용한다.
          if ((existingOrder.points_used ?? 0) > 0) {
            try {
              await releaseOrderPoints(supabase, existingOrder.id);
            } catch (releaseError) {
              console.error('[create-order] 재활용 주문 포인트 복구 실패:', { orderId: existingOrder.id, releaseError });
              continue;
            }
          }

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

    // ============================================================
    // 🛡️ 중복결제 가드
    //   동일 사용자 + 동일 상품 구성으로 이미 "결제가 시도된(transaction_id 있는)" pending 주문이
    //   있고, 그 결제가 PortOne에서 이미 PAID라면 → 새 주문을 만들지 않고 기존 주문을 그대로
    //   완료 처리한 뒤 그 주문을 반환한다. (무한로딩 등으로 1차 결제 완료를 인지하지 못한 사용자가
    //   다른 수단으로 재결제하여 중복 결제되는 것을 차단)
    //
    //   ⚠️ best-effort: PortOne 조회 실패/지연 시에는 기존 동작(새 주문 생성)으로 폴백하여
    //      결제 흐름 자체를 막지 않는다. (PAY_PENDING은 PayPal 비동기 시나리오이므로 통과)
    // ============================================================
    const { data: inflightOrders } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        transaction_id,
        payment_method,
        total_amount,
        order_items ( drum_sheet_id )
      `)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .eq('total_amount', amount)
      .not('transaction_id', 'is', null)
      .order('created_at', { ascending: false });

    const sameItemsInflight = (inflightOrders || []).filter((o: any) => {
      const ids = (o.order_items || [])
        .map((it: any) => it.drum_sheet_id)
        .filter(Boolean)
        .sort();
      return (
        ids.length === requestedSheetIds.length &&
        ids.every((id: string, idx: number) => id === requestedSheetIds[idx])
      );
    });

    if (sameItemsInflight.length > 0) {
      const portoneApiKey = process.env.PORTONE_API_KEY;
      if (portoneApiKey) {
        for (const inflight of sameItemsInflight) {
          try {
            const { getPortOnePaymentSnapshot } = await import('@/lib/payments/portoneStatus');
            const snap = await getPortOnePaymentSnapshot(
              inflight.transaction_id as string,
              portoneApiKey,
            );

            if (snap && snap.status === 'PAID') {
              console.warn('[create-order] 🛑 중복결제 차단 — 동일 상품의 기존 결제가 이미 PAID:', {
                userId,
                existingOrderId: inflight.id,
                existingOrderNumber: inflight.order_number,
                transactionId: inflight.transaction_id,
              });

              // 기존 주문을 완료 처리(아직 pending이면) 후 그 주문으로 안내
              try {
                const { completeOrderAfterPayment } = await import(
                  '@/lib/payments/completeOrderAfterPayment'
                );
                await completeOrderAfterPayment(
                  inflight.id,
                  (inflight.payment_method || 'card') as any,
                  {
                    transactionId: inflight.transaction_id as string,
                    paymentConfirmedAt: new Date().toISOString(),
                    paymentProvider: 'portone-dedupe',
                  },
                  supabase,
                );
              } catch (completeErr) {
                console.error('[create-order] 기존 PAID 주문 완료 처리 실패(무시하고 안내):', completeErr);
              }

              return NextResponse.json({
                success: true,
                orderId: inflight.id,
                orderNumber: inflight.order_number,
                reused: true,
                alreadyPaid: true, // 클라이언트가 success 페이지로 보낼 수 있도록 표시
              });
            }

            // PayPal 등 비동기 결제: PAY_PENDING 중이면 같은 주문을 재활용 (새 pending 주문 난립 방지)
            const INFLIGHT_PENDING = ['PENDING', 'READY', 'PAY_PENDING'];
            if (snap && INFLIGHT_PENDING.includes(snap.status)) {
              console.log('[create-order] ♻️ in-flight 결제 처리 중 — 기존 주문 재활용:', {
                userId,
                existingOrderId: inflight.id,
                existingOrderNumber: inflight.order_number,
                transactionId: inflight.transaction_id,
                portoneStatus: snap.status,
              });
              return NextResponse.json({
                success: true,
                orderId: inflight.id,
                orderNumber: inflight.order_number,
                reused: true,
                inflightPending: true,
              });
            }
          } catch (snapErr) {
            // 조회 실패 → best-effort 폴백 (아래에서 새 주문 생성)
            console.warn('[create-order] in-flight 결제 상태 조회 실패(새 주문으로 폴백):', {
              existingOrderId: inflight.id,
              error: snapErr instanceof Error ? snapErr.message : String(snapErr),
            });
          }
        }
      }

      console.log('[create-order] ℹ️ 동일 상품의 in-flight 결제 주문 발견(미완료) — 새 주문 생성 진행:', {
        userId,
        amount,
        inflightCount: sameItemsInflight.length,
        note: 'PAY_PENDING(PayPal 비동기 등) 또는 PortOne 조회 불가 시 정상 폴백',
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
