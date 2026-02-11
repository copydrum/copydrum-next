export const currencyByLocale = {
    ko: "KRW", // 한국어 사이트: 원화
    en: "USD", // 영어 사이트: 달러
    ja: "JPY", // 일본어 사이트: 엔화 (향후 사용)
    vi: "VND",
    fr: "EUR",
    de: "EUR",
    es: "EUR",
    pt: "EUR",
    // TODO: 추후 나머지 언어와 통화 매핑 추가
} as const;

export type SupportedCurrency = (typeof currencyByLocale)[keyof typeof currencyByLocale];

export function getCurrencyFromLocale(locale: keyof typeof currencyByLocale): SupportedCurrency {
    return currencyByLocale[locale] ?? "USD";
}
