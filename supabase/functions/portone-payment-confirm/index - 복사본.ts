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

const buildResponse = <T>(payload: T, status = 200, origin?: string) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
  });

interface PortOnePaymentResponse {
  id: string;
  status: string;
  amount: {
    total: number;
    currency: string;
  };
  orderId?: string;
  transactionId?: string;
  metadata?: Record<string, unknown>;
  virtualAccount?: any;
  raw?: any; // [진단용] 원본 데이터 포함
}

async function getPortOneAccessToken(apiSecret: string): Promise<string> {
  const cleanSecret = apiSecret.replace(/[\s"']/g, "").trim();
  
  const response = await fetch("https://api.portone.io/login/api-secret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiSecret: cleanSecret }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[portone-payment-confirm] 토큰 발급 실패", { status: response.status, body: errorText });
    throw new Error(`Failed to login to PortOne: ${errorText}`);
  }

  const result = await response.json();
  return result.accessToken;
}

async function getPortOnePayment(
  paymentId: string,
  apiSecret: string
): Promise<PortOnePaymentResponse> {
  
  const accessToken = await getPortOneAccessToken(apiSecret);
  const url = `https://api.portone.io/v2/payments/${paymentId}`;
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[portone-payment-confirm] API 조회 실패", { status: response.status, body: errorText });
    throw new Error(`PortOne API error: ${response.status} ${errorText}`);
  }

  const rawResult = await response.json();
  
  // [진단] 구조 파악을 위해 로그 출력
  console.log(`[DEBUG] PaymentID: ${paymentId} 원본 응답 구조 확인`);

  if (rawResult.payment && rawResult.payment.transactions && rawResult.payment.transactions.length > 0) {
    const tx = rawResult.payment.transactions[0];
    
    // 4군데 탐색
    const foundVirtualAccount = 
      tx.virtual_account || 
      tx.virtualAccount || 
      rawResult.payment.virtual_account || 
      rawResult.payment.virtualAccount;

    return {
      id: rawResult.payment.id,
      transactionId: tx.id,
      status: tx.status,
      amount: tx.amount,
      orderId: rawResult.payment.order_name,
      metadata: tx.metadata || {},
      virtualAccount: foundVirtualAccount,
      raw: rawResult // [진단용] 원본 통째로 넘김
    };
  }

  console.error("[portone-payment-confirm] 예상치 못한 응답 구조", rawResult);
  throw new Error("Invalid payment data structure from PortOne");
}

function compareAmounts(
  portoneAmount: number,
  portoneCurrency: string,
  orderAmountKRW: number
): boolean {
  let portoneAmountInKRW: number;
  if (portoneCurrency === "CURRENCY_USD" || portoneCurrency === "USD") {
    portoneAmountInKRW = (portoneAmount / 100) * 1300; 
  } else if (portoneCurrency === "CURRENCY_JPY" || portoneCurrency === "JPY") {
    portoneAmountInKRW = portoneAmount * 10;
  } else {
    portoneAmountInKRW = portoneAmount;
  }
  const tolerance = orderAmountKRW * 0.01;
  return Math.abs(portoneAmountInKRW - orderAmountKRW) <= tolerance;
}

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: getCorsHeaders(origin) });

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const portoneApiKey = requireEnv("PORTONE_API_KEY");

    const payload = await req.json();
    const { paymentId, orderId } = payload;

    if (!paymentId) {
      return buildResponse({ success: false, error: { message: "paymentId is required" } }, 400, origin);
    }

    // 포트원 결제 정보 조회
    const portonePayment = await getPortOnePayment(paymentId, portoneApiKey);

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    let orderData = null;
    
    // transaction_id로 찾기
    const { data: byTxId } = await supabase
      .from("orders")
      .select("*")
      .eq("transaction_id", paymentId)
      .maybeSingle();
      
    if (byTxId) {
      orderData = byTxId;
    } else if (orderId) {
      const { data: byOrderId } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();
      orderData = byOrderId;
    }

    if (!orderData) {
       console.error("주문을 찾을 수 없음", { paymentId, orderId });
       return buildResponse({ success: false, error: { message: "Order not found" } }, 404, origin);
    }

    const order = orderData;
    
    // 상태 확인
    const paymentStatus = portonePayment.status;
    const isVirtualAccountIssued = paymentStatus === "VIRTUAL_ACCOUNT_ISSUED";
    const isPaid = paymentStatus === "PAID";

    // 가상계좌 발급 상태(VIRTUAL_ACCOUNT_ISSUED)는 정상 진행 상태로 인정
    if (!isPaid && !isVirtualAccountIssued) {
       console.warn("결제 상태가 PAID/VIRTUAL_ACCOUNT_ISSUED가 아님", paymentStatus);
       return buildResponse({ success: false, error: { message: `Payment status is ${paymentStatus}` } }, 400, origin);
    }

    // 가상계좌 정보 추출
    const va = portonePayment.virtualAccount;
    
    // [진단] 가상계좌 상태인데 정보가 없으면, 원본 데이터를 로그에 강제로 찍음
    if (isVirtualAccountIssued && !va) {
        console.error("🚨 [긴급 진단] 가상계좌 발급됨 상태이나 정보가 추출되지 않음!");
        console.error("🚨 [원본 데이터 덤프]:", JSON.stringify(portonePayment.raw, null, 2));
    }

    const virtualAccountInfo = va ? {
      bankName: va.bankName || va.bank_name || va.bank || va.bankCode || va.bank_code || null,
      accountNumber: va.accountNumber || va.account_number || null,
      accountHolder: va.accountHolder || va.account_holder || null,
      expiresAt: va.expiresAt || va.expires_at || va.expired_at || va.valid_until || null,
    } : null;

    // DB 업데이트
    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      transaction_id: paymentId,
      payment_provider: "portone",
      payment_confirmed_at: nowIso,
      metadata: {
        ...(order.metadata || {}),
        portone_status: paymentStatus,
        portone_payment_id: paymentId,
      },
    };

    if (isPaid) {
      updatePayload.payment_status = "paid";
      updatePayload.status = "completed";
    } else if (isVirtualAccountIssued) {
      updatePayload.payment_status = "awaiting_deposit";
      updatePayload.status = "pending";
      if (virtualAccountInfo) {
        updatePayload.virtual_account_info = virtualAccountInfo;
      }
    }

    const { error: updateError, data: updatedOrder } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", order.id)
      .select()
      .maybeSingle();

    if (updateError) {
      console.error("[portone-payment-confirm] DB 업데이트 실패:", updateError);
      throw updateError;
    }

    const responseOrder = updatedOrder || order;
    
    console.log("[portone-payment-confirm] 결제 처리 완료:", {
      orderId: responseOrder.id,
      paymentStatus,
      isVirtualAccountIssued,
      hasVirtualAccountInfo: !!virtualAccountInfo,
      // 정보가 있다면 살짝 보여줌
      virtualAccountSummary: virtualAccountInfo ? `${virtualAccountInfo.bankName} ${virtualAccountInfo.accountNumber}` : "NONE"
    });

    return buildResponse({
      success: true,
      data: {
        order: responseOrder,
        status: paymentStatus,
        paymentId,
        virtualAccountInfo,
      },
    }, 200, origin);

  } catch (error) {
    console.error("[portone-payment-confirm] Error:", error);
    return buildResponse(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : "Internal server error",
          details: error 
        },
      },
      500,
      origin
    );
  }
});
