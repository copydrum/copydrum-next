'use client';

import Link, { LinkProps } from 'next/link';
import { usePathname } from 'next/navigation';
import { getLocalizedUrl, getLocaleFromPathname } from '@/lib/localeUrl';
import { ReactNode } from 'react';

interface LocaleLinkProps extends Omit<LinkProps, 'href'> {
  href: string;
  children: ReactNode;
  className?: string;
  locale?: string; // Optional: override locale
  [key: string]: any; // Allow other props
}

/**
 * Locale-aware Link component
 * Automatically prefixes hrefs with current locale
 *
 * Usage:
 *   <LocaleLink href="/categories">Categories</LocaleLink>
 *   // In Korean: navigates to /ko/categories
 *   // In English: navigates to /categories
 */
export default function LocaleLink({
  href,
  children,
  locale,
  ...props
}: LocaleLinkProps) {
  const pathname = usePathname();

  // Get current locale from URL if not explicitly provided
  const currentLocale = locale || getLocaleFromPathname(pathname);

  // Generate localized URL
  const localizedHref = getLocalizedUrl(href, currentLocale);

  return (
    <Link href={localizedHref} {...props}>
      {children}
    </Link>
  );
}
