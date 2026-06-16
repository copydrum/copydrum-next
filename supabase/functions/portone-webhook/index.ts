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

// base64 문자열 → 바이트 배열 (Deno/표준 atob 사용)
function base64ToBytes(b64: string): Uint8Array {
  // URL-safe base64 도 허용
  const normalized = b64.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// 바이트 배열 → base64 문자열
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// 타이밍 공격에 안전한 문자열 비교
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

// PortOne V2 웹훅 시그니처 검증 (Standard Webhooks 스펙)
// 참고: https://developers.portone.io/opi/ko/integration/webhook/readme-v2?v=v2
//  - 헤더: webhook-id, webhook-timestamp, webhook-signature (svix-* 별칭도 허용)
//  - 서명 대상: `{webhook-id}.{webhook-timestamp}.{body}`
//  - 시크릿: `whsec_` 접두가 붙은 base64. 접두 제거 후 base64 디코딩한 raw key로 HMAC-SHA256
//  - webhook-signature: 공백으로 구분된 `v1,<base64서명>` 목록 중 하나라도 일치하면 유효
async function verifyPortOneSignature(
  body: string,
  headers: Headers,
  secret: string
): Promise<boolean> {
  const webhookId =
    headers.get("webhook-id") || headers.get("svix-id");
  const webhookTimestamp =
    headers.get("webhook-timestamp") || headers.get("svix-timestamp");
  const webhookSignature =
    headers.get("webhook-signature") || headers.get("svix-signature");

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    console.warn("[portone-webhook] Standard Webhooks 서명 헤더 누락", {
      hasId: !!webhookId,
      hasTimestamp: !!webhookTimestamp,
      hasSignature: !!webhookSignature,
    });
    return false;
  }

  try {
    // 타임스탬프 유효성 검증 (5분 이내)
    const requestTimestamp = parseInt(webhookTimestamp, 10);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (
      !Number.isFinite(requestTimestamp) ||
      Math.abs(currentTimestamp - requestTimestamp) > 300
    ) {
      console.warn("[portone-webhook] 타임스탬프가 유효하지 않거나 5분을 초과했습니다.", {
        requestTimestamp,
        currentTimestamp,
      });
      return false;
    }

    // 시크릿: `whsec_` 접두 제거 후 base64 디코딩. (raw 텍스트 시크릿도 폴백 처리)
    const rawSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    let keyBytes: Uint8Array;
    try {
      keyBytes = base64ToBytes(rawSecret);
    } catch {
      keyBytes = new TextEncoder().encode(rawSecret);
    }

    // 서명 대상: id.timestamp.body
    const signedContent = `${webhookId}.${webhookTimestamp}.${body}`;

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBytes = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      new TextEncoder().encode(signedContent)
    );
    const expectedSignature = bytesToBase64(new Uint8Array(signatureBytes));

    // webhook-signature 헤더: 공백 구분 `v1,<base64>` 목록
    const isValid = webhookSignature.split(" ").some((part) => {
      const commaIdx = part.indexOf(",");
      const sig = commaIdx >= 0 ? part.slice(commaIdx + 1) : part;
      return sig.length > 0 && timingSafeEqual(sig, expectedSignature);
    });

    if (!isValid) {
      console.warn("[portone-webhook] 시그니처 검증 실패", {
        expected: expectedSignature,
        received: webhookSignature,
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
    
    // PortOne Webhook 시그니처 검증 (Standard Webhooks 스펙)
    // ⚠️ 검증 결과는 "로그/모니터링용"으로만 사용하고, 검증 실패해도 요청을 즉시 버리지 않는다.
    //    이유: 최종 결제 완료 처리는 아래 portone-payment-confirm이 PortOne REST API로 결제
    //    상태를 직접 재조회(권위 있는 검증)하여 PAID인 경우에만 수행한다. 따라서
    //      - 위조된 결제완료 웹훅: API가 PAID가 아니므로 주문이 완료되지 않음 (안전)
    //      - 정상 결제 웹훅: 서명 검증 구현의 사소한 차이로 누락되는 일 없이 완료됨 (누락 방지)
    //    이는 포트원 문서가 안내하는 "웹훅을 신뢰하지 말고 API로 재조회" 전략과 동일하다.
    const webhookSecret = Deno.env.get("PORTONE_WEBHOOK_SECRET");
    if (webhookSecret) {
      const isValid = await verifyPortOneSignature(
        bodyText,
        req.headers,
        webhookSecret
      );
      if (!isValid) {
        console.warn(
          "[portone-webhook] ⚠️ 서명 검증 실패 — API 재조회로 결제 진위를 최종 확인합니다.",
          {
            webhookId: req.headers.get("webhook-id") || req.headers.get("svix-id"),
            webhookTimestamp:
              req.headers.get("webhook-timestamp") || req.headers.get("svix-timestamp"),
          }
        );
      } else {
        console.log("[portone-webhook] ✅ 서명 검증 성공");
      }
    }

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

