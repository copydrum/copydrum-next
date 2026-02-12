import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Supported locales
const locales = ['en', 'ko', 'ja', 'de', 'es', 'fr', 'hi', 'id', 'it', 'pt', 'ru', 'th', 'tr', 'uk', 'vi', 'zh-CN', 'zh-TW'];
const defaultLocale = 'en';

// Locale to path mapping (for URL construction)
const localeToPath: Record<string, string> = {
  'en': 'en', 'ko': 'ko', 'ja': 'ja', 'de': 'de', 'es': 'es',
  'fr': 'fr', 'hi': 'hi', 'id': 'id', 'it': 'it', 'pt': 'pt',
  'ru': 'ru', 'th': 'th', 'tr': 'tr', 'uk': 'uk', 'vi': 'vi',
  'zh-CN': 'zh-cn', 'zh-TW': 'zh-tw',
};

// Path to locale mapping (URL path segments use lowercase and hyphen)
const pathToLocale: Record<string, string> = {
  'en': 'en', 'ko': 'ko', 'ja': 'ja', 'de': 'de', 'es': 'es',
  'fr': 'fr', 'hi': 'hi', 'id': 'id', 'it': 'it', 'pt': 'pt',
  'ru': 'ru', 'th': 'th', 'tr': 'tr', 'uk': 'uk', 'vi': 'vi',
  'zh-cn': 'zh-CN', 'zh-tw': 'zh-TW',
};

// Old subdomain to new path mapping
const subdomainToPath: Record<string, string> = {
  'en': '', 'jp': 'ja', 'ja': 'ja', 'de': 'de', 'es': 'es',
  'fr': 'fr', 'hi': 'hi', 'id': 'id', 'it': 'it', 'pt': 'pt',
  'ru': 'ru', 'th': 'th', 'tr': 'tr', 'uk': 'uk', 'vi': 'vi',
  'zh-cn': 'zh-cn', 'zhcn': 'zh-cn', 'zh-tw': 'zh-tw', 'zhtw': 'zh-tw',
};

function getLocaleFromPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  const firstSegment = segments[0].toLowerCase();
  return pathToLocale[firstSegment] || null;
}

/**
 * Parse Accept-Language header and return the best matching supported locale
 */
function getPreferredLanguage(acceptLanguage: string | null): string {
  if (!acceptLanguage) return defaultLocale;

  const languages = acceptLanguage
    .split(',')
    .map(lang => {
      const [code, qValue] = lang.trim().split(';q=');
      const quality = qValue ? parseFloat(qValue) : 1.0;
      return { code: code.toLowerCase(), quality };
    })
    .sort((a, b) => b.quality - a.quality);

  for (const { code } of languages) {
    if (locales.map(l => l.toLowerCase()).includes(code)) {
      return locales.find(l => l.toLowerCase() === code) || defaultLocale;
    }
    const primaryCode = code.split('-')[0];
    if (locales.includes(primaryCode)) return primaryCode;
    if (code.startsWith('zh')) {
      return (code.includes('tw') || code.includes('hk') || code.includes('mo')) ? 'zh-TW' : 'zh-CN';
    }
  }

  return defaultLocale;
}

/** Check if the request is from a search engine crawler */
function isBot(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const botPatterns = [
    'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider',
    'yandexbot', 'facebookexternalhit', 'twitterbot', 'rogerbot',
    'linkedinbot', 'embedly', 'quora link preview', 'showyoubot',
    'outbrain', 'pinterest', 'slackbot', 'vkshare', 'w3c_validator',
    'whatsapp', 'lighthouse', 'bot', 'crawler', 'spider'
  ];
  return botPatterns.some(pattern => userAgent.toLowerCase().includes(pattern));
}

export default function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = request.headers.get('host') || '';
  const hostname = host.toLowerCase().replace(/^www\./, '').split(':')[0];

  // ===========================================
  // 0. [방어 로직] 관리자 페이지는 절대 건드리지 않음
  // ===========================================
  if (pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  // ===========================================
  // 1. REDIRECT OLD SUBDOMAIN URLS TO NEW PATHS
  // ===========================================
  const subdomainMatch = hostname.match(/^([a-z\-]+)\.copydrum\.com$/);
  if (subdomainMatch && subdomainMatch[1] !== 'www') {
    const subdomain = subdomainMatch[1];
    if (subdomainToPath.hasOwnProperty(subdomain)) {
      const newPath = subdomainToPath[subdomain];
      const protocol = request.headers.get('x-forwarded-proto') || 'https';
      const newUrl = newPath
        ? `${protocol}://copydrum.com/${newPath}${pathname}${search}`
        : `${protocol}://copydrum.com${pathname}${search}`;
      return NextResponse.redirect(newUrl, { status: 301 });
    }
  }

  // ===========================================
  // 2. AUTOMATIC LANGUAGE DETECTION & REDIRECT
  //    (locale이 없는 경로 → /{locale}/ 로 리다이렉트)
  // ===========================================
  const localeInPath = getLocaleFromPath(pathname);
  const userAgent = request.headers.get('user-agent');
  const acceptLanguage = request.headers.get('accept-language');

  if (!localeInPath) {
    const excludedPrefixes = [
      '/api/', '/_next/', '/auth/', '/payments/', '/payment/', '/admin', '/.well-known/',
      '/checkout', '/customer-portal',
    ];
    const excludedExtensions = ['.xml', '.txt', '.ico', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];

    const isExcludedPath =
      excludedPrefixes.some(p => pathname.startsWith(p)) ||
      excludedExtensions.some(ext => pathname.endsWith(ext));

    const isBotRequest = isBot(userAgent);

    if (!isExcludedPath && !isBotRequest && pathname !== '/favicon.ico') {
      const preferredLocale = getPreferredLanguage(acceptLanguage);
      const localePath = localeToPath[preferredLocale] || 'en';

      const url = request.nextUrl.clone();
      url.pathname = `/${localePath}${pathname}`;
      return NextResponse.redirect(url, { status: 302 });
    }
  }

  // ===========================================
  // 3. DETECT LOCALE & SET HEADER/COOKIE
  //    (URL rewrite 없음 — [locale] 동적 라우팅이 자동 처리)
  // ===========================================
  const locale = localeInPath || defaultLocale;

  // /en/admin → /admin 으로 리다이렉트 (locale prefix 제거)
  if (localeInPath) {
    const segments = pathname.split('/').filter(Boolean);
    const pathWithoutLocale = '/' + segments.slice(1).join('/');
    if (pathWithoutLocale === '/admin' || pathWithoutLocale.startsWith('/admin/')) {
      const url = request.nextUrl.clone();
      url.pathname = pathWithoutLocale;
      return NextResponse.redirect(url, { status: 302 });
    }
  }

  const response = NextResponse.next();

  // Set locale header and cookie for server components to use
  response.headers.set('x-locale', locale);
  response.cookies.set('locale', locale, { path: '/', sameSite: 'lax' });

  return response;
}

// ✅ 여기가 핵심!
// 아래 경로들은 미들웨어를 거치지 않고 무시합니다:
// 1. /api (API 라우트)
// 2. /_next (Next.js 내부 시스템 파일)
// 3. /_vercel (Vercel 배포 관련)
// 4. /admin (관리자 페이지)
// 5. sitemap.xml, robots.txt (SEO 파일)
// 6. .*\..* (점이 포함된 파일 - logo.png 등)
export const config = {
  matcher: [
    '/((?!api|_next|_vercel|admin|sitemap\\.xml|robots\\.txt|.*\\..*).*)',
  ],
};
