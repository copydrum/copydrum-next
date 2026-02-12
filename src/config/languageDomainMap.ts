export const languageDomainMap = {
    // ✅ 서브디렉토리 방식 (https://copydrum.com/{lang})
    en: "https://copydrum.com/en",
    ko: "https://copydrum.com/ko",
    ja: "https://copydrum.com/ja",
    de: "https://copydrum.com/de",
    es: "https://copydrum.com/es",
    fr: "https://copydrum.com/fr",
    hi: "https://copydrum.com/hi",
    id: "https://copydrum.com/id",
    it: "https://copydrum.com/it",
    pt: "https://copydrum.com/pt",
    ru: "https://copydrum.com/ru",
    th: "https://copydrum.com/th",
    tr: "https://copydrum.com/tr",
    uk: "https://copydrum.com/uk",
    vi: "https://copydrum.com/vi",
    "zh-CN": "https://copydrum.com/zh-cn",
    "zh-TW": "https://copydrum.com/zh-tw",
} as const;

export type SupportedLanguage = keyof typeof languageDomainMap;
