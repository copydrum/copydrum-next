import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { completeOrderAfterPayment } from '@/lib/payments/completeOrderAfterPayment';
import type { PaymentMethod } from '@/lib/payments/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 결제 재조정(reconciliation) 크론
//
// 목적: "PG(PortOne)에서는 결제가 완료(PAID)됐지만, 클라이언트가 success 페이지에
//        도달하지 못해(콜백 실패·창 종료·새로고침 등) 주문이 pending으로 멈춘" 경우를
//        서버 측에서 주기적으로 따라잡아 자동 완료 처리한다.
//
// 동작:
//   1) transaction_id가 있고 아직 pending인 최근 주문을 조회 (무통장/가상계좌 제외)
//   2) PortOne API로 결제 상태를 재조회
//   3) PAID면 completeOrderAfterPayment로 주문 완료 + 구매기록 생성
//      FAILED/CANCELLED면 주문을 failed 처리
//      PENDING이면 그대로 둠 (다음 주기에 재시도)
//
// 보안: CRON_SECRET 환경변수가 설정돼 있으면 Authorization: Bearer <secret> 필요.
//       (Vercel Cron은 자동으로 인증 헤더를 부여하지만, 추가 시크릿으로 이중 보호)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 재조정 대상 조회 범위 (최근 N시간 내 생성된 주문만)
const LOOKBACK_HOURS = 72;
// 한 번 실행에서 처리할 최대 주문 수 (타임아웃 방지)
const MAX_ORDERS_PER_RUN = 50;

// PortOne 결제 상태 분류 (verify 라우트와 동일 화이트리스트)
const PAID_STATUSES = ['PAID'];
const FAILED_STATUSES = ['FAILED', 'CANCELLED', 'PARTIAL_CANCELLED'];
const PENDING_STATUSES = ['PENDING', 'READY', 'PAY_PENDING', 'VIRTUAL_ACCOUNT_ISSUED'];

// 무통장입금/가상계좌는 PG 자동완료 대상이 아니므로 재조정에서 제외
const EXCLUDED_METHODS = new Set(['bank_transfer', 'virtual_account', 'transfer', 'bank']);

function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (serviceRoleKey) {
    return createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
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
    throw new Error(`Failed to login to PortOne: ${await response.text()}`);
  }
  const result = await response.json();
  return result.accessToken;
}

interface PortOneStatus {
  status: string;
  amountTotal: number;
  currency: string;
  pgProvider: string;
  payMethod: string;
}

