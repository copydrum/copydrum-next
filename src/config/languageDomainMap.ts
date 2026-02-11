export const languageDomainMap = {
    // ✅ 이미 설정된 언어들 (변경 금지)
    ko: "https://copydrum.com",
    en: "https://en.copydrum.com",
    ja: "https://jp.copydrum.com", // jp. 또는 ja. 모두 지원

    // ✅ 나머지 언어 도메인
    de: "https://de.copydrum.com",
    es: "https://es.copydrum.com",
    fr: "https://fr.copydrum.com",
    hi: "https://hi.copydrum.com",
    id: "https://id.copydrum.com",
    it: "https://it.copydrum.com",
    pt: "https://pt.copydrum.com",
    ru: "https://ru.copydrum.com",
    th: "https://th.copydrum.com",
    tr: "https://tr.copydrum.com",
    uk: "https://uk.copydrum.com",
    vi: "https://vi.copydrum.com",
    // zh-CN과 zh-TW는 도메인에서 하이픈을 사용할 수 없으므로 zh-cn, zh-tw로 매핑
    "zh-CN": "https://zh-cn.copydrum.com",
    "zh-TW": "https://zh-tw.copydrum.com",
} as const;

export type SupportedLanguage = keyof typeof languageDomainMap;
