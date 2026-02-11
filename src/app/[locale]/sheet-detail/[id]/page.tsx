import { createClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';
import SheetDetailClient from './SheetDetailClient';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: sheet } = await supabase
    .from('drum_sheets')
    .select('title, artist, thumbnail_url, preview_image_url')
    .eq('id', id)
    .single();

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

export default async function SheetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SheetDetailClient id={id} />;
}
