'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';

const ALT_LINKS = [
  { hreflang: 'ko', baseUrl: 'https://copydrum.com' },
  { hreflang: 'en', baseUrl: 'https://en.copydrum.com' },
  { hreflang: 'ja', baseUrl: 'https://jp.copydrum.com' },
];

export default function HreflangTags() {
  const pathname = usePathname();
  const { i18n } = useTranslation();

  useEffect(() => {
    const path = `${pathname}${window.location.search}`;

    const existingTags = document.querySelectorAll('link[rel="alternate"][hreflang]');
    existingTags.forEach((tag) => tag.remove());

    ALT_LINKS.forEach(({ hreflang, baseUrl }) => {
      const link = document.createElement('link');
      link.rel = 'alternate';
      link.hrefLang = hreflang;
      link.href = `${baseUrl}${path}`;
      document.head.appendChild(link);
    });

    const defaultLink = document.createElement('link');
    defaultLink.rel = 'alternate';
    defaultLink.hrefLang = 'x-default';
    defaultLink.href = `https://en.copydrum.com${path}`;
    document.head.appendChild(defaultLink);

    document.documentElement.lang = i18n.language;

    return () => {
      const tags = document.querySelectorAll('link[rel="alternate"][hreflang]');
      tags.forEach((tag) => tag.remove());
    };
  }, [pathname, i18n.language]);

  return null;
}

