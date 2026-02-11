/**
 * legacy: KG이니시스 직접 연동 Edge Function
 * 
 * 현재는 포트원으로 전환 예정이며, 카드 결제는 포트원 심사 진행 중입니다.
 * 나중에 KG이니시스를 다시 사용할 경우를 대비해 코드는 유지합니다.
 * 
 * @deprecated 현재 미사용 - 포트원으로 전환 예정
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

// SHA256 해시 생성 함수
const sha256 = async (data: string): Promise<string> => {
  const msgBuffer = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

// 승인 API URL 가져오기
const getAuthUrl = (idcName: string): string => {
  const baseUrl = "stdpay.inicis.com/api/payAuth";
  switch (idcName) {
    case "fc":
      return `https://fc${baseUrl}`;
    case "ks":
      return `https://ks${baseUrl}`;
    case "stg":
      return `https://stg${baseUrl}`;
    default:
      return `https://${baseUrl}`;
  }
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
    const signKey = requireEnv("INICIS_SIGN_KEY") || requireEnv("INICIS_MERCHANT_KEY");

    const payload = await req.json();

    const {
      orderId,
      authToken,
      idcName,
      authUrl,
      amount,
      rawResponse,
      resultCode,
    } = payload ?? {};

    // authToken이 있는 경우 (새로운 승인 요청)
    if (authToken && idcName) {
      if (!orderId) {
        return buildResponse(
          { success: false, error: { message: "orderId는 필수입니다." } },
          400,
        );
      }

      const timestamp = Date.now().toString();
      // signature: SHA256("authToken=" + authToken + "&timestamp=" + timestamp)
      const signatureSource = `authToken=${authToken}&timestamp=${timestamp}`;
      const signature = await sha256(signatureSource);
      // verification: SHA256("authToken=" + authToken + "&signKey=" + signKey + "&timestamp=" + timestamp)
      const verificationSource = `authToken=${authToken}&signKey=${signKey}&timestamp=${timestamp}`;
      const verification = await sha256(verificationSource);

      const approveUrl = authUrl || getAuthUrl(idcName);

      // KG이니시스 승인 API 호출
      const approveFormData = new URLSearchParams({
        mid: requireEnv("INICIS_MID"),
        authToken,
        timestamp,
        signature,
        verification,
        charset: "UTF-8",
        format: "JSON",
      });

      const approveResponse = await fetch(approveUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: approveFormData.toString(),
      });

      // 응답 형식 확인 (JSON 또는 텍스트)
      const responseText = await approveResponse.text();
      let approveResult: any;
      
      try {
        approveResult = JSON.parse(responseText);
      } catch {
        // JSON이 아닌 경우 NVP 또는 XML 형식일 수 있음
        // 간단한 파싱 시도 또는 오류 처리
        console.error("[inicis-approve] 승인 API 응답 파싱 실패", responseText);
        return buildResponse(
          {
            success: false,
            error: {
              message: "승인 API 응답 형식 오류",
              details: responseText.substring(0, 500),
            },
          },
          400,
        );
      }

      if (approveResult.resultCode !== "0000") {
        return buildResponse(
          {
            success: false,
            error: {
              message: approveResult.resultMsg || "결제 승인에 실패했습니다.",
              details: approveResult,
            },
          },
          400,
        );
      }

      // 승인 성공 - 주문 상태 업데이트
      const transactionId = approveResult.tid || approveResult.MOID;
      const approvedAmount = Number(approveResult.TotPrice) || Number(amount) || 0;

      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const nowIso = new Date().toISOString();

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("id, user_id")
        .eq("id", orderId)
        .maybeSingle();

      if (orderError) {
        return buildResponse(
          { success: false, error: { message: "주문을 조회할 수 없습니다.", details: orderError } },
          400,
        );
      }

      if (!order) {
        return buildResponse(
          { success: false, error: { message: "해당 주문이 존재하지 않습니다." } },
          404,
        );
      }

      const { error: updateOrderError } = await supabase
        .from("orders")
        .update({
          payment_status: "paid",
          status: "payment_confirmed",
          transaction_id: transactionId,
          payment_confirmed_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", orderId);

      if (updateOrderError) {
        return buildResponse(
          {
            success: false,
            error: { message: "주문 결제 상태 업데이트에 실패했습니다.", details: updateOrderError },
          },
          400,
        );
      }

      const { error: updateLogError } = await supabase
        .from("payment_transactions")
        .update({
          status: "paid",
          pg_transaction_id: transactionId,
          raw_response: approveResult,
          amount: approvedAmount,
          updated_at: nowIso,
        })
        .eq("order_id", orderId);

      if (updateLogError) {
        console.error("[inicis-approve] 결제 로그 업데이트 실패", updateLogError);
      }

      return buildResponse({
        success: true,
        data: {
          resultCode: approveResult.resultCode,
          resultMsg: approveResult.resultMsg,
          tid: approveResult.tid,
          MOID: approveResult.MOID,
          TotPrice: approveResult.TotPrice,
          goodName: approveResult.goodName,
          applDate: approveResult.applDate,
          applTime: approveResult.applTime,
        },
      });
    }

    // 기존 방식 (transactionId만 있는 경우 - 상태만 업데이트)
    const { transactionId } = payload ?? {};

    if (!orderId || !transactionId) {
      return buildResponse(
        { success: false, error: { message: "orderId와 transactionId는 필수입니다." } },
        400,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const nowIso = new Date().toISOString();

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, user_id")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) {
      return buildResponse(
        { success: false, error: { message: "주문을 조회할 수 없습니다.", details: orderError } },
        400,
      );
    }

    if (!order) {
      return buildResponse(
        { success: false, error: { message: "해당 주문이 존재하지 않습니다." } },
        404,
      );
    }

    const { error: updateOrderError } = await supabase
      .from("orders")
      .update({
        payment_status: "paid",
        status: "payment_confirmed",
        transaction_id: transactionId,
        payment_confirmed_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", orderId);

    if (updateOrderError) {
      return buildResponse(
        {
          success: false,
          error: { message: "주문 결제 상태 업데이트에 실패했습니다.", details: updateOrderError },
        },
        400,
      );
    }

    const { error: updateLogError } = await supabase
      .from("payment_transactions")
      .update({
        status: "paid",
        pg_transaction_id: transactionId,
        raw_response: rawResponse ?? null,
        amount: amount ?? null,
        updated_at: nowIso,
      })
      .eq("order_id", orderId);

    if (updateLogError) {
      console.error("[inicis-approve] 결제 로그 업데이트 실패", updateLogError);
    }

    return buildResponse({ success: true });
  } catch (error) {
    console.error("[inicis-approve] Unexpected error", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          message: "KG이니시스 결제 승인 처리 중 오류가 발생했습니다.",
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






