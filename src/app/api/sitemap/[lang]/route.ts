import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 언어별 Sitemap - /sitemap/{lang}.xml
 * 각 언어에 해당하는 모든 URL을 포함합니다.
 * 
 * next.config.ts의 beforeFiles rewrite로 /sitemap/:path* → /api/sitemap/:path* 매핑됨
 */

// URL path → 유효한 언어 코드 매핑 (검증용)
const VALID_LANGS: Record<string, boolean> = {
  en: true, ko: true, ja: true,
  'zh-cn': true, 'zh-tw': true,
  de: true, fr: true, es: true,
  vi: true, th: true, hi: true,
  id: true, pt: true, ru: true,
  it: true, tr: true, uk: true,
};

const BASE_DOMAIN = 'https://copydrum.com';

// 정적 페이지 목록
const STATIC_PAGES = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/categories', priority: '0.9', changefreq: 'daily' },
  { path: '/collections', priority: '0.9', changefreq: 'weekly' },
  { path: '/free-sheets', priority: '0.7', changefreq: 'weekly' },
  { path: '/guide', priority: '0.6', changefreq: 'monthly' },
  { path: '/policy/refund', priority: '0.5', changefreq: 'monthly' },
  { path: '/company/about', priority: '0.5', changefreq: 'monthly' },
];

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(dateString: string | null): string {
  if (!dateString) return new Date().toISOString().split('T')[0];
  try {
    return new Date(dateString).toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseKey);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ lang: string }> }
) {
  const { lang: rawLang } = await params;

  // .xml 확장자 제거 (rewrite에서 넘어올 수 있음)
  const lang = rawLang.toLowerCase().replace(/\.xml$/i, '');

  // 유효한 언어인지 검증
  if (!VALID_LANGS[lang]) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const baseUrl = `${BASE_DOMAIN}/${lang}`;
  const supabase = getSupabaseClient();

  let urls = '';

  // ─── 1. 정적 페이지 ───
  for (const page of STATIC_PAGES) {
    const loc = page.path === '/'
      ? `${baseUrl}/`
      : `${baseUrl}${page.path}`;
    urls += `  <url>\n`;
    urls += `    <loc>${escapeXml(loc)}</loc>\n`;
    urls += `    <changefreq>${page.changefreq}</changefreq>\n`;
    urls += `    <priority>${page.priority}</priority>\n`;
    urls += `  </url>\n`;
  }

  if (supabase) {
    // ─── 2. 드럼 악보 (Drum Sheets) ───
    const BATCH_SIZE = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: sheets, error } = await supabase
        .from('drum_sheets')
        .select('slug, updated_at')
        .eq('is_active', true)
        .not('slug', 'is', null)
        .order('created_at', { ascending: true })
        .range(offset, offset + BATCH_SIZE - 1);

      if (error || !sheets || sheets.length === 0) {
        hasMore = false;
        break;
      }

      for (const sheet of sheets) {
        urls += `  <url>\n`;
        urls += `    <loc>${escapeXml(baseUrl)}/drum-sheet/${escapeXml(sheet.slug)}</loc>\n`;
        urls += `    <lastmod>${formatDate(sheet.updated_at)}</lastmod>\n`;
        urls += `    <changefreq>daily</changefreq>\n`;
        urls += `    <priority>0.8</priority>\n`;
        urls += `  </url>\n`;
      }

      offset += sheets.length;
      hasMore = sheets.length === BATCH_SIZE;
    }

    // ─── 3. 카테고리 (Categories) ───
    const { data: categories } = await supabase
      .from('categories')
      .select('slug')
      .not('slug', 'is', null);

    for (const cat of categories || []) {
      urls += `  <url>\n`;
      urls += `    <loc>${escapeXml(baseUrl)}/categories?category=${escapeXml(cat.slug)}</loc>\n`;
      urls += `    <changefreq>daily</changefreq>\n`;
      urls += `    <priority>0.7</priority>\n`;
      urls += `  </url>\n`;
    }

    // ─── 4. 컬렉션 (Collections) ───
    offset = 0;
    hasMore = true;

    while (hasMore) {
      const { data: collections, error } = await supabase
        .from('collections')
        .select('slug, updated_at')
        .eq('is_active', true)
        .not('slug', 'is', null)
        .order('created_at', { ascending: true })
        .range(offset, offset + BATCH_SIZE - 1);

      if (error || !collections || collections.length === 0) {
        hasMore = false;
        break;
      }

      for (const col of collections) {
        urls += `  <url>\n`;
        urls += `    <loc>${escapeXml(baseUrl)}/collections/${escapeXml(col.slug)}</loc>\n`;
        urls += `    <lastmod>${formatDate(col.updated_at)}</lastmod>\n`;
        urls += `    <changefreq>weekly</changefreq>\n`;
        urls += `    <priority>0.7</priority>\n`;
        urls += `  </url>\n`;
      }

      offset += collections.length;
      hasMore = collections.length === BATCH_SIZE;
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
