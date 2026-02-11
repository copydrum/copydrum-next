import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const payload = await req.json();
    const { orderId, reason } = payload ?? {};

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
          error: { message: "주문 취소 처리 중 오류가 발생했습니다.", details: updateOrderError },
        },
        400,
      );
    }

    const { error: updateLogError } = await supabase
      .from("payment_transactions")
      .update({
        status: "cancelled",
        raw_response: { reason },
        updated_at: nowIso,
      })
      .eq("order_id", orderId);

    if (updateLogError) {
      console.error("[payaction-cancel] 결제 로그 업데이트 실패", updateLogError);
    }

    return buildResponse({ success: true });
  } catch (error) {
    console.error("[payaction-cancel] Unexpected error", error);
    return buildResponse(
      {
        success: false,
        error: {
          message: "무통장입금 취소 처리 중 오류가 발생했습니다.",
          details: error?.message ?? error,
        },
      },
      500,
    );
  }
});

































