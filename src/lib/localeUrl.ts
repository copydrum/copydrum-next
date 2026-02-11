/**
 * Locale-aware URL generation utilities
 * Handles path-based internationalization routing
 */

// Locale to path prefix mapping
const localeToPath: Record<string, string> = {
  'en': 'en',       // English now has /en prefix
  'ko': 'ko',
  'ja': 'ja',
  'de': 'de',
  'es': 'es',
  'fr': 'fr',
  'hi': 'hi',
  'id': 'id',
  'it': 'it',
  'pt': 'pt',
  'ru': 'ru',
  'th': 'th',
  'tr': 'tr',
  'uk': 'uk',
  'vi': 'vi',
  'zh-CN': 'zh-cn',
  'zh-TW': 'zh-tw',
};

const pathToLocale: Record<string, string> = {
  'en': 'en',       // English now recognized as locale
  'ko': 'ko',
  'ja': 'ja',
  'de': 'de',
  'es': 'es',
  'fr': 'fr',
  'hi': 'hi',
  'id': 'id',
  'it': 'it',
  'pt': 'pt',
  'ru': 'ru',
  'th': 'th',
  'tr': 'tr',
  'uk': 'uk',
  'vi': 'vi',
  'zh-cn': 'zh-CN',
  'zh-tw': 'zh-TW',
};

/**
 * Get locale from URL pathname
 * @param pathname - URL pathname (e.g., '/ko/categories')
 * @returns Locale code or 'en' (default)
 */
export function getLocaleFromPathname(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return 'en';

  const firstSegment = segments[0].toLowerCase();
  return pathToLocale[firstSegment] || 'en';
}

/**
 * Generate locale-aware URL
 * @param path - Base path (e.g., '/categories')
 * @param locale - Target locale code (e.g., 'ko', 'en')
 * @returns Locale-prefixed path (e.g., '/ko/categories' or '/en/categories')
 */
export function getLocalizedUrl(path: string, locale: string): string {
  // Ensure path starts with /
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  // Strip any existing locale prefix to prevent double-prefixing (e.g., /ko/ko/...)
  const pathWithoutLocale = removeLocaleFromPathname(cleanPath);

  // Get locale prefix
  const localePrefix = localeToPath[locale] || 'en';

  // Return path with locale prefix
  return `/${localePrefix}${pathWithoutLocale}`;
}

/**
 * Remove locale prefix from path
 * @param pathname - Full pathname (e.g., '/ko/categories')
 * @returns Path without locale prefix (e.g., '/categories')
 */
export function removeLocaleFromPathname(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) return '/';

  const firstSegment = segments[0].toLowerCase();

  // Check if first segment is a locale
  if (pathToLocale[firstSegment]) {
    return '/' + segments.slice(1).join('/');
  }

  return pathname;
}

/**
 * Get current locale from browser (client-side only)
 * @returns Current locale code
 */
export function getCurrentLocale(): string {
  if (typeof window === 'undefined') return 'en';

  return getLocaleFromPathname(window.location.pathname);
}

/**
 * Generate locale-aware URL using current locale
 * @param path - Base path
 * @returns Locale-prefixed path using current locale
 */
export function getLocalizedUrlForCurrentLocale(path: string): string {
  const currentLocale = getCurrentLocale();
  return getLocalizedUrl(path, currentLocale);
}

/**
 * Switch between locales for the same page
 * @param currentPathname - Current pathname
 * @param targetLocale - Target locale code
 * @returns URL for the same page in target locale
 */
export function switchLocale(currentPathname: string, targetLocale: string): string {
  const pathWithoutLocale = removeLocaleFromPathname(currentPathname);
  return getLocalizedUrl(pathWithoutLocale, targetLocale);
}
