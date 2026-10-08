export const CASH_CHARGE_MODAL_EVENT = 'copydrum:cash-charge-open';

export interface CashChargeModalOptions {
  /** 부족한 금액 (KRW). 있으면 이 금액을 채우는 가장 작은 충전팩을 미리 고른다 */
  shortfall?: number;
  /** 결제창이 페이지를 떠났다가 돌아온 뒤(모바일 리디렉션 등) 이동할 경로 */
  returnTo?: string;
  /** 페이지를 떠나지 않고 충전이 끝났을 때 호출 (새 캐쉬 잔액) */
  onCharged?: (balance: number) => void;
  /** 충전이 끝나면 완료 화면 없이 바로 닫는다 (결제 화면에서 이어서 결제할 때) */
  closeOnCharged?: boolean;
}

export const openCashChargeModal = (options: CashChargeModalOptions = {}) => {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent<CashChargeModalOptions>(CASH_CHARGE_MODAL_EVENT, { detail: options }));
};

const CASH_BALANCE_EVENT = 'copydrum:cash-balance-changed';

export const notifyCashBalanceChanged = (balance: number) => {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent<number>(CASH_BALANCE_EVENT, { detail: balance }));
};

export const subscribeCashBalanceChanged = (handler: (balance: number) => void) => {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const listener = (event: Event) => handler((event as CustomEvent<number>).detail);
  window.addEventListener(CASH_BALANCE_EVENT, listener);
  return () => {
    window.removeEventListener(CASH_BALANCE_EVENT, listener);
  };
};

/** 로그인하지 않은 사용자가 충전을 누르면 표시해 두고, 로그인 후 충전 창을 연다 (소셜 로그인 리디렉션 포함) */
const CHARGE_AFTER_LOGIN_KEY = 'copydrum:cash-charge-after-login';
const CHARGE_AFTER_LOGIN_TTL_MS = 30 * 60 * 1000;

export const markCashChargeAfterLogin = () => {
  try {
    sessionStorage.setItem(CHARGE_AFTER_LOGIN_KEY, String(Date.now()));
  } catch {
    // sessionStorage 를 쓸 수 없으면 로그인 후 자동으로 열지 않는다
  }
};

export const consumeCashChargeAfterLogin = (): boolean => {
  try {
    const markedAt = Number(sessionStorage.getItem(CHARGE_AFTER_LOGIN_KEY));
    if (!markedAt) return false;
    sessionStorage.removeItem(CHARGE_AFTER_LOGIN_KEY);
    return Date.now() - markedAt < CHARGE_AFTER_LOGIN_TTL_MS;
  } catch {
    return false;
  }
};

export const subscribeCashChargeModal = (handler: (options: CashChargeModalOptions) => void) => {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const listener = (event: Event) => handler((event as CustomEvent<CashChargeModalOptions>).detail ?? {});
  window.addEventListener(CASH_CHARGE_MODAL_EVENT, listener);
  return () => {
    window.removeEventListener(CASH_CHARGE_MODAL_EVENT, listener);
  };
};
