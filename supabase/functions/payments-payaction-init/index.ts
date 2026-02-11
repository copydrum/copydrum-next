/**
 * legacy: PayAction 자동입금 확인 시스템용 Edge Function
 * 
 * 현재는 사용하지 않으며, 무통장 입금은 관리자가 수동으로 확인합니다.
 * 나중에 PayAction을 다시 사용할 경우를 대비해 코드는 유지합니다.
 * 
 * @deprecated 현재 미사용 - 관리자 수동 입금 확인으로 대체됨
 */
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

const generateDepositCode = () => {
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `CD${random}`;
};

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
    const bankName = requireEnv("BANK_NAME");
    const bankAccount = requireEnv("BANK_ACCOUNT");
    const bankHolder = requireEnv("BANK_ACCOUNT_HOLDER");

    const payload = await req.json();

    const { userId, orderId, amount, description, depositorName, metadata = {} } = payload ?? {};

    if (!userId || !orderId || !amount) {
      return buildResponse(
        { success: false, error: { message: "userId, orderId, amount는 필수입니다." } },
        400,
      );
    }

    const normalizedAmount = Math.max(0, Math.round(Number(amount) || 0));
    if (normalizedAmount <= 0) {
      return buildResponse(
        { success: false, error: { message: "결제 금액이 올바르지 않습니다." } },
        400,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const nowIso = new Date().toISOString();

    const resolvedDepositName = (depositorName ?? metadata.depositorName ?? "").trim() || generateDepositCode();

    const virtualAccountInfo = {
      bankName,
      accountNumber: bankAccount,
      depositor: bankHolder,
      expectedDepositor: resolvedDepositName,
      amount: normalizedAmount,
      expiresAt: metadata.expiresAt ?? null,
      message: `입금자명에 반드시 "${resolvedDepositName}"를 입력해주세요.`,
      orderId,
    };

    const { error: updateOrderError } = await supabase
      .from("orders")
      .update({
        payment_status: "awaiting_deposit",
        status: "pending",
        depositor_name: resolvedDepositName,
        virtual_account_info: virtualAccountInfo,
        updated_at: nowIso,
      })
      .eq("id", orderId);

    if (updateOrderError) {
      console.error("[payaction-init] 주문 업데이트 실패", updateOrderError);
    }

    const { error: logError } = await supabase.from("payment_transactions").insert({
      order_id: orderId,
      user_id: userId,
      payment_method: "bank_transfer",
      payment_provider: "payaction",
      amount: normalizedAmount,
      status: "awaiting_deposit",
      raw_request: payload,
      created_at: nowIso,
    });

    if (logError) {
      console.error("[payaction-init] 결제 로그 저장 실패", logError);
    }

    return buildResponse({
      success: true,
      data: {
        paymentId: orderId,
        transactionId: crypto.randomUUID(),
        virtualAccountInfo,
        additionalData: {
          depositorName: resolvedDepositName,
        },
      },
    });
  } catch (error) {
    console.error("[payaction-init] Unexpected error", error);
    return buildResponse(
      {
        success: false,
        error: {
          message: "무통장입금 요청 처리 중 오류가 발생했습니다.",
          details: error?.message ?? error,
        },
      },
      500,
    );
  }
});

