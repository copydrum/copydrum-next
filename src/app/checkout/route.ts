import { NextRequest, NextResponse } from "next/server";
import DodoPayments from "dodopayments";

// USD 할인 적용 언어 (Discount 그룹: 1500원 = $1)
const USD_DISCOUNT_LOCALES = ["vi", "th", "id", "hi", "pt", "tr", "ru", "uk"];

type DodoCurrency = "KRW" | "EUR" | "USD";

/**
 * 사이트 로케일에 따라 결제 통화를 결정합니다.
 */
function chooseCurrency(locale?: string): DodoCurrency {
  if (!locale) return "USD";
  const l = locale.toLowerCase().split("-")[0];
  if (l === "ko") return "KRW";
  if (["de", "fr", "it", "es"].includes(l)) return "EUR";
  return "USD";
}

/**
 * KRW 금액을 대상 통화의 최소 단위(센트)로 변환합니다.
 *
 * 변환 규칙:
 * - KRW: 그대로 반환 (원 단위)
 * - EUR: 1000원 = €1 → cents = krw / 10
 * - USD Standard: 1000원 = $1 → cents = krw / 10
 * - USD Discount (vi, th, id 등): 1500원 = $1 → cents = krw / 15
 */
function convertKrwToCents(
  krwAmount: number,
  currency: DodoCurrency,
  locale?: string
): number {
  if (currency === "KRW") return Math.round(krwAmount);

  if (currency === "EUR") {
    // EUR: 1000원 = €1 → cents = krw / 1000 * 100 = krw / 10
    return Math.round(krwAmount / 10);
  }

  if (currency === "USD") {
    const localeCode = locale?.split("-")[0];
    // USD Discount 언어: 1500원 = $1 → cents = krw / 1500 * 100 = krw / 15
    if (localeCode && USD_DISCOUNT_LOCALES.includes(localeCode)) {
      return Math.round(krwAmount / 15);
    }
    // USD Standard: 1000원 = $1 → cents = krw / 1000 * 100 = krw / 10
    return Math.round(krwAmount / 10);
  }

  return Math.round(krwAmount);
}

/**
 * 로케일에서 언어 코드만 추출합니다.
 */
function forceLanguage(locale?: string): string {
  if (!locale) return "en";
  const base = locale.split("-")[0]?.toLowerCase() || "en";
  return base;
}

// DodoPayments SDK 클라이언트 초기화
const client = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
  environment:
    (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") ||
    "test_mode",
});

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, any> = {};
    try {
      body = await req.json();
    } catch {
      // body가 비어있을 수 있음
    }

    const {
      amount, // KRW 금액 (DB 기준)
      orderName, // 주문명
      orderId: bodyOrderId, // DB 주문 ID (결제 성공 후 리다이렉트에 사용)
      customer, // { email, name }
      metadata, // 메타데이터 (orderId 등)
      locale, // 사이트 로케일
    } = body;

    const hdrLocale = req.headers.get("x-site-locale") || undefined;
    const resolvedLocale = locale ?? hdrLocale ?? "en";

    // 금액 검증
    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "Invalid or missing amount" },
        { status: 400 }
      );
    }

    // 통화 결정 & KRW → 대상 통화 센트 변환
    const currency = chooseCurrency(resolvedLocale);
    const priceInCents = convertKrwToCents(amount, currency, resolvedLocale);

    if (priceInCents <= 0) {
      return NextResponse.json(
        { error: "Converted amount is too small" },
        { status: 400 }
      );
    }

    console.log(
      `[Dodo Checkout] Creating product: "${orderName}", ${amount} KRW → ${priceInCents} ${currency} (smallest unit)`
    );

    // ━━━ Step 1: 상품 즉시 생성 (Create Product on-the-fly) ━━━
    const product = await client.products.create({
      name: orderName || "CopyDrum Order",
      price: {
        type: "one_time_price",
        currency: currency,
        price: priceInCents,
        discount: 0,
        purchasing_power_parity: false,
      },
      tax_category: "digital_products",
      description: `CopyDrum order: ${orderName || "Digital drum sheet"}`,
    });

    console.log(`[Dodo Checkout] Product created: ${product.product_id}`);

    // ━━━ Step 2: 체크아웃 세션 생성 ━━━
    const origin =
      req.headers.get("origin") || "http://localhost:3000";
    // Include locale prefix in return URL so the success page knows the user's language
    const localePrefix = resolvedLocale ? `/${resolvedLocale.split('-')[0].toLowerCase()}` : '';
    // Include orderId and method in return URL so the success page can load the order
    // ⚠️ Dodo Payments는 return URL에 자체 query string(?payment_id=&status=)을 추가하므로
    //    orderId는 URL path에 포함시키거나 sessionStorage로 전달해야 합니다.
    const dbOrderId = bodyOrderId || metadata?.orderId || '';
    const returnUrl = `${origin}${localePrefix}/payment/success?orderId=${encodeURIComponent(dbOrderId)}&method=dodo`;
    
    console.log(`[Dodo Checkout] Return URL: ${returnUrl}`);

    const session = await client.checkoutSessions.create({
      product_cart: [
        {
          product_id: product.product_id,
          quantity: 1,
        },
      ],
      customer: customer?.email
        ? {
            email: customer.email,
            name: customer.name || undefined,
          }
        : undefined,
      return_url: returnUrl,
      billing_currency: currency,
      customization: {
        force_language: forceLanguage(resolvedLocale),
      },
      feature_flags: {
        allow_currency_selection: true,
      },
      metadata: {
        ...(metadata || {}),
        source: "copydrum_checkout",
      },
    });

    console.log(
      `[Dodo Checkout] Session created: ${session.session_id}, URL: ${session.checkout_url}`
    );

    // ━━━ Step 3: 응답 반환 ━━━
    return NextResponse.json({
      session_id: session.session_id,
      checkout_url: session.checkout_url,
    });
  } catch (error) {
    console.error("[Dodo Checkout] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Checkout session creation failed",
      },
      { status: 500 }
    );
  }
}
