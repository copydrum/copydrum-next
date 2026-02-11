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

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";

  // ✅ 1) 프리플라이트(OPTIONS) 요청 먼저 처리
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: getCorsHeaders(origin),
    });
  }

  // ✅ 2) 아래부터 실제 로직 (POST 등)
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(origin),
        },
      }
    );
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const payload = await req.json();
    const { orderId, transactionId, reason, rawResponse } = payload ?? {};

    if (!orderId) {
      return buildResponse(
        { success: false, error: { message: "orderId는 필수입니다." } },
        400,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const nowIso = new Date().toISOString();

    const { error: updateOrderError } = await supabase
      .from("orders")
      .update({
        payment_status: "cancelled",
        status: "cancelled",
        updated_at: nowIso,
      })
      .eq("id", orderId);

    if (updateOrderError) {
      return buildResponse(
        {
          success: false,
          error: {
            message: "주문 취소 처리에 실패했습니다.",
            details: updateOrderError,
          },
        },
        400,
      );
    }

    const { error: updateLogError } = await supabase
      .from("payment_transactions")
      .update({
        status: "cancelled",
        pg_transaction_id: transactionId ?? null,
        raw_response: rawResponse ?? { reason },
        updated_at: nowIso,
      })
      .eq("order_id", orderId);

    if (updateLogError) {
      console.error("[inicis-cancel] 결제 로그 업데이트 실패", updateLogError);
    }

    return buildResponse({ success: true });
  } catch (error) {
    console.error("[inicis-cancel] Unexpected error", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          message: "KG이니시스 결제 취소 처리 중 오류가 발생했습니다.",
          details: errorMessage,
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(),
        },
      }
    );
  }
});






