import { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import CollectionsPageClient from '@/_pages/collections/page';
import { buildCollectionsSeoStrings } from '@/lib/seo';

// Generate metadata for SEO
export async function generateMetadata(): Promise<Metadata> {
  const locale = 'en'; // This will be dynamic based on the route
  const seoStrings = buildCollectionsSeoStrings(locale);

  return {
    title: seoStrings.title,
    description: seoStrings.description,
    openGraph: {
      title: seoStrings.ogTitle,
      description: seoStrings.ogDescription,
      type: 'website',
      url: seoStrings.ogUrl,
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
