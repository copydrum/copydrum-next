// 지원하는 언어 목록
export interface Language {
  code: string;
  name: string;
  nativeName: string;
  hreflang: string;
  flagEmoji: string;
  flagCode: string;
}

export const languages: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', hreflang: 'en', flagEmoji: '🇺🇸', flagCode: 'us' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', hreflang: 'ko', flagEmoji: '🇰🇷', flagCode: 'kr' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', hreflang: 'ja', flagEmoji: '🇯🇵', flagCode: 'jp' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文', hreflang: 'zh-Hans', flagEmoji: '🇨🇳', flagCode: 'cn' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '繁體中文', hreflang: 'zh-Hant', flagEmoji: '🇹🇼', flagCode: 'tw' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', hreflang: 'de', flagEmoji: '🇩🇪', flagCode: 'de' },
  { code: 'fr', name: 'French', nativeName: 'Français', hreflang: 'fr', flagEmoji: '🇫🇷', flagCode: 'fr' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', hreflang: 'es', flagEmoji: '🇪🇸', flagCode: 'es' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', hreflang: 'vi', flagEmoji: '🇻🇳', flagCode: 'vn' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', hreflang: 'th', flagEmoji: '🇹🇭', flagCode: 'th' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', hreflang: 'hi', flagEmoji: '🇮🇳', flagCode: 'in' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', hreflang: 'id', flagEmoji: '🇮🇩', flagCode: 'id' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', hreflang: 'pt', flagEmoji: '🇵🇹', flagCode: 'pt' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', hreflang: 'ru', flagEmoji: '🇷🇺', flagCode: 'ru' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', hreflang: 'it', flagEmoji: '🇮🇹', flagCode: 'it' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', hreflang: 'tr', flagEmoji: '🇹🇷', flagCode: 'tr' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', hreflang: 'uk', flagEmoji: '🇺🇦', flagCode: 'ua' },
];

// 언어 코드 -> URL path 매핑
export const languageCodeToPath: Record<string, string> = {
  en: '',
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

// URL path -> 언어 코드 매핑
export const pathToLanguageCode: Record<string, string> = {
  en: 'en',
  ko: 'ko',
  ja: 'ja',
  'zh-cn': 'zh-CN',
  'zh-tw': 'zh-TW',
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

// 지원하는 언어 코드 배열
export const supportedLanguages = languages.map(lang => lang.code);

// 기본 언어 (Default language - English for root path)
export const defaultLanguage = 'en';

// 언어 코드로 언어 정보 가져오기
export const getLanguageByCode = (code: string): Language | undefined => {
  return languages.find(lang => lang.code === code);
};

// URL path로 언어 코드 가져오기
export const getLanguageFromPath = (path: string): string | undefined => {
  const segments = path.split('/').filter(Boolean);
  const firstSegment = segments[0] || '';
  return pathToLanguageCode[firstSegment];
};

// 언어 코드로 URL path 가져오기
export const getPathForLanguage = (langCode: string): string => {
  return languageCodeToPath[langCode] || '';
};

const normalizeHost = (host?: string) => {
  if (!host) return '';
  return host.split(':')[0].toLowerCase();
};

import { isGlobalSiteHost } from '../config/hostType';

export const isEnglishHost = (host?: string) => {
  if (!host) return false;
  return isGlobalSiteHost(host);
};

const isKoreanPrimaryHost = (host?: string) => {
  const normalized = normalizeHost(host);
  if (!normalized) return false;
  if (normalized === 'copydrum.com' || normalized === 'www.copydrum.com') {
    return true;
  }
  // 다른 서브도메인은 기본값으로 한국어 취급(필요 시 확장)
  if (!isEnglishHost(host) && normalized.endsWith('copydrum.com')) {
    return true;
  }
  if (normalized.includes('localhost') || normalized.endsWith('.local')) {
    return true;
  }
  return false;
};

export const getDefaultLanguageForHost = (host?: string) => {
  if (isEnglishHost(host)) {
    return 'en';
  }
  if (isKoreanPrimaryHost(host)) {
    return 'ko';
  }
  return defaultLanguage;
};

export const isKoreanHost = (host?: string) => getDefaultLanguageForHost(host) === 'ko';

