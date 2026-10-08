import { convertFromKrw, formatCurrency, getSiteCurrency } from '@/lib/currency';

/** 캐쉬·포인트는 원 단위로 저장된다. 한국어는 원/P, 그 외 언어는 사이트 환율로 달러 표시 */
export const isKrwLocale = (locale?: string | null): boolean => getSiteCurrency(undefined, locale || 'ko') === 'KRW';

export function formatWalletAmount(krw: number, locale?: string | null): string {
  const currency = getSiteCurrency(undefined, locale || 'ko');
  return formatCurrency(convertFromKrw(krw, currency, locale || undefined), currency);
}

/** 적립 포인트 표시: 한국어 "1,500P", 그 외 "$1.50" */
export function formatRewardPoints(points: number, locale?: string | null): string {
  return isKrwLocale(locale) ? `${Math.round(points).toLocaleString('ko-KR')}P` : formatWalletAmount(points, locale);
}
