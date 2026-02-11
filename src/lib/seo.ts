/**
 * SEO helper functions for generating localized SEO strings
 */

interface DrumSheet {
  id: string;
  title: string;
  artist: string;
  category_id?: string;
  difficulty?: string;
  tempo?: number;
  page_count?: number;
  categories?: { name: string } | null;
}

interface SeoStrings {
  title: string;
  description: string;
  keywords: string;
}

/**
 * Build SEO strings for a drum sheet detail page
 * @param sheet - The drum sheet object
 * @param t - i18n translation function
 * @returns Object with title, description, and keywords
 */
export function buildDetailSeoStrings(
  sheet: DrumSheet,
  t: (key: string) => string
): SeoStrings {
  // Get template strings from i18n
  const titleTemplate = t('seo.detailTitle') || '{{title}} – {{artist}} | Drum Sheet Music PDF | COPYDRUM';
  const descriptionTemplate = t('seo.detailDescription') || 'Download the drum sheet music for {{title}} by {{artist}}. High-quality PDF, instant download.';
  const keywordsTemplate = t('seo.detailKeywords') || '{{title}}, {{artist}}, drum sheet music, drum score, drum transcription, COPYDRUM';

  // Extract values from sheet
  const title = sheet.title || '';
  const artist = sheet.artist || '';
  const genre = sheet.categories?.name || '';
  const pages = sheet.page_count?.toString() || '';
  const bpm = sheet.tempo?.toString() || '';
  
  // Map difficulty to display text
  let difficulty = '';
  if (sheet.difficulty) {
    const normalized = sheet.difficulty.toLowerCase().trim();
    if (normalized === '초급' || normalized === 'beginner') {
      difficulty = t('sheetDetail.difficulty.beginner') || 'Beginner';
    } else if (normalized === '중급' || normalized === 'intermediate') {
      difficulty = t('sheetDetail.difficulty.intermediate') || 'Intermediate';
    } else if (normalized === '고급' || normalized === 'advanced') {
      difficulty = t('sheetDetail.difficulty.advanced') || 'Advanced';
    } else {
      difficulty = sheet.difficulty;
    }
  }

  // Replace placeholders in templates
  const finalTitle = titleTemplate
    .replace(/\{\{title\}\}/g, title)
    .replace(/\{\{artist\}\}/g, artist);

  let finalDescription = descriptionTemplate
    .replace(/\{\{title\}\}/g, title)
    .replace(/\{\{artist\}\}/g, artist)
    .replace(/\{\{genre\}\}/g, genre)
    .replace(/\{\{pages\}\}/g, pages)
    .replace(/\{\{bpm\}\}/g, bpm)
    .replace(/\{\{difficulty\}\}/g, difficulty);
  
  // Clean up empty optional fields - remove patterns like ",  pages," or ",  BPM,"
  finalDescription = finalDescription
    .replace(/\s*,\s*,/g, ',') // Remove double commas
    .replace(/,\s*,/g, ',') // Remove comma-space-comma
    .replace(/,\s*$/g, '') // Remove trailing comma
    .replace(/^\s*,\s*/g, '') // Remove leading comma
    .replace(/\s+/g, ' ') // Normalize multiple spaces
    .trim();

  const finalKeywords = keywordsTemplate
    .replace(/\{\{title\}\}/g, title)
    .replace(/\{\{artist\}\}/g, artist);

  return {
    title: finalTitle,
    description: finalDescription,
    keywords: finalKeywords,
  };
}

/**
 * Build SEO strings for a category page
 * @param categoryName - The category name
 * @param t - i18n translation function
 * @returns Object with title and description
 */
export function buildCategorySeoStrings(
  categoryName: string,
  t: (key: string) => string
): { title: string; description: string } {
  const titleTemplate = t('seo.categoryTitle') || '{{category}} Drum Sheet Music | COPYDRUM';
  const descriptionTemplate = t('seo.categoryDescription') || 'Download drum sheet music for {{category}} songs in PDF format.';

  const title = titleTemplate.replace(/\{\{category\}\}/g, categoryName);
  const description = descriptionTemplate.replace(/\{\{category\}\}/g, categoryName);

  return { title, description };
}

/**
 * Build SEO strings for collections list page
 * @param locale - The current locale
 * @returns Object with SEO metadata
 */
export function buildCollectionsSeoStrings(locale: string) {
  const baseUrl = 'https://copydrum.com';

  const seoData: Record<string, any> = {
    ko: {
      title: '드럼 악보 모음집 | 테마별 큐레이션 | COPYDRUM',
      description: '테마별로 엄선한 특별한 드럼 악보 컬렉션을 만나보세요. 할인 혜택과 함께 여러 곡을 한 번에 구매할 수 있습니다.',
      ogTitle: '드럼 악보 모음집 - 테마별 특별 컬렉션',
      ogDescription: '테마별로 큐레이션된 드럼 악보 모음집. 개별 구매보다 저렴한 가격으로 여러 곡을 한 번에!',
      ogUrl: `${baseUrl}/collections`,
      ogImage: `${baseUrl}/logo.png`,
    },
    en: {
      title: 'Drum Sheet Music Collections | Themed Curation | COPYDRUM',
      description: 'Discover specially curated drum sheet music collections by theme. Purchase multiple songs at once with discount benefits.',
      ogTitle: 'Drum Sheet Music Collections - Special Themed Collections',
      ogDescription: 'Theme-curated drum sheet music collections. Multiple songs at a lower price than individual purchases!',
      ogUrl: `${baseUrl}/collections`,
      ogImage: `${baseUrl}/logo.png`,
    },
  };

  return seoData[locale] || seoData.en;
}

/**
 * Build SEO strings for collection detail page
 * @param locale - The current locale
 * @param collection - The collection object
 * @returns Object with SEO metadata
 */
export function buildCollectionDetailSeoStrings(
  locale: string,
  collection: {
    title: string;
    description?: string;
    thumbnail_url?: string;
    sale_price: number;
    original_price: number;
  }
) {
  const baseUrl = 'https://copydrum.com';
  const thumbnail = collection.thumbnail_url || `${baseUrl}/logo.png`;

  const seoData: Record<string, any> = {
    ko: {
      title: `${collection.title} - 드럼 악보 모음집 | COPYDRUM`,
      description: collection.description || `${collection.title} 드럼 악보 모음집. 테마별로 엄선한 드럼 악보를 할인가로 만나보세요.`,
      ogTitle: `${collection.title} - 드럼 악보 모음집`,
      ogDescription: collection.description || `${collection.title} 드럼 악보 모음집. 개별 구매보다 저렴하게!`,
      ogUrl: `${baseUrl}/collections`,
      ogImage: thumbnail,
    },
    en: {
      title: `${collection.title} - Drum Sheet Music Collection | COPYDRUM`,
      description: collection.description || `${collection.title} drum sheet music collection. Get specially curated drum sheets at a discounted price.`,
      ogTitle: `${collection.title} - Drum Sheet Music Collection`,
      ogDescription: collection.description || `${collection.title} drum sheet music collection. Cheaper than individual purchases!`,
      ogUrl: `${baseUrl}/collections`,
      ogImage: thumbnail,
    },
  };

  return seoData[locale] || seoData.en;
}

