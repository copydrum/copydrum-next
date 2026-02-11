import { createClient } from '@supabase/supabase-js';
import type { MetadataRoute } from 'next';
import { languages } from '@/i18n/languages';
import { languageDomainMap } from '@/config/languageDomainMap';

// 정적 페이지 경로 정의
const staticPages = [
  { path: '/', priority: 1.0, changeFrequency: 'daily' as const },
  { path: '/categories', priority: 0.9, changeFrequency: 'daily' as const },
  { path: '/collections', priority: 0.9, changeFrequency: 'weekly' as const },
  { path: '/guide', priority: 0.6, changeFrequency: 'monthly' as const },
  { path: '/policy/refund', priority: 0.5, changeFrequency: 'monthly' as const },
  { path: '/company/about', priority: 0.5, changeFrequency: 'monthly' as const },
  { path: '/free-sheets', priority: 0.7, changeFrequency: 'weekly' as const },
];

// Supabase 클라이언트 생성 헬퍼
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseKey);
}

// 언어별로 sitemap을 분할 생성
// 각 언어당 하나의 sitemap ID를 할당
export async function generateSitemaps() {
  return languages.map((lang, index) => ({
    id: index,
  }));
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  const supabase = getSupabaseClient();

  // 언어 정보 가져오기
  const lang = languages[id];
  if (!lang) {
    return [];
  }

  const baseUrl = languageDomainMap[lang.code as keyof typeof languageDomainMap];

  // Supabase 연결이 없을 경우 정적 페이지만 반환
  if (!supabase) {
    return staticPages.map((page) => ({
      url: `${baseUrl}${page.path}`,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    }));
  }

  const urls: MetadataRoute.Sitemap = [];

  // 1. 정적 페이지 URL 추가
  staticPages.forEach((page) => {
    urls.push({
      url: `${baseUrl}${page.path}`,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    });
  });

  // 2. 드럼 악보 데이터 가져오기 (페이지네이션 적용)
  // 한 언어당 최대 약 45,000개의 동적 URL을 허용 (정적 페이지 제외)
  const MAX_URLS_PER_SITEMAP = 45000;
  const BATCH_SIZE = 1000; // 한 번에 가져올 레코드 수

  let sheetsProcessed = 0;
  let hasMoreSheets = true;

  while (hasMoreSheets && sheetsProcessed < MAX_URLS_PER_SITEMAP) {
    const { data: sheets, error } = await supabase
      .from('drum_sheets')
      .select('slug, updated_at')
      .eq('is_active', true)
      .not('slug', 'is', null)
      .range(sheetsProcessed, sheetsProcessed + BATCH_SIZE - 1);

    if (error || !sheets || sheets.length === 0) {
      hasMoreSheets = false;
      break;
    }

    sheets.forEach((sheet) => {
      urls.push({
        url: `${baseUrl}/drum-sheet/${sheet.slug}`,
        lastModified: sheet.updated_at ? new Date(sheet.updated_at) : undefined,
        changeFrequency: 'daily',
        priority: 0.8,
      });
    });

    sheetsProcessed += sheets.length;
    hasMoreSheets = sheets.length === BATCH_SIZE;
  }

  // 3. 카테고리 데이터 가져오기
  const { data: categories } = await supabase
    .from('categories')
    .select('slug')
    .not('slug', 'is', null);

  (categories || []).forEach((cat) => {
    urls.push({
      url: `${baseUrl}/categories?category=${cat.slug}`,
      changeFrequency: 'daily',
      priority: 0.7,
    });
  });

  // 4. 컬렉션 데이터 가져오기
  let collectionsProcessed = 0;
  let hasMoreCollections = true;

  while (
    hasMoreCollections &&
    collectionsProcessed < MAX_URLS_PER_SITEMAP - sheetsProcessed
  ) {
    const { data: collections, error } = await supabase
      .from('collections')
      .select('slug, updated_at')
      .eq('is_active', true)
      .not('slug', 'is', null)
      .range(collectionsProcessed, collectionsProcessed + BATCH_SIZE - 1);

    if (error || !collections || collections.length === 0) {
      hasMoreCollections = false;
      break;
    }

    collections.forEach((collection) => {
      urls.push({
        url: `${baseUrl}/collections/${collection.slug}`,
        lastModified: collection.updated_at ? new Date(collection.updated_at) : undefined,
        changeFrequency: 'weekly',
        priority: 0.7,
      });
    });

    collectionsProcessed += collections.length;
    hasMoreCollections = collections.length === BATCH_SIZE;
  }

  return urls;
}
