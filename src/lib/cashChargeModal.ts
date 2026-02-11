export const CASH_CHARGE_MODAL_EVENT = 'copydrum:cash-charge-open';

export const openCashChargeModal = () => {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(CASH_CHARGE_MODAL_EVENT));
};

export const subscribeCashChargeModal = (handler: () => void) => {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  window.addEventListener(CASH_CHARGE_MODAL_EVENT, handler);
  return () => {
    window.removeEventListener(CASH_CHARGE_MODAL_EVENT, handler);
  };
};

































