import { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import CollectionDetailClient from '@/_pages/collections/detail';
import { buildCollectionDetailSeoStrings } from '@/lib/seo';
import {
  getLocaleFromHeaders,
  canonicalFor,
  buildLanguageAlternates,
} from '@/lib/seo/hreflang';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Generate metadata for SEO
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocaleFromHeaders();
  const relativePath = `/collections/${slug}`;
  const canonical = canonicalFor(locale, relativePath);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return {
      title: 'Collection Not Found',
    };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch collection data
  const { data: collection } = await supabase
    .from('collections')
    .select('id, title, description, title_translations, description_translations, thumbnail_url, sale_price, original_price')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (!collection) {
    return {
      title: 'Collection Not Found',
    };
  }

  const seoStrings = buildCollectionDetailSeoStrings(locale, collection);

  return {
    title: seoStrings.title,
    description: seoStrings.description,
    alternates: {
      canonical,
      languages: buildLanguageAlternates(relativePath),
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

export default async function CollectionDetailPage({ params }: PageProps) {
  const { slug } = await params;

  return <CollectionDetailClient slug={slug} />;
}
