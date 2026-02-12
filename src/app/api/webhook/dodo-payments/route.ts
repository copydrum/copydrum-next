import { NextRequest, NextResponse } from "next/server";
import { Webhooks } from "@dodopayments/nextjs";
import { createClient } from "@supabase/supabase-js";

/**
 * Dodo Payments 웹훅 핸들러
 *
 * 결제 성공, 환불, 구독 변경 등의 이벤트를 수신하고 처리합니다.
 *
 * 환경 변수 필요:
 * - DODO_WEBHOOK_SECRET: Dodo Payments 웹훅 시크릿 키
 * - NEXT_PUBLIC_SUPABASE_URL: Supabase URL
 * - SUPABASE_SERVICE_ROLE_KEY: Supabase Service Role Key (서버 전용)
 *
 * 엔드포인트: POST /api/webhook/dodo-payments
 *
 * 보안:
 * - webhook-id, webhook-signature, webhook-timestamp 헤더로 서명 검증
 * - 검증 실패 시 401 반환
 * - 잘못된 페이로드 시 400 반환
 *
 * NOTE: Webhooks() 초기화를 POST 함수 내부에서 수행하여
 * 빌드 타임에 환경변수가 없어도 에러가 발생하지 않도록 함
 */

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("[dodo-webhook] Missing Supabase environment variables");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(req: NextRequest) {
  // 런타임에만 환경변수를 읽어서 초기화 (빌드 타임 에러 방지)
  const handler = Webhooks({
    webhookKey: process.env.DODO_WEBHOOK_SECRET!,
    onPayload: async (payload) => {
      // 수신된 웹훅 페이로드 로깅
      console.log("[dodo-webhook] Received event:", payload.type, JSON.stringify(payload).slice(0, 500));

      const supabase = getSupabaseAdmin();

      switch (payload.type) {
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 결제 성공: 주문 완료 처리
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        case "payment.succeeded": {
          console.log("[dodo-webhook] Payment succeeded:", payload);

          const dodoPaymentId = (payload as any).payment_id || (payload as any).data?.payment_id || (payload as any).id;
          const metadata = (payload as any).metadata || (payload as any).data?.metadata || {};
          const orderId = metadata.orderId || metadata.order_id;

          console.log("[dodo-webhook] Extracted info:", { dodoPaymentId, orderId, metadata });

          if (!orderId) {
            // orderId가 metadata에 없으면, transaction_id로 주문 검색
            console.log("[dodo-webhook] orderId not in metadata, searching by transaction_id...");
            const { data: matchedOrder, error: searchError } = await supabase
              .from("orders")
              .select("id, status, user_id")
              .or(`transaction_id.eq.${dodoPaymentId},metadata->>dodo_payment_id.eq.${dodoPaymentId}`)
              .single();

            if (searchError || !matchedOrder) {
              console.error("[dodo-webhook] Could not find order for payment:", dodoPaymentId, searchError);
              break;
            }

            await completeOrder(supabase, matchedOrder.id, matchedOrder.user_id, dodoPaymentId);
          } else {
            // orderId가 있으면 직접 업데이트
            const { data: order, error: fetchError } = await supabase
              .from("orders")
              .select("id, status, user_id")
              .eq("id", orderId)
              .single();

            if (fetchError || !order) {
              console.error("[dodo-webhook] Order not found:", orderId, fetchError);
              break;
            }

            await completeOrder(supabase, orderId, order.user_id, dodoPaymentId);
          }
          break;
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 결제 실패: 주문 실패 처리
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        case "payment.failed": {
          console.log("[dodo-webhook] Payment failed:", payload);

          const failedMetadata = (payload as any).metadata || (payload as any).data?.metadata || {};
          const failedOrderId = failedMetadata.orderId || failedMetadata.order_id;

          if (failedOrderId) {
            const { error: failError } = await supabase
              .from("orders")
              .update({
                status: "failed",
                payment_status: "failed",
                updated_at: new Date().toISOString(),
              })
              .eq("id", failedOrderId);

            if (failError) {
              console.error("[dodo-webhook] Failed to update order status to 'failed':", failError);
            }
          }
          break;
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 환불 성공: 주문 환불 처리
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        case "refund.succeeded": {
          console.log("[dodo-webhook] Refund succeeded:", payload);

          const refundMetadata = (payload as any).metadata || (payload as any).data?.metadata || {};
          const refundOrderId = refundMetadata.orderId || refundMetadata.order_id;

          if (refundOrderId) {
            const { error: refundError } = await supabase
              .from("orders")
              .update({
                status: "refunded",
                payment_status: "refunded",
                updated_at: new Date().toISOString(),
              })
              .eq("id", refundOrderId);

            if (refundError) {
              console.error("[dodo-webhook] Failed to update order status to 'refunded':", refundError);
            }
          }
          break;
        }

        default:
          console.log("[dodo-webhook] Unhandled event type:", payload.type);
          break;
      }
    },
  });

  // Webhooks()가 반환하는 핸들러를 실행
  return handler(req);
}

/**
 * 주문 완료 처리 헬퍼 함수
 * - orders 테이블 상태를 completed로 업데이트
 * - purchases 테이블에 구매 기록 삽입
 */
async function completeOrder(
  supabase: ReturnType<typeof createClient>,
  orderId: string,
  userId: string,
  dodoPaymentId: string
) {
  // 이미 completed인지 확인 (중복 방지)
  const { data: existingOrder } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();

  if (existingOrder?.status === "completed") {
    console.log("[dodo-webhook] Order already completed, skipping:", orderId);
    return;
  }

  // 1. 주문 상태 업데이트
  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: "completed",
      payment_status: "paid",
      payment_method: "dodo",
      transaction_id: dodoPaymentId,
      payment_confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (updateError) {
    console.error("[dodo-webhook] Failed to complete order:", orderId, updateError);
    return;
  }

  console.log("[dodo-webhook] ✅ Order completed:", orderId);

  // 2. purchases 테이블에 구매 기록 삽입
  try {
    const { data: orderItems } = await supabase
      .from("order_items")
      .select("id, drum_sheet_id, price")
      .eq("order_id", orderId);

    if (orderItems && orderItems.length > 0) {
      const purchaseRecords = orderItems.map((item) => ({
        user_id: userId,
        drum_sheet_id: item.drum_sheet_id,
        order_id: orderId,
        price_paid: item.price ?? 0,
      }));

      const { error: purchasesError } = await supabase
        .from("purchases")
        .insert(purchaseRecords);

      if (purchasesError && purchasesError.code !== "23505") {
        // 23505 = unique violation (이미 기록됨) → 무시
        console.warn("[dodo-webhook] purchases 기록 실패:", purchasesError);
      } else {
        console.log("[dodo-webhook] ✅ purchases 기록 완료:", orderItems.length, "건");
      }
    }
  } catch (err) {
    console.warn("[dodo-webhook] purchases 기록 중 예외:", err);
  }
}
