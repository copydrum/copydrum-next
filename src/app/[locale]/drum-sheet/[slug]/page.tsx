import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { cache } from 'react';
import SheetDetailClient from './SheetDetailClient';
import type { Metadata } from 'next';
import { languages } from '@/i18n/languages';

// 헬퍼 함수
function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

// Base URL for canonical and alternates
const BASE_URL = 'https://copydrum.com';

// Locale to URL path mapping (matches middleware)
const localeToPath: Record<string, string> = {
  'en': 'en',
  'ko': 'ko',
  'ja': 'ja',
  'zh-CN': 'zh-cn',
  'zh-TW': 'zh-tw',
  'de': 'de',
  'fr': 'fr',
  'es': 'es',
  'vi': 'vi',
  'th': 'th',
  'hi': 'hi',
  'id': 'id',
  'pt': 'pt',
  'ru': 'ru',
  'it': 'it',
  'tr': 'tr',
  'uk': 'uk',
};

/**
 * Cached function to fetch drum sheet by slug or UUID
 * This prevents duplicate queries in generateMetadata and page component
 */
const getSheetBySlugOrId = cache(async (slugOrId: string) => {
  const supabase = await createClient();

  let query = supabase.from('drum_sheets').select('*, categories(name), sales_type, description').single();

  if (isUUID(slugOrId)) {
    query = query.eq('id', slugOrId);
  } else {
    query = query.eq('slug', slugOrId);
  }

  const { data: sheet, error } = await query;

  return { sheet, error, isUUID: isUUID(slugOrId) };
});

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);

  // Use cached function to fetch sheet (shared with page component)
  const { sheet } = await getSheetBySlugOrId(decodedSlug);

  // Return 404 metadata if sheet not found
  if (!sheet) {
    return { title: 'Not Found' };
  }

  // Get current locale from headers (set by middleware)
  const headersList = await headers();
  const locale = headersList.get('x-locale') || 'en';

  // Use canonical slug (not UUID)
  const canonicalSlug = sheet.slug || slug;

  // Build canonical URL for current locale
  const currentLocalePath = localeToPath[locale] || 'en';
  const canonical = `${BASE_URL}/${currentLocalePath}/drum-sheet/${canonicalSlug}`;

  // Build alternate language URLs
  const languageAlternates: Record<string, string> = {};

  // Add all supported languages
  languages.forEach((lang) => {
    const langPath = localeToPath[lang.code] || lang.code.toLowerCase();
    languageAlternates[lang.code] = `${BASE_URL}/${langPath}/drum-sheet/${canonicalSlug}`;
  });

  // Add x-default (English)
  languageAlternates['x-default'] = `${BASE_URL}/en/drum-sheet/${canonicalSlug}`;

  return {
    title: `${sheet.title} - ${sheet.artist} | CopyDrum`,
    description: `Drum sheet music for ${sheet.title} by ${sheet.artist}. High-quality PDF drum score, instant download.`,
    alternates: {
      canonical,
      languages: languageAlternates,
    },
    openGraph: {
      title: `${sheet.title} - ${sheet.artist}`,
      description: `Drum sheet music for ${sheet.title} by ${sheet.artist}`,
      url: canonical,
      type: 'website',
      images: sheet.preview_image_url || sheet.thumbnail_url
        ? [
            {
              url: sheet.preview_image_url || sheet.thumbnail_url,
              width: 1200,
              height: 630,
              alt: `${sheet.title} - ${sheet.artist} drum sheet music`,
            },
          ]
        : [],
    },
  };
}

export default async function SheetDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);

  // Use cached function to fetch sheet (shared with generateMetadata)
  const { sheet, error, isUUID: isUUIDParam } = await getSheetBySlugOrId(decodedSlug);

  // Show 404 if sheet not found
  if (error || !sheet) {
    return notFound();
  }

  // Redirect UUID-based URLs to slug-based URLs (SEO improvement)
  if (isUUIDParam && sheet.slug) {
    redirect(`/drum-sheet/${sheet.slug}`);
  }

  return <SheetDetailClient sheet={sheet} />;
}