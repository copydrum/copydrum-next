import type { Metadata } from 'next';
import FreeSheetsPage from '@/_pages/free-sheets/page';
import { getServerFreeSheetsSeo } from '@/lib/seo/serverSeo';
import {
  getLocaleFromHeaders,
  canonicalFor,
  buildLanguageAlternates,
} from '@/lib/seo/hreflang';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromHeaders();
  const seo = getServerFreeSheetsSeo(locale);
  const canonical = canonicalFor(locale, '/free-sheets');

  return {
    title: seo.title,
    description: seo.description,
    alternates: {
      canonical,
      languages: buildLanguageAlternates('/free-sheets'),
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

export default function FreeSheets() {
  return <FreeSheetsPage />;
}
