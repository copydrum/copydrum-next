import type { Metadata } from 'next';
import Home from '@/_pages/home/page';
import { getServerHomeSeo } from '@/lib/seo/serverSeo';
import {
  getLocaleFromHeaders,
  canonicalFor,
  buildLanguageAlternates,
} from '@/lib/seo/hreflang';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromHeaders();
  const seo = getServerHomeSeo(locale);
  const canonical = canonicalFor(locale, '/');

  return {
    title: seo.title,
    description: seo.description,
    alternates: {
      canonical,
      languages: buildLanguageAlternates('/'),
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: canonical,
      siteName: 'COPYDRUM',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: seo.title,
      description: seo.description,
    },
  };
}

export default async function LocalePage() {
  return <Home />;
}
