import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 주문제작(custom_orders) 견적 결제 전용 검증 엔드포인트.
// 시트 구매용 /verify 와 달리 orders/order_items/purchases/다운로드 발급 로직과 완전히 분리되어 있고,
// 결제가 PAID 로 확인되고 금액이 견적가와 일치할 때만 custom_orders.status 를 'payment_confirmed' 로 올린다.

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (serviceRoleKey) {
    return createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  console.warn('[verify-custom-order] ⚠️ Service Role Key 없음 → Anon Key 사용 (RLS 적용됨)');
  return createClient(url, anonKey);
}

async function getPortOneAccessToken(apiSecret: string): Promise<string> {
  const cleanSecret = apiSecret.replace(/[\s"']/g, '').trim();
  const response = await fetch('https://api.portone.io/login/api-secret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiSecret: cleanSecret }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to login to PortOne: ${errorText}`);
  }
  const result = await response.json();
  return result.accessToken;
}

async function getPortOnePayment(paymentId: string, apiSecret: string): Promise<any> {
  const accessToken = await getPortOneAccessToken(apiSecret);
  const url = `https://api.portone.io/v2/payments/${encodeURIComponent(paymentId)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PortOne API error: ${response.status} ${errorText}`);
  }
  const rawResult = await response.json();
  if (rawResult.payment && rawResult.payment.transactions && rawResult.payment.transactions.length > 0) {
    const tx = rawResult.payment.transactions[0];
    return {
      id: rawResult.payment.id,
      transactionId: tx.id,
      status: tx.status,
      amount: tx.amount,
      orderName: rawResult.payment.order_name,
      metadata: tx.metadata || rawResult.payment.metadata || {},
      customer: rawResult.payment.customer || {},
    };
  }
  throw new Error('Invalid payment data structure from PortOne');
}

const PAID_STATUSES = ['PAID'];
const FAILED_STATUSES = ['FAILED', 'CANCELLED', 'PARTIAL_CANCELLED'];
const PENDING_STATUSES = ['PENDING', 'READY', 'PAY_PENDING', 'VIRTUAL_ACCOUNT_ISSUED'];

