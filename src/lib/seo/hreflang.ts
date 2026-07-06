/**
 * 서버 사이드 SEO 공통 유틸 — canonical / hreflang alternates 생성.
 * generateMetadata(서버)에서 일관된 다국어 URL 신호를 만들기 위해 사용한다.
 */
import { headers } from 'next/headers';
import { languages } from '@/i18n/languages';

export const BASE_URL = 'https://www.copydrum.com';

// locale 코드 → URL path 매핑 (middleware 와 동일)
export const localeToPath: Record<string, string> = {
  en: 'en',
  ko: 'ko',
  ja: 'ja',
  'zh-CN': 'zh-cn',
  'zh-TW': 'zh-tw',
  de: 'de',
  fr: 'fr',
  es: 'es',
  vi: 'vi',
  th: 'th',
  hi: 'hi',
  id: 'id',
  pt: 'pt',
  ru: 'ru',
  it: 'it',
  tr: 'tr',
  uk: 'uk',
};

/** URL path segment (e.g. zh-cn) → i18n locale code (e.g. zh-CN). Matches middleware. */
export const pathToLocale: Record<string, string> = {
  en: 'en',
  ko: 'ko',
  ja: 'ja',
  de: 'de',
  es: 'es',
  fr: 'fr',
  hi: 'hi',
  id: 'id',
  it: 'it',
  pt: 'pt',
  ru: 'ru',
  th: 'th',
  tr: 'tr',
  uk: 'uk',
  vi: 'vi',
  'zh-cn': 'zh-CN',
  'zh-tw': 'zh-TW',
};

export function localeFromPathSegment(pathSegment: string): string {
  return pathToLocale[pathSegment.toLowerCase()] || 'en';
}

/** 미들웨어가 설정한 x-locale 헤더에서 현재 locale 을 읽는다. */
export async function getLocaleFromHeaders(): Promise<string> {
  const headersList = await headers();
  return headersList.get('x-locale') || 'en';
}

/** 현재 locale 기준 canonical URL. relativePath 는 '/' 로 시작해야 한다. */
export function canonicalFor(locale: string, relativePath: string): string {
  const path = localeToPath[locale] || 'en';
  return `${BASE_URL}/${path}${relativePath}`;
}

/**
 * Next Metadata.alternates.languages 용 객체 생성.
 * 키는 BCP-47 hreflang(zh-Hans/zh-Hant 등), 값은 절대 URL.
 * x-default 는 영어(/en)로 통일.
 */
export function buildLanguageAlternates(relativePath: string): Record<string, string> {
  const langs: Record<string, string> = {};
  languages.forEach((lang) => {
    const path = localeToPath[lang.code] || lang.code.toLowerCase();
    langs[lang.hreflang] = `${BASE_URL}/${path}${relativePath}`;
  });
  langs['x-default'] = `${BASE_URL}/en${relativePath}`;
  return langs;
}
