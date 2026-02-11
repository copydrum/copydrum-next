/**
 * legacy: PayPal 직접 연동 Edge Function
 * 
 * 현재는 포트원을 통한 PayPal 결제를 사용합니다.
 * 나중에 PayPal 직접 연동을 다시 사용할 경우를 대비해 코드는 유지합니다.
 * 
 * @deprecated 현재 미사용 - 포트원 PayPal로 대체됨
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const getCorsHeaders = (origin?: string) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info, content-type",
  "Access-Control-Max-Age": "86400",
});

const requireEnv = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

const buildResponse = <T>(payload: T, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
  });

// PayPal API Base URL (Live only)
const PAYPAL_BASE_URL = "https://api-m.paypal.com";

// PayPal Access Token 가져오기
async function getPayPalAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const basicAuth = btoa(`${clientId}:${clientSecret}`);
  
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basicAuth}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal token request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

// PayPal Order 승인 (Capture)
async function capturePayPalOrder(
  accessToken: string,
  paypalOrderId: string
): Promise<any> {
  const defaultHeaders = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${accessToken}`,
    "Prefer": "return=representation",
  };

  const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: "POST",
    headers: defaultHeaders,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal capture failed: ${response.status} ${errorText}`);
  }

  return await response.json();
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
      405
    );
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const CLIENT_ID = Deno.env.get("PAYPAL_LIVE_CLIENT_ID") ?? "";
    const SECRET = Deno.env.get("PAYPAL_LIVE_SECRET") ?? "";

    console.log("[paypal-approve] env check", {
      clientId: CLIENT_ID.slice(0, 8),
      secretLen: SECRET.length,
    });

    const payload = await req.json();
    const { orderId, paypalOrderId, payerId } = payload ?? {};

    if (!orderId || !paypalOrderId) {
      return buildResponse(
        { success: false, error: { message: "orderId and paypalOrderId are required" } },
        400
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 주문 확인
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return buildResponse(
        { success: false, error: { message: "Order not found" } },
        404
      );
    }

    // 이미 결제 완료된 경우
    if (order.payment_status === "paid") {
      return buildResponse({
        success: true,
        data: { orderId, message: "Order already paid" },
      });
    }

    // PayPal Access Token 가져오기
    const accessToken = await getPayPalAccessToken(CLIENT_ID, SECRET);

    // PayPal Order 승인 (Capture)
    const captureResult = await capturePayPalOrder(accessToken, paypalOrderId);

    if (captureResult.status !== "COMPLETED") {
      return buildResponse(
        { success: false, error: { message: `PayPal payment not completed: ${captureResult.status}` } },
        400
      );
    }

    // 결제 정보 추출
    const purchaseUnit = captureResult.purchase_units?.[0];
    const capture = purchaseUnit?.payments?.captures?.[0];
    const transactionId = capture?.id || paypalOrderId;
    const amount = parseFloat(capture?.amount?.value || "0");

    // 주문 상태 업데이트
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        payment_status: "paid",
        payment_provider: "paypal",
        pg_transaction_id: transactionId,
        paid_at: now,
        status: "completed", // 주문 상태도 완료로 변경
        metadata: {
          ...(order.metadata || {}),
          paypal_order_id: paypalOrderId,
          paypal_capture_id: capture?.id,
          paypal_payer_id: payerId,
          paypal_status: captureResult.status,
          paypal_amount_usd: amount,
        },
      })
      .eq("id", orderId);

    if (updateError) {
      console.error("[paypal-approve] Order update error:", updateError);
      return buildResponse(
        { success: false, error: { message: "Failed to update order" } },
        500
      );
    }

    return buildResponse({
      success: true,
      data: {
        orderId,
        transactionId,
        amount,
      },
    });
  } catch (error) {
    console.error("[paypal-approve] Error:", error);
    return buildResponse(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : "Internal server error",
        },
      },
      500
    );
  }
});

