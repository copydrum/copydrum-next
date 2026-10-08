/**
 * PG 가 실제로 받은 금액이 주문 금액(원)을 덮는지 확인한다.
 * - 원화: ±2% (최소 10원) 이내
 * - 달러: 가장 싼 환율(1,500원 = $1) 기준 하한 이상. PortOne 은 센트 단위로 돌려준다.
 * - 엔화: 1엔 ≈ 9원 기준 하한(여유 포함) 이상
 * 그 밖의 통화는 확인할 수 없으므로 거부한다.
 * supabase/functions/portone-payment-confirm 에도 같은 규칙이 있으니 함께 수정한다.
 */
export function isPgAmountAcceptable(pgAmount: number, pgCurrency: string, orderKrw: number): boolean {
  if (!orderKrw || orderKrw <= 0) return true;
  const amount = Math.round(Number(pgAmount) || 0);
  const currency = String(pgCurrency || 'KRW').toUpperCase().replace(/^CURRENCY_/, '');

  if (currency === 'KRW') {
    const tolerance = Math.max(10, Math.round(orderKrw * 0.02));
    return Math.abs(amount - orderKrw) <= tolerance;
  }
  if (currency === 'USD') {
    return amount >= Math.floor(orderKrw / 15) - 1;
  }
  if (currency === 'JPY') {
    return amount >= Math.floor(orderKrw * 0.08);
  }
  return false;
}
