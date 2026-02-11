import type { SupportedLanguage } from "../../config/languageDomainMap";

export function getLocaleFromHost(host: string): SupportedLanguage {
    if (!host) return "ko"; // Default fallback

    const normalizedHost = host.toLowerCase();

    // www 제거 (www.copydrum.com → copydrum.com)
    const hostWithoutWww = normalizedHost.replace(/^www\./, '');

    // ✅ 이미 설정된 언어들 (변경 금지)
    if (hostWithoutWww === "copydrum.com") return "ko";
    if (hostWithoutWww.startsWith("en.")) return "en";
    if (hostWithoutWww.startsWith("jp.") || hostWithoutWww.startsWith("ja.")) return "ja";

    // ✅ 나머지 언어 도메인 매핑
    if (hostWithoutWww.startsWith("de.")) return "de";
    if (hostWithoutWww.startsWith("es.")) return "es";
    if (hostWithoutWww.startsWith("fr.")) return "fr";
    if (hostWithoutWww.startsWith("hi.")) return "hi";
    if (hostWithoutWww.startsWith("id.")) return "id";
    if (hostWithoutWww.startsWith("it.")) return "it";
    if (hostWithoutWww.startsWith("pt.")) return "pt";
    if (hostWithoutWww.startsWith("ru.")) return "ru";
    if (hostWithoutWww.startsWith("th.")) return "th";
    if (hostWithoutWww.startsWith("tr.")) return "tr";
    if (hostWithoutWww.startsWith("uk.")) return "uk";
    if (hostWithoutWww.startsWith("vi.")) return "vi";
    // zh-CN과 zh-TW는 도메인에서 하이픈을 사용할 수 없으므로 zh-cn, zh-tw로 매핑
    if (hostWithoutWww.startsWith("zh-cn.") || hostWithoutWww.startsWith("zhcn.")) return "zh-CN";
    if (hostWithoutWww.startsWith("zh-tw.") || hostWithoutWww.startsWith("zhtw.")) return "zh-TW";

    // 기본값: 한국어 (copydrum.com은 한국어 사이트)
    return "ko";
}
