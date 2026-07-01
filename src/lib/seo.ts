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
  const baseUrl = 'https://www.copydrum.com';

  const seoData: Record<string, { title: string; description: string }> = {
    ko: {
      title: '드럼 악보 모음집 | 테마별 큐레이션 | COPYDRUM',
      description: '테마별로 엄선한 특별한 드럼 악보 컬렉션을 만나보세요. 할인 혜택과 함께 여러 곡을 한 번에 구매할 수 있습니다.',
    },
    en: {
      title: 'Drum Sheet Music Collections | Themed Curation | COPYDRUM',
      description: 'Discover specially curated drum sheet music collections by theme. Purchase multiple songs at once with discount benefits.',
    },
    ja: {
      title: 'ドラム楽譜コレクション | テーマ別キュレーション | COPYDRUM',
      description: 'テーマごとに厳選したドラム楽譜コレクション。割引でまとめ買いできます。',
    },
    'zh-CN': {
      title: '架子鼓乐谱合集 | 主题精选 | COPYDRUM',
      description: '按主题精选的架子鼓乐谱合集，享折扣一次购买多首乐谱。',
    },
    'zh-TW': {
      title: '爵士鼓樂譜合輯 | 主題精選 | COPYDRUM',
      description: '依主題精選的爵士鼓樂譜合輯，享折扣一次購買多首樂譜。',
    },
    de: {
      title: 'Schlagzeugnoten-Sammlungen | Kuratiert nach Thema | COPYDRUM',
      description: 'Entdecke nach Themen kuratierte Schlagzeugnoten-Sammlungen. Mehrere Songs günstiger im Paket.',
    },
    fr: {
      title: 'Collections de partitions de batterie | Sélection par thème | COPYDRUM',
      description: 'Découvrez des collections de partitions de batterie sélectionnées par thème. Plusieurs morceaux à prix réduit.',
    },
    es: {
      title: 'Colecciones de partituras de batería | Curadas por tema | COPYDRUM',
      description: 'Descubre colecciones de partituras de batería curadas por tema. Varias canciones con descuento.',
    },
    vi: {
      title: 'Bộ sưu tập bản nhạc trống | Tuyển chọn theo chủ đề | COPYDRUM',
      description: 'Khám phá các bộ sưu tập bản nhạc trống được tuyển chọn theo chủ đề. Mua nhiều bài với giá ưu đãi.',
    },
    th: {
      title: 'คอลเลกชันโน้ตกลอง | คัดสรรตามธีม | COPYDRUM',
      description: 'พบกับคอลเลกชันโน้ตกลองที่คัดสรรตามธีม ซื้อหลายเพลงพร้อมส่วนลด',
    },
    hi: {
      title: 'ड्रम शीट संगीत संग्रह | थीम के अनुसार | COPYDRUM',
      description: 'थीम के अनुसार चुने गए ड्रम शीट संगीत संग्रह। छूट के साथ कई गाने एक साथ खरीदें।',
    },
    id: {
      title: 'Koleksi Partitur Drum | Kurasi per Tema | COPYDRUM',
      description: 'Temukan koleksi partitur drum pilihan per tema. Beli banyak lagu sekaligus dengan harga diskon.',
    },
    pt: {
      title: 'Coleções de partituras de bateria | Curadoria por tema | COPYDRUM',
      description: 'Descubra coleções de partituras de bateria por tema. Várias músicas de uma vez com desconto.',
    },
    ru: {
      title: 'Коллекции нот для барабанов | Подборки по темам | COPYDRUM',
      description: 'Откройте тематические коллекции нот для барабанов. Несколько композиций сразу со скидкой.',
    },
    it: {
      title: 'Raccolte di spartiti per batteria | Selezione per tema | COPYDRUM',
      description: 'Scopri raccolte di spartiti per batteria selezionate per tema. Più brani insieme a prezzo scontato.',
    },
    tr: {
      title: 'Davul Notası Koleksiyonları | Temaya Göre Seçki | COPYDRUM',
      description: 'Temaya göre seçilmiş davul notası koleksiyonlarını keşfedin. İndirimle birden çok parçayı bir arada alın.',
    },
    uk: {
      title: 'Колекції нот для барабанів | Добірки за темами | COPYDRUM',
      description: 'Відкрийте тематичні колекції нот для барабанів. Кілька композицій одразу зі знижкою.',
    },
  };

  const picked = seoData[locale] || seoData.en;
  return {
    ...picked,
    ogTitle: picked.title.replace(/\s*\|\s*COPYDRUM\s*$/, ''),
    ogDescription: picked.description,
    ogUrl: `${baseUrl}/collections`,
    ogImage: `${baseUrl}/logo.png`,
  };
}

// 모음집 상세 제목 접미사 ("드럼 악보 모음집" 상당) — 17개 언어
const COLLECTION_SUFFIX: Record<string, string> = {
  ko: '드럼 악보 모음집',
  en: 'Drum Sheet Music Collection',
  ja: 'ドラム楽譜コレクション',
  'zh-CN': '架子鼓乐谱合集',
  'zh-TW': '爵士鼓樂譜合輯',
  de: 'Schlagzeugnoten-Sammlung',
  fr: 'Collection de partitions de batterie',
  es: 'Colección de partituras de batería',
  vi: 'Bộ sưu tập bản nhạc trống',
  th: 'คอลเลกชันโน้ตกลอง',
  hi: 'ड्रम शीट संगीत संग्रह',
  id: 'Koleksi Partitur Drum',
  pt: 'Coleção de partituras de bateria',
  ru: 'Коллекция нот для барабанов',
  it: 'Raccolta di spartiti per batteria',
  tr: 'Davul Notası Koleksiyonu',
  uk: 'Колекція нот для барабанів',
};

function resolveLocalized(
  translations: Record<string, string> | null | undefined,
  locale: string,
  fallback: string
): string {
  if (translations) {
    const base = locale.split('-')[0];
    const v = translations[locale] || translations[base];
    if (v && v.trim()) return v.trim();
  }
  return fallback;
}

/**
 * Build SEO strings for collection detail page (17개 언어 지원)
 * @param locale - The current locale
 * @param collection - The collection object (title/description + *_translations)
 */
export function buildCollectionDetailSeoStrings(
  locale: string,
  collection: {
    title: string;
    description?: string;
    title_translations?: Record<string, string> | null;
    description_translations?: Record<string, string> | null;
    thumbnail_url?: string;
    sale_price?: number;
    original_price?: number;
  }
) {
  const baseUrl = 'https://www.copydrum.com';
  const thumbnail = collection.thumbnail_url || `${baseUrl}/logo.png`;

  const name = resolveLocalized(collection.title_translations, locale, collection.title);
  const suffix = COLLECTION_SUFFIX[locale] || COLLECTION_SUFFIX.en;
  const localizedDesc = resolveLocalized(
    collection.description_translations,
    locale,
    collection.description || ''
  );
  const description = localizedDesc || `${name} - ${suffix}`;
  const ogTitle = `${name} - ${suffix}`;

  return {
    title: `${name} - ${suffix} | COPYDRUM`,
    description,
    ogTitle,
    ogDescription: description,
    ogUrl: `${baseUrl}/collections`,
    ogImage: thumbnail,
  };
}

