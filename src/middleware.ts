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
        ? `${protocol}://www.copydrum.com/${newPath}${pathname}${search}`
        : `${protocol}://www.copydrum.com${pathname}${search}`;
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

    if (!isExcludedPath && pathname !== '/favicon.ico') {
      // ⚠️ [SEO] 봇(Googlebot/Pinterest 등)도 반드시 서버에서 locale 경로로 리다이렉트한다.
      //    과거에는 봇을 제외(!isBotRequest)했는데, 그 결과 봇이 루트('/')나 locale 없는 경로에서
      //    클라이언트 전용 리다이렉트 컴포넌트(page.tsx)의 "Loading..." 셸만 보고
      //    실제 콘텐츠를 크롤링하지 못했다.
      //    → 봇은 Accept-Language 가 없어 자연히 기본 locale('en')로 이동하며,
      //      실제 콘텐츠가 있는 /en 페이지를 크롤링/색인할 수 있게 된다.
      const preferredLocale = isBotRequest
        ? defaultLocale
        : getPreferredLanguage(acceptLanguage);
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
  // ⚠️ [중요] /payments/, /payment/, /checkout 등 locale 제외 경로는 경로에
  //    locale이 없다. 이때 무조건 defaultLocale('en')로 쿠키를 덮어쓰면,
  //    한국어(/ko/...)로 보던 사용자가 결제 페이지에 진입/새로고침하는 순간
  //    locale 쿠키가 en으로 바뀌어 i18n.language='en'이 되고,
  //    결제 화면에서 카카오페이/KG이니시스가 사라지고 PayPal만 노출되는 버그가 발생한다.
  //    → 경로에 locale이 없으면 "기존 쿠키 값을 보존"하고, 쿠키도 갱신하지 않는다.
  const existingLocaleCookie = request.cookies.get('locale')?.value;
  const hasValidExistingLocale =
    !!existingLocaleCookie && locales.includes(existingLocaleCookie);
  const locale =
    localeInPath || (hasValidExistingLocale ? existingLocaleCookie! : defaultLocale);

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
  // ✅ 경로에 locale이 명시된 경우에만 쿠키를 갱신한다.
  //    locale이 없는 제외 경로(/payments/ 등)에서는 기존 쿠키를 보존하여
  //    사용자의 언어/결제수단 선택이 결제 단계에서 뒤집히지 않도록 한다.
  if (localeInPath) {
    response.cookies.set('locale', locale, { path: '/', sameSite: 'lax' });
  }

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
