// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// CORS 헤더 (프런트에서 fetch로 호출할 때 필요)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// Supabase Secrets 에서 값 가져오기
const CLIENT_ID = Deno.env.get("PAYPAL_LIVE_CLIENT_ID") ?? ""
const SECRET = Deno.env.get("PAYPAL_LIVE_SECRET") ?? ""
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://en.copydrum.com"

// PayPal API Base URL (Live only)
const PAYPAL_BASE_URL = "https://api-m.paypal.com"

console.log("payments-paypal-create function loaded")

Deno.serve(async (req) => {
  // ✅ CORS 프리플라이트 처리
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders,
    })
  }

  try {
    const body = await req.json().catch(() => ({}))

    // 프런트에서 넘겨줄 값 (예: { amount: 9.99, currency_code: "USD", orderId: "1234" })
    const amount = body.amount ?? 0
    const currencyCode = body.currency_code ?? "USD"
    const orderId = body.orderId ?? "COPYDRUM_ORDER"

    console.log("[paypal-create] env check", {
      clientId: CLIENT_ID.slice(0, 8),
      secretLen: SECRET.length,
    });

    if (!amount || !CLIENT_ID || !SECRET) {
      return new Response(
        JSON.stringify({ error: "Missing amount or PayPal credentials" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      )
    }

    // 1) 액세스 토큰 발급
    const basicAuth = btoa(`${CLIENT_ID}:${SECRET}`)

    const tokenRes = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basicAuth}`,
      },
      body: "grant_type=client_credentials",
    })

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text()
      console.error("PayPal token error:", errorText)
      return new Response(
        JSON.stringify({ error: "Failed to get PayPal token" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      )
    }

    const tokenData = await tokenRes.json()
    const accessToken = tokenData.access_token as string

    // 2) 주문 생성
    const defaultHeaders = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    };

    const createRes = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: "POST",
      headers: defaultHeaders,
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: orderId,
            amount: {
              currency_code: currencyCode,
              value: amount.toString(),
            },
          },
        ],
        application_context: {
          brand_name: "COPYDRUM",
          user_action: "PAY_NOW",
          return_url: "https://en.copydrum.com/paypal/return",
          cancel_url: "https://en.copydrum.com/paypal/cancel",
        },
      }),
    })

    const orderData = await createRes.json()

    if (!createRes.ok) {
      console.error("PayPal create error:", orderData)
      return new Response(
        JSON.stringify({ error: "Failed to create PayPal order", details: orderData }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      )
    }

    // 승인 URL 찾기
    const approvalUrl = (orderData.links ?? []).find(
      (l: any) => l.rel === "approve",
    )?.href

    return new Response(
      JSON.stringify({
        id: orderData.id,
        status: orderData.status,
        approvalUrl,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    )
  } catch (err) {
    console.error("Unexpected error in payments-paypal-create:", err)
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: String(err) }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    )
  }
})

/*
로컬 테스트 예시:

curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/payments-paypal-create' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"amount": 9.99, "currency_code": "USD", "orderId": "TEST_ORDER_123"}'

*/
