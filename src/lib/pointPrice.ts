import { convertUSDToKRW } from './priceFormatter';

/**
 * 포인트 가격 계산 유틸리티
 * 
 * 정책:
 * - point_price_raw = price_krw * 0.85
 * - point_price = Math.floor(point_price_raw / 100) * 100 (100P 단위 내림 처리)
 * 
 * @param priceKRW KRW 가격
 * @returns 포인트 가격 (100P 단위로 내림 처리된 값)
 */
export function calculatePointPrice(priceKRW: number): number {
  if (!priceKRW || priceKRW <= 0) return 0;
  const pointPriceRaw = priceKRW * 0.85;
  return Math.floor(pointPriceRaw / 100) * 100;
}

/**
 * USD 가격을 포인트로 변환하는 함수
 * 영문 사이트에서 사용
 * 
 * @param priceUSD USD 가격
 * @param usdRate USD 환율 (선택사항, 기본값 사용)
 * @returns 포인트 가격 (100P 단위로 내림 처리된 값)
 */
export function calculatePointPriceFromUsd(priceUSD: number, usdRate?: number): number {
  if (!priceUSD || priceUSD <= 0) return 0;
  const priceKRW = convertUSDToKRW(priceUSD, usdRate);
  return calculatePointPrice(priceKRW);
}

