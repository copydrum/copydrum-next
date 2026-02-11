'use client';

import { useEffect } from 'react';

interface SeoProps {
  title?: string;
  description?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImageUrl?: string;
  canonicalUrl?: string;
  locale?: string;
}

const DEFAULT_TITLE = 'COPYDRUM | Drum Sheet Music Store';
const DEFAULT_DESCRIPTION = 'High-quality drum sheet music and drum scores for pop, rock, K-POP, CCM and more.';

function setMeta(name: string, content: string, isProperty = false) {
  const attr = isProperty ? 'property' : 'name';
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

export default function Seo({
  title,
  description,
  keywords,
  ogTitle,
  ogDescription,
  ogImageUrl,
  canonicalUrl,
  locale,
}: SeoProps) {
  const finalTitle = title || DEFAULT_TITLE;
  const finalDescription = description || DEFAULT_DESCRIPTION;
  const finalOgTitle = ogTitle || title || DEFAULT_TITLE;
  const finalOgDescription = ogDescription || description || DEFAULT_DESCRIPTION;
  const finalLocale = locale || 'en';

  useEffect(() => {
    document.title = finalTitle;
    setMeta('description', finalDescription);
    if (keywords) setMeta('keywords', keywords);

    // Yandex Verification (Russian site only)
    const isRussianSite =
      window.location.hostname === 'ru.copydrum.com' ||
      window.location.hostname.startsWith('ru.');
    if (isRussianSite) {
      setMeta('yandex-verification', 'f0c26a336701f2fd');
    }

    // Canonical URL
    let finalCanonicalUrl = canonicalUrl;
    if (canonicalUrl && !canonicalUrl.startsWith('http')) {
      finalCanonicalUrl = `${window.location.origin}${canonicalUrl}`;
    } else if (!finalCanonicalUrl) {
      finalCanonicalUrl = window.location.href.split('?')[0];
    }
    if (finalCanonicalUrl) {
      setLink('canonical', finalCanonicalUrl);
    }

    // OG image URL
    let finalOgImageUrl = ogImageUrl;
    if (ogImageUrl && !ogImageUrl.startsWith('http')) {
      finalOgImageUrl = `${window.location.origin}${ogImageUrl}`;
    }

    // Open Graph Tags
    setMeta('og:type', 'website', true);
    setMeta('og:title', finalOgTitle, true);
    setMeta('og:description', finalOgDescription, true);
    if (finalOgImageUrl) setMeta('og:image', finalOgImageUrl, true);
    if (finalCanonicalUrl) setMeta('og:url', finalCanonicalUrl, true);
    setMeta('og:site_name', 'COPYDRUM', true);
    setMeta('og:locale', finalLocale, true);
  }, [finalTitle, finalDescription, keywords, finalOgTitle, finalOgDescription, ogImageUrl, canonicalUrl, finalLocale]);

  return null;
}
