import { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import CollectionDetailClient from '@/_pages/collections/detail';
import { buildCollectionDetailSeoStrings } from '@/lib/seo';

interface PageProps {
  params: {
    slug: string;
  };
}

// Generate metadata for SEO
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  // Await params in Next.js 15+
  const { slug } = await Promise.resolve(params);

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
    .select('id, title, description, thumbnail_url, sale_price, original_price')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (!collection) {
    return {
      title: 'Collection Not Found',
    };
  }

  const locale = 'en'; // This will be dynamic based on the route
  const seoStrings = buildCollectionDetailSeoStrings(locale, collection);

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

export default async function CollectionDetailPage({ params }: PageProps) {
  // Await params in Next.js 15+
  const { slug } = await Promise.resolve(params);

  console.log('[Collections Server] Rendering with slug:', slug);

  return <CollectionDetailClient slug={slug} />;
}
