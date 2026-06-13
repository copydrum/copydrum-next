// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 서버 측 PortOne 결제 상태 조회 헬퍼
//
// verify / reconcile 라우트가 각자 PortOne 토큰 발급 + 단건 조회를 중복 구현하고 있어,
// 결제 진행 중(in-flight) 주문의 실제 PG 상태를 확인해야 하는 곳에서 재사용할 수 있도록
// 공통 함수로 분리한다. (주문 생성 시 중복결제 가드 등)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PortOnePaymentSnapshot {
  status: string; // 대문자 정규화된 상태 (PAID, PAY_PENDING, READY, FAILED, CANCELLED 등)
  amountTotal: number;
  currency: string;
}

async function getAccessToken(apiSecret: string, signal?: AbortSignal): Promise<string> {
  const cleanSecret = apiSecret.replace(/[\s"']/g, '').trim();
  const res = await fetch('https://api.portone.io/login/api-secret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiSecret: cleanSecret }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`PortOne 토큰 발급 실패: ${res.status}`);
  }
  const json = await res.json();
  return json.accessToken as string;
}

/**
 * paymentId(transaction_id)로 PortOne V2 결제 단건을 조회한다.
 * - 결제가 존재하지 않으면(404) null 반환.
 * - 네트워크/인증 오류는 throw (호출 측에서 best-effort로 처리할 것).
 *
 * @param timeoutMs 전체 작업 타임아웃 (기본 6초) — 결제/주문 생성 같은 핵심 경로에서
 *                  PortOne 지연이 사용자 흐름을 막지 않도록 보수적으로 설정.
 */
export async function getPortOnePaymentSnapshot(
  paymentId: string,
  apiSecret: string,
  timeoutMs = 6000,
): Promise<PortOnePaymentSnapshot | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const accessToken = await getAccessToken(apiSecret, controller.signal);

    const res = await fetch(
      `https://api.portone.io/v2/payments/${encodeURIComponent(paymentId)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
      },
    );

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`PortOne 조회 실패: ${res.status}`);
    }

    const raw = await res.json();
    const payment = raw.payment || raw;
    const txs = payment.transactions;
    const tx =
      Array.isArray(txs) && txs.length > 0
        ? txs.find((t: any) => t.is_primary === true || t.isPrimary === true) ?? txs[0]
        : {};

    const status = String(payment.status || tx.status || '').toUpperCase();
    const amount = tx.amount || payment.amount || {};

    return {
      status,
      amountTotal: Number(amount.total ?? amount ?? 0),
      currency: String(amount.currency ?? 'CURRENCY_KRW'),
    };
  } finally {
    clearTimeout(timer);
  }
}
