// 지원하는 통화 타입
export type Currency = 'KRW' | 'USD' | 'EUR';

// USD 할인 적용 언어 (Discount 그룹: 1500원 = $1)
const USD_DISCOUNT_LOCALES = ['vi', 'th', 'id', 'hi', 'pt', 'tr', 'ru', 'uk'];

// Locale → Currency 매핑
const LOCALE_TO_CURRENCY: Record<string, Currency> = {
    // Korean Won
    'ko': 'KRW',

    // Euro (유럽: 1000원 = €1)
    'de': 'EUR',
    'fr': 'EUR',
    'it': 'EUR',
    'es': 'EUR',

    // USD Standard (1000원 = $1)
    'en': 'USD',
    'ja': 'USD',
    'zh-CN': 'USD',
    'zh-TW': 'USD',
    'ar': 'USD',
    'nl': 'USD',
    'pl': 'USD',

    // USD Discount (1500원 = $1)
    'vi': 'USD',
    'th': 'USD',
    'id': 'USD',
    'hi': 'USD',
    'pt': 'USD',
    'tr': 'USD',
    'ru': 'USD',
    'uk': 'USD',
};

/**
 * Locale 기반으로 사이트 통화 결정
 * @param hostname 호스트네임 (사용하지 않음, 호환성 유지)
 * @param locale i18n locale (예: 'ko', 'en', 'ja', 'zh-CN' 등)
 * @returns Currency 타입
 */
export function getSiteCurrency(hostname?: string, locale?: string): Currency {
    console.log('[Currency Debug] getSiteCurrency 호출:', { hostname, locale });

    if (locale) {
        // locale이 'ko-KR' 형태일 수도 있으므로 첫 부분만 추출
        const localeCode = locale.split('-')[0];
        console.log('[Currency Debug] localeCode 추출:', localeCode);

        if (LOCALE_TO_CURRENCY[localeCode]) {
            const currency = LOCALE_TO_CURRENCY[localeCode];
            console.log('[Currency Debug] 결정된 통화:', currency);
            return currency;
        }
        // 전체 locale도 체크
        if (LOCALE_TO_CURRENCY[locale]) {
            const currency = LOCALE_TO_CURRENCY[locale];
            console.log('[Currency Debug] 결정된 통화 (전체 locale):', currency);
            return currency;
        }
    }

    // 기본값: KRW
    console.log('[Currency Debug] 기본값 반환: KRW');
    return 'KRW';
}

/**
 * KRW(원) 기준 금액을 사이트 통화로 변환
 *
 * 변환 규칙:
 * - KRW: 그대로 반환 (3000원 → 3000원)
 * - EUR (de, fr, it, es): 비율 1/1000, 3000원 → €3.00
 * - USD Standard (en, ja, zh-CN, zh-TW, ar, nl, pl):
 *   비율 1/1000, 3000원 → $3.00
 * - USD Discount (vi, th, id, hi, pt, tr, ru, uk):
 *   비율 1/1500, 3000원 → $2.00
 *
 * @param krw - KRW 금액
 * @param currency - 변환할 통화
 * @param locale - 현재 locale (USD 할인 판단용)
 * @returns 변환된 금액 (소수점 포함)
 */
export function convertFromKrw(krw: number, currency: Currency, locale?: string): number {
    console.log('[Currency Debug] convertFromKrw 호출:', { krw, currency, locale });

    // KRW는 그대로 반환
    if (currency === 'KRW') {
        console.log('[Currency Debug] KRW 반환:', krw);
        return krw;
    }

    // EUR: 1000원 = €1 (비율 1/1000)
    if (currency === 'EUR') {
        const result = krw / 1000;
        console.log('[Currency Debug] ✅ EUR 적용!', {
            krw,
            result
        });
        return result;
    }

    // USD: locale에 따라 할인율 적용
    if (currency === 'USD') {
        const localeCode = locale?.split('-')[0];
        console.log('[Currency Debug] localeCode 추출:', localeCode);

        // USD Discount 언어: 1500원 = $1 (비율 1/1500)
        if (localeCode && USD_DISCOUNT_LOCALES.includes(localeCode)) {
            const result = krw / 1500;
            console.log('[Currency Debug] ✅ USD Discount 적용!', {
                localeCode,
                krw,
                result,
                discountLocales: USD_DISCOUNT_LOCALES
            });
            return result;
        }

        // USD Standard: 1000원 = $1 (비율 1/1000)
        const result = krw / 1000;
        console.log('[Currency Debug] USD Standard 적용:', {
            localeCode,
            krw,
            result
        });
        return result;
    }

    console.log('[Currency Debug] 기본값 반환:', krw);
    return krw;
}

/**
 * 통화별 표시용 문자열 생성
 * - USD: 소수점 2자리 강제 표시 (예: $2.00)
 * - EUR: 소수점 2자리 강제 표시 (예: €3.00)
 * - KRW: 정수로 표시 (예: 3,000원)
 *
 * @param amount - 금액 (이미 변환된 금액)
 * @param currency - 통화 타입
 * @returns 포맷팅된 문자열 (예: "$2.00", "€3.00", "3,000원")
 */
export function formatCurrency(amount: number, currency: Currency): string {
    console.log('[Currency Debug] formatCurrency 호출:', { amount, currency });

    switch (currency) {
        case 'USD':
            // USD: 소수점 2자리 강제 표시 (예: $2.00)
            const formattedUSD = `$${amount.toFixed(2)}`;
            console.log('[Currency Debug] formatCurrency 결과:', formattedUSD);
            return formattedUSD;

        case 'EUR':
            // EUR: 소수점 2자리 강제 표시 (예: €3.00)
            const formattedEUR = `€${amount.toFixed(2)}`;
            console.log('[Currency Debug] formatCurrency 결과:', formattedEUR);
            return formattedEUR;

        case 'KRW':
        default:
            // KRW: 정수로 표시 (예: 3,000원)
            const intAmount = Math.round(amount);
            const formattedKRW = `${intAmount.toLocaleString('ko-KR')}원`;
            console.log('[Currency Debug] formatCurrency 결과:', formattedKRW);
            return formattedKRW;
    }
}
