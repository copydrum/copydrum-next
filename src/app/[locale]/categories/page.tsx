import type { Metadata } from 'next';
import CategoriesPage from '@/_pages/categories/page';
import { getServerCategoriesPageSeo } from '@/lib/seo/serverSeo';
import {
  getLocaleFromHeaders,
  canonicalFor,
  buildLanguageAlternates,
} from '@/lib/seo/hreflang';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromHeaders();
  const seo = getServerCategoriesPageSeo(locale);
  const canonical = canonicalFor(locale, '/categories');

  return {
    title: seo.title,
    description: seo.description,
    alternates: {
      canonical,
      languages: buildLanguageAlternates('/categories'),
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

export default function Categories() {
  return <CategoriesPage />;
}
