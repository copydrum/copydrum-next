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
