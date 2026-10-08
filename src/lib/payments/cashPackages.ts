/**
 * 캐쉬 충전 패키지 (KRW 기준).
 * 충전 보너스는 결제 완료 시 서버가 이 표로 다시 계산한다. 주문 metadata 의 bonusAmount 는 신뢰하지 않는다.
 * supabase/functions/payments-payaction-webhook 에도 같은 표가 있으니 함께 수정한다.
 */
export const CASH_CHARGE_PACKAGES_KRW = [
  { amount: 3000, bonus: 0 },
  { amount: 5000, bonus: 500 },
  { amount: 10000, bonus: 1500 },
  { amount: 30000, bonus: 6000 },
  { amount: 50000, bonus: 11000 },
  { amount: 100000, bonus: 25000 },
] as const;

export type CashChargePackage = (typeof CASH_CHARGE_PACKAGES_KRW)[number];

export const findCashChargePackage = (amountKrw: number): CashChargePackage | null =>
  CASH_CHARGE_PACKAGES_KRW.find((pkg) => pkg.amount === Math.round(amountKrw)) ?? null;

export const getCashChargeBonus = (amountKrw: number): number =>
  findCashChargePackage(amountKrw)?.bonus ?? 0;
