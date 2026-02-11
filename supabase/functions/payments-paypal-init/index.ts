import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";



// CORS — 실패하든 성공하든 항상 이 헤더를 반환해야 한다

const getCorsHeaders = (origin?: string) => ({

  "Access-Control-Allow-Origin": origin || "*",

  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",

  "Access-Control-Allow-Headers": "apikey, authorization, x-client-info, x-client-id, x-supabase-auth, content-type",

  "Access-Control-Max-Age": "86400",

});



// 파싱 안전 함수

async function safeJson(req: Request) {

  try {

    return await req.json();

  } catch {

    return {};

  }

}



// USD 변환 (사이트 환율: 1000원 = $1)
// ⚠️ 이 함수는 클라이언트에서 amountUSD가 전달되지 않았을 때만 fallback으로 사용
function convertKRWtoUSD(krw: number) {

  return +(krw / 1000).toFixed(2); // 사이트 표시 가격과 동일한 환율 적용

}



// PayPal API Base URL (Live only)
const PAYPAL_BASE_URL = "https://api-m.paypal.com";

// PayPal 토큰 요청

async function getPayPalAccessToken(clientId: string, clientSecret: string) {

  console.log(`[paypal-init] getPayPalAccessToken - baseUrl = ${PAYPAL_BASE_URL}`);

  const basicAuth = btoa(`${clientId}:${clientSecret}`);



  const res = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {

    method: "POST",

    headers: {

      "Content-Type": "application/x-www-form-urlencoded",

      "Authorization": `Basic ${basicAuth}`,

    },

    body: "grant_type=client_credentials",

  });



  if (!res.ok) {

    const errorText = await res.text();

    console.error(`[paypal-init] PayPal token error - status: ${res.status}, body: ${errorText}`);

    throw new Error(`PayPal token error: ${res.status} ${errorText}`);

  }

  return (await res.json()).access_token;

}



serve(async (req: Request) => {

  const origin = req.headers.get("origin") ?? "";

  const corsHeaders = getCorsHeaders(origin);



  // ===== OPTIONS (CORS preflight) =====

  if (req.method === "OPTIONS") {

    return new Response(null, {

      status: 204,

      headers: corsHeaders,

    });

  }



  // ===== POST only =====

  if (req.method !== "POST") {

    return new Response(JSON.stringify({ error: "Method not allowed" }), {

      status: 405,

      headers: { ...corsHeaders, "Content-Type": "application/json" },

    });

  }



  // ===== JSON 파싱 =====

  const body = await safeJson(req);



  const userId = body.userId;

  const orderId = body.orderId;

  const amountKRW = body.amount; // 프론트에서 보내는 값 그대로 사용

  const description = body.description ?? "";

  const buyerEmail = body.buyerEmail ?? "";

  const buyerName = body.buyerName ?? "";



  if (!userId || !orderId || !amountKRW) {

    return new Response(

      JSON.stringify({

        success: false,

        error: { message: "userId, orderId, amount are required" }

      }),

      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }

    );

  }

  // 클라이언트에서 사이트 환율로 변환한 amountUSD를 우선 사용
  // amountUSD가 없으면 fallback으로 서버에서 변환
  const amountUSD = body.amountUSD ? +Number(body.amountUSD).toFixed(2) : convertKRWtoUSD(amountKRW);
  console.log(`[paypal-init] 금액 변환: KRW=${amountKRW}, USD=${amountUSD}, clientUSD=${body.amountUSD}`);



  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const CLIENT_ID = Deno.env.get("PAYPAL_LIVE_CLIENT_ID") ?? "";

  const SECRET = Deno.env.get("PAYPAL_LIVE_SECRET") ?? "";

  console.log(`[paypal-init] Using PayPal Live API - baseUrl = ${PAYPAL_BASE_URL}`);



  const supabase = createClient(supabaseUrl, serviceRole);



  // 주문 정보 조회

  const { data: order } = await supabase

    .from("orders")

    .select("*")

    .eq("id", orderId)

    .eq("user_id", userId)

    .single();



  if (!order) {

    console.error(`[paypal-init] Order not found - orderId: ${orderId}, userId: ${userId}`);

    return new Response(JSON.stringify({

      success: false,

      error: { message: "Order not found" }

    }), {

      status: 404,

      headers: { ...corsHeaders, "Content-Type": "application/json" },

    });

  }



  // PayPal token

  console.log("[paypal-init] env check", {

    clientId: CLIENT_ID.slice(0, 8),

    secretLen: SECRET.length,

  });

  let token: string;

  try {

    token = await getPayPalAccessToken(CLIENT_ID, SECRET);

    console.log(`[paypal-init] PayPal token obtained successfully`);

  } catch (error) {

    console.error(`[paypal-init] Failed to get PayPal token:`, error);

    return new Response(JSON.stringify({

      success: false,

      error: {

        message: error instanceof Error ? error.message : "Failed to get PayPal access token"

      }

    }), {

      status: 500,

      headers: { ...corsHeaders, "Content-Type": "application/json" },

    });

  }



  console.log(`[paypal-init] Creating PayPal order - baseUrl = ${PAYPAL_BASE_URL}`);



  // PayPal order 생성

  const defaultHeaders = {

    "Content-Type": "application/json",

    "Authorization": `Bearer ${token}`,

  };



  const paypalRes = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {

    method: "POST",

    headers: defaultHeaders,

    body: JSON.stringify({

      intent: "CAPTURE",

      purchase_units: [{

        reference_id: orderId,

        amount: { currency_code: "USD", value: amountUSD.toString() },

        description,

      }],

      application_context: {
        brand_name: "CopyDrum",
        user_action: "PAY_NOW",
        return_url: body.returnUrl ?? "https://en.copydrum.com/paypal/return",
        cancel_url: body.cancelUrl ?? "https://en.copydrum.com/paypal/cancel",
      },
    }),
  });

  const paypalOrder = await paypalRes.json();



  if (!paypalRes.ok) {

    console.error(`[paypal-init] PayPal order creation failed - status: ${paypalRes.status}, body:`, JSON.stringify(paypalOrder));

    return new Response(JSON.stringify({

      success: false,

      error: {

        message: `PayPal order creation failed: ${paypalRes.status}`,

        details: paypalOrder

      }

    }), {

      status: 500,

      headers: { ...corsHeaders, "Content-Type": "application/json" },

    });

  }

  console.log(`[paypal-init] PayPal order created successfully - orderId: ${paypalOrder.id}`);



  const approvalUrl = paypalOrder.links?.find((l: any) => l.rel === "approve")?.href;

  console.log(`[paypal-init] Approval URL: ${approvalUrl}`);



  if (!approvalUrl) {

    console.error(`[paypal-init] Approval URL not found in PayPal order response`);

    return new Response(JSON.stringify({

      success: false,

      error: {

        message: "PayPal approval URL not found"

      }

    }), {

      status: 500,

      headers: { ...corsHeaders, "Content-Type": "application/json" },

    });

  }



  return new Response(

    JSON.stringify({

      success: true,

      data: {

        orderId,

        paypalOrderId: paypalOrder.id,

        approvalUrl,

      },

    }),

    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },

  );

});
