import { supabase } from '@/lib/supabase';
import type { CashChargeMethod } from './cashPackages';

const CONTEXT_KEY = 'copydrum_cash_charge';

/** 결제창이 페이지를 떠났다 돌아올 때(모바일 리디렉션) 결과 화면이 이어서 쓸 정보 */
export interface CashChargeContext {
  orderId: string;
  method: CashChargeMethod;
  amount: number;
  bonus: number;
  returnTo?: string;
}

export function saveCashChargeContext(context: CashChargeContext) {
  try {
    sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(context));
  } catch {
    /* 저장소를 못 쓰면 결과 화면이 주문 ID 만으로 처리한다 */
  }
}

export function readCashChargeContext(orderId?: string | null): CashChargeContext | null {
  try {
    const raw = sessionStorage.getItem(CONTEXT_KEY);
    if (!raw) return null;
    const context = JSON.parse(raw) as CashChargeContext;
    if (orderId && context.orderId !== orderId) return null;
    return context;
  } catch {
    return null;
  }
}

export function clearCashChargeContext() {
  try {
    sessionStorage.removeItem(CONTEXT_KEY);
  } catch {
    /* noop */
  }
}

export class CashChargeError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export async function createCashChargeOrder(params: {
  amount: number;
  method: CashChargeMethod;
  locale: string;
}): Promise<{ orderId: string; orderNumber: string; amount: number; bonus: number }> {
  const response = await fetch('/api/cash/charge-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: params.amount, paymentMethod: params.method, locale: params.locale }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success || !result.orderId) {
    throw new CashChargeError(result?.error || 'CREATE_FAILED');
  }
  return result;
}

export async function fetchCashBalance(userId: string): Promise<number> {
  const { data } = await supabase.from('profiles').select('credits').eq('id', userId).maybeSingle();
  return Number(data?.credits) || 0;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 웹훅 등으로 충전 주문이 완료될 때까지 기다린다 */
export async function waitForChargeCompletion(orderId: string, timeoutMs = 60000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await supabase.from('orders').select('status').eq('id', orderId).maybeSingle();
    if (data?.status === 'completed') return true;
    await sleep(3000);
  }
  return false;
}

export type ChargeConfirmResult = 'done' | 'delayed' | 'failed';

/** PortOne 결제(카드·카카오페이·PayPal) 후 서버 검증으로 캐쉬를 지급받는다 */
export async function confirmPortOneCharge(
  orderId: string,
  paymentId: string,
  method: CashChargeMethod,
): Promise<ChargeConfirmResult> {
  const retryDelays = [0, 2000, 3000, 5000, 5000, 10000];
  for (const delay of retryDelays) {
    if (delay) await sleep(delay);
    try {
      const response = await fetch('/api/payments/portone/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId, orderId, paymentMethod: method }),
      });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.success) return 'done';
      if (result?.pending) continue;
      if (response.status >= 500) break;
      return 'failed';
    } catch {
      break;
    }
  }
  return (await waitForChargeCompletion(orderId, 30000)) ? 'done' : 'delayed';
}
