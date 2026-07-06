import { revalidatePath } from 'next/cache';
import { localeToPath } from '@/lib/seo/hreflang';

/** Invalidate cached ISR HTML for a drum sheet across all locale URLs. */
export function revalidateDrumSheetPages(slug: string) {
  if (!slug) return;

  const encodedSlug = encodeURIComponent(slug);

  for (const path of Object.values(localeToPath)) {
    revalidatePath(`/${path}/drum-sheet/${encodedSlug}`);
    revalidatePath(`/${path}/drum-sheet/${slug}`);
  }
}
