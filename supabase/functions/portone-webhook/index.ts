import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const getCorsHeaders = (origin?: string) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  "Access-Control-Max-Age": "86400",
});

const requireEnv = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

// PortOne Webhook 시그니처 검증 함수
async function verifyPortOneSignature(
  body: string,
  signature: string | null,
  timestamp: string | null,
  secret: string
): Promise<boolean> {
  if (!signature || !timestamp) {
    console.warn("[portone-webhook] 시그니처 또는 타임스탬프 헤더가 없습니다.");
    return false;
  }

  try {
    // 타임스탬프 유효성 검증 (5분 이내)
    const requestTimestamp = parseInt(timestamp, 10);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const timeDifference = Math.abs(currentTimestamp - requestTimestamp);

    if (timeDifference > 300) {
      console.warn("[portone-webhook] 타임스탬프가 5분을 초과했습니다.", {
        requestTimestamp,
        currentTimestamp,
        timeDifference,
      });
      return false;
    }

    // 서명 생성: timestamp + "." + body
    const payload = `${timestamp}.${body}`;

    // HMAC-SHA256 서명 생성
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const payloadData = encoder.encode(payload);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBytes = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      payloadData
    );

    // 서명을 hex 문자열로 변환
    const hashArray = Array.from(new Uint8Array(signatureBytes));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // 서명 비교 (타이밍 공격 방지를 위해 constant-time comparison 권장)
    const isValid = hashHex === signature.toLowerCase();

    if (!isValid) {
      console.warn("[portone-webhook] 시그니처 검증 실패", {
        expected: hashHex,
        received: signature,
      });
    }

    return isValid;
  } catch (error) {
    console.error("[portone-webhook] 시그니처 검증 중 오류", error);
    return false;
  }
}

const buildResponse = <T>(payload: T, status = 200, origin?: string) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
  });

