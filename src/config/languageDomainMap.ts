export const languageDomainMap = {
    // ✅ 서브디렉토리 방식 (https://www.copydrum.com/{lang})
    en: "https://www.copydrum.com/en",
    ko: "https://www.copydrum.com/ko",
    ja: "https://www.copydrum.com/ja",
    de: "https://www.copydrum.com/de",
    es: "https://www.copydrum.com/es",
    fr: "https://www.copydrum.com/fr",
    hi: "https://www.copydrum.com/hi",
    id: "https://www.copydrum.com/id",
    it: "https://www.copydrum.com/it",
    pt: "https://www.copydrum.com/pt",
    ru: "https://www.copydrum.com/ru",
    th: "https://www.copydrum.com/th",
    tr: "https://www.copydrum.com/tr",
    uk: "https://www.copydrum.com/uk",
    vi: "https://www.copydrum.com/vi",
    "zh-CN": "https://www.copydrum.com/zh-cn",
    "zh-TW": "https://www.copydrum.com/zh-tw",
} as const;

export type SupportedLanguage = keyof typeof languageDomainMap;
