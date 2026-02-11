import { createClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isUUID } from '@/lib/slugify';
import SheetDetailClient from './SheetDetailClient';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Fetch sheet by slug or UUID (backward compatibility)
 */
async function fetchSheetBySlugOrId(slugOrId: string) {
  const supabase = await createClient();

  // Check if it's a UUID (old URL format)
  if (isUUID(slugOrId)) {
    // Fetch by ID
    const { data: sheet } = await supabase
      .from('drum_sheets')
      .select('*')
      .eq('id', slugOrId)
      .single();

    return { sheet, isUUID: true };
  }

  // Fetch by slug (new URL format)
  const { data: sheet } = await supabase
    .from('drum_sheets')
    .select('*')
    .eq('slug', slugOrId)
    .single();

  return { sheet, isUUID: false };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { sheet } = await fetchSheetBySlugOrId(slug);

  if (!sheet) {
    return { title: 'Sheet Not Found' };
  }

  return {
    title: `${sheet.title} - ${sheet.artist} | Drum Sheet Music PDF`,
    description: `Download the drum sheet music for ${sheet.title} by ${sheet.artist}. High-quality PDF drum score, instant download.`,
    openGraph: {
      title: `${sheet.title} - ${sheet.artist}`,
      description: `Drum sheet music for ${sheet.title} by ${sheet.artist}`,
      images: sheet.preview_image_url || sheet.thumbnail_url
        ? [{ url: sheet.preview_image_url || sheet.thumbnail_url }]
        : [],
    },
  };
}

export default async function SheetDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const { sheet, isUUID: isUUIDParam } = await fetchSheetBySlugOrId(slug);

  // If sheet not found, show 404
  if (!sheet) {
    return <div>Sheet not found</div>;
  }

  // If accessed via UUID, redirect to slug URL (SEO)
  if (isUUIDParam && sheet.slug) {
    redirect(`/drum-sheet/${sheet.slug}`);
  }

  // Pass sheet ID to client component
  return <SheetDetailClient id={sheet.id} />;
}