interface PortOneWebhookPayload {
  eventType: string; // 예: "payment.paid", "payment.failed", "payment.cancelled"
  paymentId: string; // PortOne payment ID
  orderId: string; // merchant_uid (주문 ID)
  status: string; // "PAID", "FAILED", "CANCELLED" 등
  amount?: {
    total: number;
    currency: string;
  };
  timestamp?: number;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

// Webhook 이벤트 처리 기록을 위한 테이블 (멱등성 보장)
// 이미 처리된 webhook인지 확인
async function isWebhookProcessed(
  supabase: any,
  paymentId: string,
  eventType: string
): Promise<boolean> {
  // metadata에 webhook 처리 기록을 저장하거나 별도 테이블 사용
  // 여기서는 간단하게 orders 테이블의 metadata를 확인
  const { data: orders } = await supabase
    .from("orders")
    .select("metadata")
    .eq("transaction_id", paymentId)
    .limit(1);

  if (!orders || orders.length === 0) {
    return false;
  }

  const metadata = orders[0].metadata as Record<string, unknown> | null;
  if (!metadata) {
    return false;
  }

  const processedWebhooks = metadata.processed_webhooks as string[] | undefined;
  if (!processedWebhooks) {
    return false;
  }

  return processedWebhooks.includes(`${paymentId}:${eventType}`);
}

// Webhook 처리 기록 저장
async function markWebhookProcessed(
  supabase: any,
  orderId: string,
  paymentId: string,
  eventType: string
): Promise<void> {
  const { data: order } = await supabase
    .from("orders")
    .select("metadata")
    .eq("id", orderId)
    .single();

  if (!order) {
    return;
  }

  const metadata = (order.metadata as Record<string, unknown>) || {};
  const processedWebhooks = (metadata.processed_webhooks as string[]) || [];
  
  const webhookKey = `${paymentId}:${eventType}`;
  if (!processedWebhooks.includes(webhookKey)) {
    processedWebhooks.push(webhookKey);
  }

  await supabase
    .from("orders")
    .update({
      metadata: {
        ...metadata,
        processed_webhooks: processedWebhooks,
        last_webhook_at: new Date().toISOString(),
        last_webhook_event: eventType,
      },
    })
    .eq("id", orderId);
}

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: getCorsHeaders(origin),
    });
  }

  if (req.method !== "POST") {
    return buildResponse(
      { success: false, error: { message: "Method not allowed" } },
      405,
      origin
    );
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    // Request body를 텍스트로 읽기 (시그니처 검증용)
    const bodyText = await req.text();
    
    // PortOne Webhook 시그니처 검증
    const webhookSecret = Deno.env.get("PORTONE_WEBHOOK_SECRET");
    if (webhookSecret) {
      const signature = req.headers.get("x-portone-signature");
      const timestamp = req.headers.get("x-portone-timestamp");

      const isValid = await verifyPortOneSignature(
        bodyText,
        signature,
        timestamp,
        webhookSecret
      );

      if (!isValid) {
        console.error("[portone-webhook] 시그니처 검증 실패", {
          signature,
          timestamp,
        });
        // 웹훅은 항상 200 응답을 반환하여 재시도를 방지
        return buildResponse(
          {
            success: false,
            error: { message: "Invalid signature" },
          },
          200,
          origin
        );
      }
    }
    // PORTONE_WEBHOOK_SECRET이 없으면 시그니처 검증을 건너뜀 (보안 강화 권장)

    // Body를 JSON으로 파싱
    const raw = JSON.parse(bodyText);
    
    // 전체 Payload 로깅 추가 (실제 구조 확인용)
    console.log("[portone-webhook] 전체 Webhook Payload", JSON.stringify(raw, null, 2));
    
    // PortOne V2 Webhook 형식에 맞게 필드 파싱
    // V2 최신 스펙(2024-04-25 기준)에서는 raw.data 안에 필드가 있을 수 있음
    // 기존 형식(raw.paymentId)과 최신 형식(raw.data.paymentId) 모두 지원
    const data = raw.data || {};
    
    const paymentId =
      data.paymentId ||
      raw.paymentId ||
      data.payment_id ||
      raw.payment_id ||
      data.txId ||
      raw.tx_id ||
      data.id ||
      raw.id ||
      null;

    const statusRaw =
      data.status ||
      raw.status ||
      data.paymentStatus ||
      raw.paymentStatus ||
      '';
    const status = (statusRaw || '').toUpperCase(); // "PAID" 비교용 (대소문자 통일)

    // eventType, orderId는 V2에서는 없을 수 있으므로 필수로 요구하지 않음
    const eventType =
      raw.eventType ||
      raw.event_type ||
      raw.type ||
      data.type ||
      'payment.paid'; // 기본값

    const orderId =
      data.orderId ||
      raw.orderId ||
      data.order_id ||
      raw.order_id ||
      raw.merchant_uid ||
      raw.merchantUid ||
      null;

    console.log("[portone-webhook] Webhook 수신", {
      eventType,
      paymentId,
      orderId,
      status,
    });

    // paymentId만 필수로 체크 (orderId, eventType는 선택)
    if (!paymentId) {
      console.warn("[portone-webhook] paymentId 없음", {
        raw,
        parsed: { eventType, paymentId, orderId, status },
      });
      // 포트원에는 200을 주고, 내부에서만 문제를 로그로 확인
      return buildResponse(
        {
          success: false,
          error: {
            message: "paymentId is required",
          },
        },
        200,
        origin
      );
    }

    // PortOne V2 문서 권장사항: 웹훅 메시지를 그대로 신뢰하지 말고, API로 상태를 재조회해서 그 결과만 신뢰
    // 실제 결제 상태 검증은 portone-payment-confirm에서 PortOne REST API를 통해 수행됨
    //
    // 단, 웹훅의 status가 명백한 실패(FAILED, CANCELLED)인 경우에도
    // portone-payment-confirm을 호출하여 PortOne API에서 최종 상태를 재확인하도록 함.
    // portone-payment-confirm에서 FAILED/PENDING 등의 상태를 적절히 처리하므로
    // 여기서는 로그만 남기고 모든 결제 관련 webhook은 portone-payment-confirm으로 전달.
    const FAILED_STATUSES = ["FAILED", "CANCELLED", "PARTIAL_CANCELLED"];
    const PENDING_STATUSES = ["PENDING", "READY", "PAY_PENDING"];

    if (FAILED_STATUSES.includes(status)) {
      console.warn("[portone-webhook] ⚠️ 결제 실패/취소 상태 감지 (웹훅 기준):", {
        paymentId,
        orderId,
        status,
        eventType,
        note: "portone-payment-confirm에서 PortOne API로 최종 재확인 후 주문을 FAILED로 처리",
      });
    } else if (PENDING_STATUSES.includes(status)) {
      console.log("[portone-webhook] ⏳ 결제 처리 대기 중 (웹훅 기준):", {
        paymentId,
        orderId,
        status,
        eventType,
        note: "portone-payment-confirm에서 PortOne API로 최종 재확인 후 적절히 처리",
      });
    } else if (status === "PAID") {
      console.log("[portone-webhook] ✅ 결제 상태가 PAID (웹훅 기준):", {
        paymentId,
        orderId,
        status,
        eventType,
      });
    } else {
      console.warn("[portone-webhook] ❓ 알 수 없는 결제 상태 (웹훅 기준):", {
        paymentId,
        orderId,
        status,
        eventType,
        note: "portone-payment-confirm에서 PortOne API로 최종 재확인",
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 멱등성 확인: 이미 처리된 webhook인지 확인
    const isProcessed = await isWebhookProcessed(supabase, paymentId, eventType);
    if (isProcessed) {
      console.log("[portone-webhook] 이미 처리된 webhook", {
        paymentId,
        eventType,
      });
      return buildResponse({
        success: true,
        message: "Webhook already processed",
      }, 200, origin);
    }

    // 🔽 여기부터가 실제 결제완료 처리 (portone-payment-confirm 호출) 로직
    // 결제 완료 이벤트 처리 (status는 PAID 또는 READY)
    // READY 상태인 경우에도 portone-payment-confirm에서 PortOne API로 최종 검증
    // portone-payment-confirm Edge Function 호출하여 최종 검증
    const confirmUrl = `${supabaseUrl}/functions/v1/portone-payment-confirm`;
    
    // body에 paymentId는 필수, orderId는 있을 때만 포함
    const confirmBody: { paymentId: string; orderId?: string | null } = {
      paymentId,
    };
    if (orderId) {
      confirmBody.orderId = orderId;
    }
    
    console.log("[portone-webhook] portone-payment-confirm 호출", {
      paymentId,
      orderId: orderId || null,
    });
    
    try {
      const confirmResponse = await fetch(confirmUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": serviceRoleKey,
        },
        body: JSON.stringify(confirmBody),
      });

      const confirmResult = await confirmResponse.json();

      if (!confirmResponse.ok || !confirmResult.success) {
        console.error("[portone-webhook] 결제 확인 실패", confirmResult);
        // 웹훅은 항상 200 응답을 반환하여 재시도를 방지
        return buildResponse(
          {
            success: false,
            error: {
              message: "Payment confirmation failed",
              details: confirmResult.error,
            },
          },
          200,
          origin
        );
      }

      // Webhook 처리 기록 저장 (orderId가 있을 때만)
      if (orderId) {
        await markWebhookProcessed(supabase, orderId, paymentId, eventType);
      }

      console.log("[portone-webhook] 결제 확인 및 처리 완료", {
        paymentId,
        orderId,
      });

      return buildResponse({
        success: true,
        message: "Payment confirmed and order updated",
        data: confirmResult.data,
      }, 200, origin);
    } catch (confirmError) {
      console.error("[portone-webhook] 결제 확인 중 오류", confirmError);
      // 웹훅은 항상 200 응답을 반환하여 재시도를 방지
      return buildResponse(
        {
          success: false,
          error: {
            message: "Failed to confirm payment",
            details: confirmError instanceof Error ? confirmError.message : String(confirmError),
          },
        },
        200,
        origin
      );
    }
  } catch (error) {
    console.error("[portone-webhook] 오류", error);
    // 웹훅은 항상 200 응답을 반환하여 재시도를 방지
    return buildResponse(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : "Internal server error",
        },
      },
      200,
      origin
    );
  }
}, { verifyJwt: false });

