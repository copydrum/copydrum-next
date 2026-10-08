import { USD_DISCOUNT_LOCALES } from '@/lib/currency';

/**
 * 캐쉬 충전 상품 (금액·보너스는 원 기준).
 * 결제 완료 시 지급하는 보너스는 DB 의 cash_charge_packages 표가 기준이다(cash_complete_charge_order).
 * 이 표는 화면 표시와 주문 생성 검증용이므로 DB 표와 같은 값을 유지한다.
 *   kr: 한국 사이트, intl: 해외 1,000원 = $1, intl_discount: 해외 1,500원 = $1
 */
export type CashChargeRegion = 'kr' | 'intl' | 'intl_discount';

export interface CashChargePackage {
  amount: number;
  bonus: number;
  badge?: 'popular' | 'best';
}

export const CASH_CHARGE_PACKAGES: Record<CashChargeRegion, readonly CashChargePackage[]> = {
  kr: [
    { amount: 5000, bonus: 500 },
    { amount: 10000, bonus: 1500 },
    { amount: 30000, bonus: 6000, badge: 'popular' },
    { amount: 50000, bonus: 11000 },
    { amount: 100000, bonus: 25000, badge: 'best' },
  ],
  intl: [
    { amount: 10000, bonus: 1500 },
    { amount: 30000, bonus: 6000, badge: 'popular' },
    { amount: 50000, bonus: 11000 },
    { amount: 100000, bonus: 25000, badge: 'best' },
  ],
  intl_discount: [
    { amount: 15000, bonus: 2250 },
    { amount: 45000, bonus: 9000, badge: 'popular' },
    { amount: 75000, bonus: 16500 },
    { amount: 150000, bonus: 37500, badge: 'best' },
  ],
};

export const KR_CHARGE_METHODS = ['card', 'kakaopay', 'virtual_account'] as const;
export const INTL_CHARGE_METHODS = ['lemonsqueezy', 'paypal'] as const;
export type CashChargeMethod = (typeof KR_CHARGE_METHODS)[number] | (typeof INTL_CHARGE_METHODS)[number];

export const getCashChargeRegion = (locale?: string | null): CashChargeRegion => {
  const code = (locale || 'ko').split('-')[0];
  if (code === 'ko') return 'kr';
  return USD_DISCOUNT_LOCALES.includes(code) ? 'intl_discount' : 'intl';
};

export const getCashChargeMethods = (region: CashChargeRegion): readonly CashChargeMethod[] =>
  region === 'kr' ? KR_CHARGE_METHODS : INTL_CHARGE_METHODS;

export const findCashChargePackage = (region: CashChargeRegion, amountKrw: number): CashChargePackage | null =>
  CASH_CHARGE_PACKAGES[region].find((pkg) => pkg.amount === Math.round(amountKrw)) ?? null;

/** 부족한 금액을 덮는 가장 작은 상품. 모두 부족하면 가장 큰 상품. */
export const pickPackageForShortfall = (region: CashChargeRegion, shortfallKrw: number): CashChargePackage => {
  const packages = CASH_CHARGE_PACKAGES[region];
  return packages.find((pkg) => pkg.amount + pkg.bonus >= shortfallKrw) ?? packages[packages.length - 1];
};

export const isCashChargeOrder = (order: {
  order_type?: string | null;
  metadata?: unknown;
}): boolean => {
  const metadata = (order.metadata ?? null) as Record<string, unknown> | null;
  return (
    order.order_type === 'cash' ||
    metadata?.type === 'cash_charge' ||
    metadata?.purpose === 'cash_charge'
  );
};
