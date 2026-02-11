import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// SHA256 해시 생성 함수
const sha256 = async (data: string): Promise<string> => {
  const msgBuffer = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

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
    const mid = requireEnv("INICIS_MID");
    const signKey = requireEnv("INICIS_SIGN_KEY") || requireEnv("INICIS_MERCHANT_KEY");

    const payload = await req.json();

    const {
      userId,
      orderId,
      amount,
      description,
      returnUrl,
      method = "card",
      goodsName,
      buyerName,
      buyerEmail,
      buyerTel,
      metadata = {},
    } = payload ?? {};

    if (!userId || !orderId || !amount || !returnUrl) {
      return buildResponse(
        {
          success: false,
          error: { message: "필수 파라미터가 누락되었습니다." },
        },
        400,
      );
    }

    const normalizedAmount = Math.max(0, Math.round(Number(amount) || 0));
    if (normalizedAmount <= 0) {
      return buildResponse(
        {
          success: false,
          error: { message: "결제 금액이 올바르지 않습니다." },
        },
        400,
      );
    }

    const timestamp = Date.now().toString();
    // mKey: SHA256(signKey) - 소문자 hex
    const mKey = await sha256(signKey);
    // signature: SHA256("oid=" + oid + "&price=" + price + "&timestamp=" + timestamp) - 소문자 hex
    const signatureSource = `oid=${orderId}&price=${normalizedAmount}&timestamp=${timestamp}`;
    const signature = await sha256(signatureSource);
    // verification: SHA256("oid=" + oid + "&price=" + price + "&signKey=" + signKey + "&timestamp=" + timestamp) - 소문자 hex
    const verificationSource = `oid=${orderId}&price=${normalizedAmount}&signKey=${signKey}&timestamp=${timestamp}`;
    const verification = await sha256(verificationSource);
    const transactionId = crypto.randomUUID();

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { error: logError } = await supabase.from("payment_transactions").insert({
      order_id: orderId,
      user_id: userId,
      payment_method: method,
      payment_provider: "inicis",
      amount: normalizedAmount,
      status: "pending",
      pg_transaction_id: transactionId,
      raw_request: payload,
      created_at: new Date().toISOString(),
    });

    if (logError) {
      console.error("[inicis-init] 결제 로그 저장 실패", logError);
    }

    const requestForm = {
      action: "https://stdpay.inicis.com/stdpay/INIStdPayRequest.do",
      method: "POST" as const,
      inputs: {
        version: "1.0",
        mid,
        oid: orderId,
        price: normalizedAmount.toString(),
        timestamp,
        use_chkfake: "Y", // PC결제 보안강화 사용 (필수, Y 고정)
        signature,
        verification,
        mKey,
        // returnUrl과 closeUrl 모두 HTTPS로 강제 설정
        // KG이니시스는 HTTPS 필수
        returnUrl: returnUrl.startsWith('https://') 
          ? returnUrl 
          : `https://${returnUrl.replace(/^https?:\/\//, '')}`,
        // closeUrl: 결제창 닫기 URL (결제창에서 닫기 버튼 클릭 시 호출)
        // HTTPS로 강제 설정
        closeUrl: metadata.closeUrl 
          ? (metadata.closeUrl.startsWith('https://') ? metadata.closeUrl : `https://${metadata.closeUrl.replace(/^https?:\/\//, '')}`)
          : (() => {
              const defaultCloseUrl = returnUrl.replace(/\/[^/]*$/, "/payments/inicis/close");
              return defaultCloseUrl.startsWith('https://') 
                ? defaultCloseUrl
                : `https://${defaultCloseUrl.replace(/^https?:\/\//, '')}`;
            })(),
        currency: "WON",
        goodname: goodsName ?? description ?? "콘텐츠 결제",
        buyername: buyerName ?? "",
        buyeremail: buyerEmail ?? "",
        buyertel: buyerTel ?? "",
        gopaymethod: method === "kakaopay" ? "KAKAOPAY" : "Card:DirectBank:VBank:HPP",
        // acceptmethod: centerCd(Y) 필수 포함 (IDC센터코드 수신용)
        // HPP(1) 또는 HPP(2): 휴대폰결제 상품유형 (1:컨텐츠, 2:실물)
        // below1000: 1000원 이하 결제 가능 옵션
        // va_receipt: 현금영수증 UI 노출
        acceptmethod: metadata.acceptmethod ?? "HPP(1):va_receipt:below1000:centerCd(Y)",
        languageView: "ko",
        charSet: "utf-8",
        payViewType: metadata.payViewType ?? "overlay",
      },
    };

    return buildResponse({
      success: true,
      data: {
        paymentId: orderId,
        transactionId,
        paymentUrl: requestForm.action,
        requestForm,
        additionalData: {
          timestamp,
          mid,
          method,
        },
      },
    });
  } catch (error) {
    console.error("[inicis-init] Unexpected error", error);
    
    // 에러 발생 시에도 CORS 헤더 포함
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          message: "KG이니시스 결제 초기화 중 오류가 발생했습니다.",
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