// PortOne V2 단건 조회. 상태 판정은 권위 있는 top-level status를 사용
// (PayPal 등 비동기 결제에서 transactions[0]가 비-primary일 수 있어 오판 방지)
async function getPortOnePaymentStatus(
  paymentId: string,
  accessToken: string,
): Promise<PortOneStatus | null> {
  const res = await fetch(`https://api.portone.io/v2/payments/${encodeURIComponent(paymentId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });

  if (res.status === 404) {
    // 결제 자체가 존재하지 않음 (사용자가 결제창만 열고 닫은 경우 등) → 재조정 대상 아님
    return null;
  }
  if (!res.ok) {
    throw new Error(`PortOne API error: ${res.status} ${await res.text()}`);
  }

  const raw = await res.json();
  const payment = raw.payment || raw;
  const txs = payment.transactions;
  const tx =
    Array.isArray(txs) && txs.length > 0
      ? txs.find((t: any) => t.is_primary === true || t.isPrimary === true) ?? txs[0]
      : {};

  // top-level status 우선, 없으면 primary 트랜잭션 status
  const status = String(payment.status || tx.status || '').toUpperCase();
  const amount = tx.amount || payment.amount || {};
  const channel = payment.channel || tx.channel || {};

  return {
    status,
    amountTotal: Number(amount.total ?? amount ?? 0),
    currency: String(amount.currency ?? 'CURRENCY_KRW'),
    pgProvider: String(channel.pg_provider || channel.pgProvider || channel.type || '').toLowerCase(),
    payMethod: String(tx.pay_method || tx.payMethod || payment.pay_method || '').toUpperCase(),
  };
}

// PortOne 응답으로 결제수단 추론 (payment_method 보정용)
function inferPaymentMethod(p: PortOneStatus, fallback: string | null): PaymentMethod {
  if (p.pgProvider.includes('kakao') || p.payMethod === 'EASY_PAY') return 'kakaopay';
  if (p.pgProvider.includes('paypal')) return 'paypal';
  if (p.payMethod === 'TRANSFER') return 'transfer';
  if (p.payMethod === 'VIRTUAL_ACCOUNT') return 'virtual_account';
  if (p.payMethod === 'CARD') return 'card';
  // PG 응답에 명확한 단서가 없으면 기존 주문값(있으면) 사용, 없으면 card
  if (fallback && fallback !== 'paypal') return fallback as PaymentMethod;
  return 'card';
}

// KRW 결제 금액 검증 (해외 통화는 환율 모호성으로 검증 생략)
function isAmountValid(pgAmount: number, pgCurrency: string, orderTotalKRW: number): boolean {
  const isKRW = pgCurrency === 'CURRENCY_KRW' || pgCurrency === 'KRW';
  if (!isKRW || !orderTotalKRW || orderTotalKRW <= 0) return true;
  const tolerance = Math.max(10, Math.round(orderTotalKRW * 0.02));
  return Math.abs(Math.round(pgAmount) - orderTotalKRW) <= tolerance;
}

async function handleReconcile(request: NextRequest) {
  // ── 인증 ──
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  const portoneApiKey = process.env.PORTONE_API_KEY;
  if (!portoneApiKey) {
    return NextResponse.json(
      { success: false, error: 'PORTONE_API_KEY 미설정' },
      { status: 500 },
    );
  }

  const supabase = createAdminClient();
  const sinceIso = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  // 재조정 후보 조회: pending + transaction_id 있음 + 최근 생성
  const { data: candidates, error: queryError } = await supabase
    .from('orders')
    .select('id, order_number, status, payment_status, payment_method, transaction_id, total_amount, created_at')
    .eq('status', 'pending')
    .not('transaction_id', 'is', null)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(MAX_ORDERS_PER_RUN);

  if (queryError) {
    console.error('[reconcile-payments] 후보 주문 조회 실패:', queryError);
    return NextResponse.json({ success: false, error: queryError.message }, { status: 500 });
  }

  const result = {
    scanned: 0,
    completed: 0,
    failed: 0,
    stillPending: 0,
    skipped: 0,
    errors: 0,
    details: [] as Array<Record<string, unknown>>,
  };

  let accessToken: string;
  try {
    accessToken = await getPortOneAccessToken(portoneApiKey);
  } catch (e) {
    console.error('[reconcile-payments] PortOne 토큰 발급 실패:', e);
    return NextResponse.json(
      { success: false, error: 'PortOne 인증 실패' },
      { status: 502 },
    );
  }

  for (const order of candidates || []) {
    result.scanned++;

    // 무통장/가상계좌는 PG 자동완료 대상이 아님 (입금 대기 상태)
    const methodKey = (order.payment_method || '').toLowerCase();
    if (EXCLUDED_METHODS.has(methodKey) || order.payment_status === 'awaiting_deposit') {
      result.skipped++;
      continue;
    }

    const paymentId = order.transaction_id as string;

    try {
      const pg = await getPortOnePaymentStatus(paymentId, accessToken);

      if (!pg) {
        result.skipped++;
        continue;
      }

      if (PAID_STATUSES.includes(pg.status)) {
        // 금액 검증 (KRW 위변조 차단)
        if (!isAmountValid(pg.amountTotal, pg.currency, Math.round(Number(order.total_amount) || 0))) {
          console.error('[reconcile-payments] ⛔ 금액 불일치 — 완료 보류:', {
            orderId: order.id,
            paymentId,
            pgAmount: pg.amountTotal,
            orderTotalKRW: order.total_amount,
          });
          result.skipped++;
          result.details.push({ orderId: order.id, action: 'amount_mismatch' });
          continue;
        }

        const resolvedMethod = inferPaymentMethod(pg, order.payment_method);
        await completeOrderAfterPayment(
          order.id,
          resolvedMethod,
          {
            transactionId: paymentId,
            paymentConfirmedAt: new Date().toISOString(),
            paymentProvider: 'portone-reconcile',
          },
          supabase,
        );

        result.completed++;
        result.details.push({
          orderId: order.id,
          orderNumber: order.order_number,
          action: 'completed',
          method: resolvedMethod,
        });
        console.log('[reconcile-payments] ✅ 멈춘 결제 자동 완료:', {
          orderId: order.id,
          orderNumber: order.order_number,
          paymentId,
          method: resolvedMethod,
        });
      } else if (FAILED_STATUSES.includes(pg.status)) {
        await supabase
          .from('orders')
          .update({
            status: 'failed',
            payment_status: 'failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', order.id);
        result.failed++;
        result.details.push({ orderId: order.id, action: 'failed', pgStatus: pg.status });
      } else if (PENDING_STATUSES.includes(pg.status)) {
        result.stillPending++;
      } else {
        result.skipped++;
        result.details.push({ orderId: order.id, action: 'unknown_status', pgStatus: pg.status });
      }
    } catch (e) {
      result.errors++;
      console.error('[reconcile-payments] 주문 처리 중 오류:', {
        orderId: order.id,
        paymentId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  console.log('[reconcile-payments] 완료:', {
    scanned: result.scanned,
    completed: result.completed,
    failed: result.failed,
    stillPending: result.stillPending,
    skipped: result.skipped,
    errors: result.errors,
  });

  return NextResponse.json({ success: true, ...result });
}

// Vercel Cron은 GET으로 호출. 수동 트리거(관리자)도 GET/POST 모두 허용.
export async function GET(request: NextRequest) {
  return handleReconcile(request);
}

export async function POST(request: NextRequest) {
  return handleReconcile(request);
}
