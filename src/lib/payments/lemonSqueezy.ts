/**
 * Lemon Squeezy 해외 결제 공통 헬퍼 (서버 전용)
 *
 * ⚠️ 저작권 노출 최소화 정책
 *   - 앨범 자켓/썸네일 이미지는 LS에 절대 전달하지 않는다. (media: [], checkout_options.media: false)
 *   - LS로 넘기는 것은 "텍스트 제목"과 "금액"뿐이다.
 *   - 실제 악보 PDF는 LS에 올리지 않는다. (LS 상품은 더미 1개)
 *
 * 전략: LS 대시보드에 대표 상품(variant) 1개만 두고, 매 결제마다 Checkout API로
 *       custom_price / product_options.name / checkout_data.custom 을 덮어써서 결제한다.
 */

import { convertFromKrw, type Currency } from '../currency';

export const LEMON_SQUEEZY_API_BASE = 'https://api.lemonsqueezy.com/v1';

/** LS 결제수단 식별 문자열 (orders.payment_method / URL method 파라미터에 사용) */
export const LEMON_SQUEEZY_METHOD = 'lemonsqueezy';

export interface LemonSqueezyConfig {
  apiKey: string;
  storeId: string;
  variantId: string;
  storeCurrency: Currency;
  testMode: boolean;
}

/**
 * 환경변수에서 LS 설정을 읽어온다. 누락 시 null 반환.
 */
export function getLemonSqueezyConfig(): LemonSqueezyConfig | null {
  const apiKey = process.env.LEMON_SQUEEZY_API_KEY?.trim();
  const storeId = process.env.LEMON_SQUEEZY_STORE_ID?.trim();
  const variantId = process.env.LEMON_SQUEEZY_VARIANT_ID?.trim();

  if (!apiKey || !storeId || !variantId) {
    return null;
  }

  const rawCurrency = (process.env.LEMON_SQUEEZY_STORE_CURRENCY || 'USD').trim().toUpperCase();
  const storeCurrency: Currency =
    rawCurrency === 'EUR' ? 'EUR' : rawCurrency === 'KRW' ? 'KRW' : 'USD';

  // 명시적으로 'false'가 아니면 테스트 모드로 간주 (안전: 실수로 라이브 결제 방지)
  const testMode = (process.env.LEMON_SQUEEZY_TEST_MODE || 'true').trim().toLowerCase() !== 'false';

  return { apiKey, storeId, variantId, storeCurrency, testMode };
}

/**
 * 곡 제목을 LS 체크아웃용으로 sanitize 한다.
 * (저작권 민감 정보 최소화: 자켓·원문 그대로가 아니라 정형화된 텍스트 템플릿)
 *
 * 원곡 있음: [Drum Sheet Music] {title} (Originally by {artist}) — Transcribed by CopyDrum
 * 원곡 없음: [Drum Sheet Music] {title} — Transcribed by CopyDrum (Original composition)
 */
export function buildSanitizedItemName(title: string, artist?: string | null): string {
  const safeTitle = (title || 'Drum Sheet').trim();
  const safeArtist = (artist || '').trim();

  const isUnknownArtist =
    !safeArtist ||
    safeArtist.toLowerCase() === 'unknown' ||
    safeArtist === '알 수 없음' ||
    safeArtist === '미상';

  if (isUnknownArtist) {
    return `[Drum Sheet Music] ${safeTitle} — Transcribed by CopyDrum (Original composition)`;
  }
  return `[Drum Sheet Music] ${safeTitle} (Originally by ${safeArtist}) — Transcribed by CopyDrum`;
}

export interface SanitizedOrderItem {
  title: string;
  artist?: string | null;
}

/**
 * LS 체크아웃 표시용 제목.
 * 해외 결제(locale !== 'ko')에서는 title_translations.en 을 우선한다.
 * (악보집·드럼레슨북 등 한/영 이중 등록 상품 대응)
 */
export function resolveCheckoutItemTitle(
  koreanTitle: string,
  titleTranslations?: Record<string, string> | null,
  locale?: string,
): string {
  if (locale && locale !== 'ko') {
    const en = titleTranslations?.en?.trim();
    if (en) return en;
  }
  return (koreanTitle || 'Drum Sheet').trim();
}

/**
 * 체크아웃에 표시할 product_options.name 을 만든다.
 * - 단건: sanitize 된 곡 제목
 * - 장바구니(여러 곡): "CopyDrum Drum Sheets (N items)"
 */
export function buildCheckoutName(items: SanitizedOrderItem[]): string {
  if (items.length === 1) {
    return buildSanitizedItemName(items[0].title, items[0].artist);
  }
  return `CopyDrum Drum Sheets (${items.length} items)`;
}

/**
 * 장바구니 결제 시 체크아웃 설명(description) 텍스트.
 * 곡 목록을 sanitize 된 텍스트로만 나열한다. (이미지/자켓 없음)
 * 단건이면 빈 문자열을 반환(설명 불필요).
 */
export function buildCheckoutDescription(items: SanitizedOrderItem[]): string {
  if (items.length <= 1) return '';
  return items.map((it) => `• ${buildSanitizedItemName(it.title, it.artist)}`).join('\n');
}

/**
 * KRW 주문 총액을 LS 스토어 통화의 "센트(최소 단위)" 정수로 변환한다.
 * LS custom_price 는 스토어 통화의 최소 단위 정수를 요구한다. (예: $3.00 → 300)
 *
 * @param krwAmount 서버가 신뢰하는 주문 총액(원)
 * @param storeCurrency LS 스토어 통화
 * @param locale 표시 통화 환산용 locale (체크아웃 화면 표기와 일치시키기 위함)
 */
export function krwToStoreUnitAmount(
  krwAmount: number,
  storeCurrency: Currency,
  locale?: string,
): number {
  const converted = convertFromKrw(krwAmount, storeCurrency, locale);

  if (storeCurrency === 'KRW') {
    // KRW 스토어는 최소 단위가 1원 (LS는 KRW도 0 소수 통화로 취급)
    return Math.max(0, Math.round(converted));
  }

  // USD/EUR 등 2자리 소수 통화: 센트로 변환
  return Math.max(0, Math.round(Number(converted.toFixed(2)) * 100));
}
