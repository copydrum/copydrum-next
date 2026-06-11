import { Metadata } from 'next';
import CollectionsPageClient from '@/_pages/collections/page';
import { buildCollectionsSeoStrings } from '@/lib/seo';
import {
  getLocaleFromHeaders,
  canonicalFor,
  buildLanguageAlternates,
} from '@/lib/seo/hreflang';

// Generate metadata for SEO
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromHeaders();
  const seoStrings = buildCollectionsSeoStrings(locale);
  const canonical = canonicalFor(locale, '/collections');

  return {
    title: seoStrings.title,
    description: seoStrings.description,
    alternates: {
      canonical,
      languages: buildLanguageAlternates('/collections'),
    },
    openGraph: {
      title: seoStrings.ogTitle,
      description: seoStrings.ogDescription,
      type: 'website',
      url: canonical,
      siteName: 'COPYDRUM',
      images: [
        {
          url: seoStrings.ogImage,
          width: 1200,
          height: 630,
          alt: seoStrings.ogTitle,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: seoStrings.ogTitle,
      description: seoStrings.ogDescription,
      images: [seoStrings.ogImage],
    },
  };
}

export default function CollectionsPage() {
  return <CollectionsPageClient />;
}
