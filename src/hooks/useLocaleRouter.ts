'use client';

import { useRouter, usePathname } from 'next/navigation';
import { getLocalizedUrl, getLocaleFromPathname } from '@/lib/localeUrl';
import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Locale-aware router hook
 * Wraps Next.js useRouter with automatic locale prefixing
 * Returns a stable object reference to avoid useEffect re-triggers.
 *
 * Usage:
 *   const router = useLocaleRouter();
 *   router.push('/categories'); // Automatically navigates to /ko/categories or /categories
 */
export function useLocaleRouter() {
  const router = useRouter();
  const pathname = usePathname();
  const { i18n } = useTranslation();

  // i18n.language is always synced with the URL locale via LocaleSync component,
  // so it's more reliable than pathname parsing (e.g., when on /payment/success without locale prefix).
  // Fall back to pathname-based detection, then to 'en' as last resort.
  const pathnameLocale = getLocaleFromPathname(pathname);
  const currentLocale = i18n.language || pathnameLocale;

  // Use refs to keep latest values without causing useCallback to re-create
  const localeRef = useRef(currentLocale);
  localeRef.current = currentLocale;
  const routerRef = useRef(router);
  routerRef.current = router;

  const push = useCallback(
    (href: string, options?: any) => {
      const localizedHref = getLocalizedUrl(href, localeRef.current);
      return routerRef.current.push(localizedHref, options);
    },
    [] // stable — always reads latest from refs
  );

  const replace = useCallback(
    (href: string, options?: any) => {
      const localizedHref = getLocalizedUrl(href, localeRef.current);
      return routerRef.current.replace(localizedHref, options);
    },
    [] // stable — always reads latest from refs
  );

  // Return a stable object using useMemo (only re-creates if locale changes)
  return useMemo(() => ({
    ...router,
    push,
    replace,
    locale: currentLocale,
  }), [router, push, replace, currentLocale]);
}
