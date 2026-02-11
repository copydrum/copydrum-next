import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const getCorsHeaders = (origin?: string) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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

const buildResponse = <T>(payload: T, status = 200, origin?: string) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
  });

interface PortOnePayPalPayload {
  imp_uid?: string; // 포트원 거래 고유번호 (deprecated - paymentId 사용 권장)
  paymentId?: string; // PortOne payment ID (V2)
  merchant_uid: string; // 주문 ID
  orderId: string; // 주문 ID (merchant_uid와 동일)
  paid_amount?: number; // 실제 결제된 금액 (deprecated - PortOne API에서 조회)
  status?: string; // 'paid', 'failed', 'cancelled' 등 (deprecated - PortOne API에서 조회)
}

/**
 * 기존 payments-portone-paypal Edge Function
 * 
 * 이제는 PortOne API를 직접 조회하여 결제 상태를 검증합니다.
 * 프론트엔드에서 호출하지 않도록 변경되었지만, 하위 호환성을 위해 유지합니다.
 * 
 * 실제 결제 확인은 portone-payment-confirm 또는 portone-webhook을 사용하세요.
 */
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

    const payload: PortOnePayPalPayload = await req.json();
    const { imp_uid, paymentId, merchant_uid, orderId } = payload;

    // paymentId 또는 imp_uid 중 하나는 필수
    const actualPaymentId = paymentId || imp_uid;

    console.log("[portone-paypal] 결제 확인 요청 (PortOne API 조회 기반)", {
      paymentId: actualPaymentId,
      merchant_uid,
      orderId,
      note: "이 함수는 하위 호환성을 위해 유지됩니다. portone-payment-confirm 사용을 권장합니다.",
    });

    if (!actualPaymentId || !merchant_uid || !orderId) {
      return buildResponse(
        { success: false, error: { message: "paymentId (or imp_uid), merchant_uid, and orderId are required" } },
        400,
        origin
      );
    }

    // portone-payment-confirm Edge Function 호출하여 최종 검증
    const confirmUrl = `${supabaseUrl}/functions/v1/portone-payment-confirm`;
    
    try {
      const confirmResponse = await fetch(confirmUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": serviceRoleKey,
        },
        body: JSON.stringify({
          paymentId: actualPaymentId,
          orderId,
        }),
      });

      const confirmResult = await confirmResponse.json();

      if (!confirmResponse.ok || !confirmResult.success) {
        console.error("[portone-paypal] 결제 확인 실패", confirmResult);
        return buildResponse(
          {
            success: false,
            error: {
              message: "Payment confirmation failed",
              details: confirmResult.error,
            },
          },
          confirmResponse.status,
          origin
        );
      }

      console.log("[portone-paypal] 결제 확인 및 처리 완료", {
        paymentId: actualPaymentId,
        orderId,
      });

      return buildResponse({
        success: true,
        data: confirmResult.data,
        message: "Payment confirmed via PortOne API",
      }, 200, origin);
    } catch (confirmError) {
      console.error("[portone-paypal] 결제 확인 중 오류", confirmError);
      return buildResponse(
        {
          success: false,
          error: {
            message: "Failed to confirm payment",
            details: confirmError instanceof Error ? confirmError.message : String(confirmError),
          },
        },
        500,
        origin
      );
    }
  } catch (error) {
    console.error("[portone-paypal] 오류", error);
    return buildResponse(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : "Internal server error",
        },
      },
      500,
      origin
    );
  }
});