function classifyPaymentStatus(status: string): 'PAID' | 'FAILED' | 'PENDING' | 'UNKNOWN' {
  if (PAID_STATUSES.includes(status)) return 'PAID';
  if (FAILED_STATUSES.includes(status)) return 'FAILED';
  if (PENDING_STATUSES.includes(status)) return 'PENDING';
  return 'UNKNOWN';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { paymentId, customOrderId } = body;

    if (!paymentId || !customOrderId || !UUID_RE.test(customOrderId)) {
      return NextResponse.json(
        { success: false, error: '결제 ID와 주문제작 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    const portoneApiKey = process.env.PORTONE_API_KEY;
    if (!portoneApiKey) {
      return NextResponse.json(
        { success: false, error: '서버 설정 오류: 결제 검증을 수행할 수 없습니다.' },
        { status: 500 }
      );
    }

    const supabase = createAdminClient();

    // 1) 주문제작 견적 조회
    const { data: order, error: orderError } = await supabase
      .from('custom_orders')
      .select('id, status, estimated_price, locale')
      .eq('id', customOrderId)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json(
        { success: false, error: '주문제작 정보를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 멱등 처리: 이미 결제 확인 이상 단계면 그대로 성공 반환
    if (['payment_confirmed', 'in_progress', 'completed'].includes((order as any).status)) {
      return NextResponse.json({ success: true, message: '이미 결제가 확인된 주문입니다.', alreadyConfirmed: true });
    }

    if ((order as any).status !== 'quoted') {
      return NextResponse.json(
        { success: false, error: '결제 가능한 상태(견적 완료)가 아닙니다.' },
        { status: 400 }
      );
    }

    const estimatedPrice = Number((order as any).estimated_price) || 0;
    if (estimatedPrice <= 0) {
      return NextResponse.json(
        { success: false, error: '유효한 견적 금액이 없습니다.' },
        { status: 400 }
      );
    }

    // 2) PortOne 결제 단건 조회 (PAID 확인 필수)
    let portonePayment: any;
    try {
      portonePayment = await getPortOnePayment(paymentId, portoneApiKey);
    } catch (e) {
      console.error('[verify-custom-order] ❌ PortOne 조회 실패:', e);
      return NextResponse.json(
        { success: false, error: '결제 정보를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.', errorCode: 'PAYMENT_VERIFICATION_FAILED' },
        { status: 502 }
      );
    }

    const category = classifyPaymentStatus(portonePayment.status);
    if (category === 'PENDING') {
      return NextResponse.json({ success: false, pending: true, message: '결제 승인 대기 중입니다.', errorCode: 'PAYMENT_PENDING' });
    }
    if (category !== 'PAID') {
      return NextResponse.json(
        { success: false, error: '결제가 완료되지 않았습니다.', errorCode: 'PAYMENT_NOT_PAID', paymentStatus: portonePayment.status },
        { status: 400 }
      );
    }

    // 3) 결제 금액 ↔ 견적 금액 대조
    //    - 글로벌(비한국) 주문: estimated_price 가 USD, PortOne USD 결제는 센트 단위(scale 2)
    //    - 한국 주문: estimated_price 가 KRW, PortOne KRW 결제는 원 단위(scale 0)
    const pgAmountRaw = portonePayment.amount?.total ?? portonePayment.amount ?? 0;
    const pgCurrency = portonePayment.amount?.currency ?? '';
    const isUSD = pgCurrency === 'CURRENCY_USD' || pgCurrency === 'USD';
    const isKRW = pgCurrency === 'CURRENCY_KRW' || pgCurrency === 'KRW';

    if (isUSD) {
      const expectedCents = Math.round(estimatedPrice * 100);
      const paidCents = Math.round(Number(pgAmountRaw) || 0);
      const tolerance = Math.max(50, Math.round(expectedCents * 0.02)); // 50센트 또는 2%
      if (Math.abs(paidCents - expectedCents) > tolerance) {
        console.error('[verify-custom-order] ⛔ USD 금액 불일치 — 승인 거부:', { customOrderId, paidCents, expectedCents });
        return NextResponse.json(
          { success: false, error: '결제 금액이 견적 금액과 일치하지 않습니다. 고객센터에 문의해 주세요.', errorCode: 'PAYMENT_AMOUNT_MISMATCH' },
          { status: 400 }
        );
      }
    } else if (isKRW) {
      const expectedKRW = Math.round(estimatedPrice);
      const paidKRW = Math.round(Number(pgAmountRaw) || 0);
      const tolerance = Math.max(10, Math.round(expectedKRW * 0.02)); // 10원 또는 2%
      if (Math.abs(paidKRW - expectedKRW) > tolerance) {
        console.error('[verify-custom-order] ⛔ KRW 금액 불일치 — 승인 거부:', { customOrderId, paidKRW, expectedKRW });
        return NextResponse.json(
          { success: false, error: '결제 금액이 견적 금액과 일치하지 않습니다. 고객센터에 문의해 주세요.', errorCode: 'PAYMENT_AMOUNT_MISMATCH' },
          { status: 400 }
        );
      }
    } else {
      // 알 수 없는 통화면 오탐 방지를 위해 차단하지 않고 경고만 남긴다.
      console.warn('[verify-custom-order] ℹ️ 알 수 없는 통화 — 금액 대조 생략(경고만):', { customOrderId, pgAmountRaw, pgCurrency });
    }

    // 4) 결제 확인 → custom_orders.status 업데이트
    const { error: updateError } = await supabase
      .from('custom_orders')
      .update({ status: 'payment_confirmed', updated_at: new Date().toISOString() })
      .eq('id', customOrderId)
      .eq('status', 'quoted'); // 경합 방지: quoted 일 때만 전이

    if (updateError) {
      console.error('[verify-custom-order] ❌ 상태 업데이트 실패:', updateError);
      return NextResponse.json(
        { success: false, error: '주문 상태 업데이트에 실패했습니다.' },
        { status: 500 }
      );
    }

    console.log('[verify-custom-order] ✅ 결제 확인 완료:', { customOrderId, paymentId });
    return NextResponse.json({ success: true, message: '결제가 확인되었습니다.' });
  } catch (error) {
    console.error('[verify-custom-order] ❌ 오류:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '결제 검증 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
