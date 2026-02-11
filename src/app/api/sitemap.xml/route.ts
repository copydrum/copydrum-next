import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Language to path mapping for new URL structure
const languagePathMap: Record<string, string> = {
  en: '',           // English is root (no prefix)
  ko: '/ko',
  ja: '/ja',
  de: '/de',
  fr: '/fr',
  es: '/es',
  'zh-CN': '/zh-cn',
  'zh-TW': '/zh-tw',
  vi: '/vi',
  id: '/id',
  th: '/th',
  pt: '/pt',
  ru: '/ru',
  it: '/it',
  tr: '/tr',
  uk: '/uk',
  hi: '/hi',
};

function getLocaleFromPath(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return 'en';

  const firstSegment = segments[0].toLowerCase();
  const pathToLocale: Record<string, string> = {
    'ko': 'ko', 'ja': 'ja', 'de': 'de', 'es': 'es', 'fr': 'fr',
    'hi': 'hi', 'id': 'id', 'it': 'it', 'pt': 'pt', 'ru': 'ru',
    'th': 'th', 'tr': 'tr', 'uk': 'uk', 'vi': 'vi',
    'zh-cn': 'zh-CN', 'zh-tw': 'zh-TW',
  };

  return pathToLocale[firstSegment] || 'en';
}

function escapeXml(unsafe: string): string {
  return unsafe
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

export async function GET(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const locale = getLocaleFromPath(pathname);
  const localePath = languagePathMap[locale] || '';
  const baseUrl = `https://copydrum.com${localePath}`;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${escapeXml(baseUrl)}/</loc><priority>1.0</priority></url>
</urlset>`;
    return new NextResponse(fallback, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const [{ data: sheets }, { data: categories }] = await Promise.all([
    supabase.from('drum_sheets').select('id, updated_at, slug').eq('is_active', true).not('slug', 'is', null),
    supabase.from('categories').select('id, name, slug').not('slug', 'is', null),
  ]);

  let urls = '';

  // Homepage
  urls += `<url><loc>${escapeXml(baseUrl)}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n`;

  // Categories page
  urls += `<url><loc>${escapeXml(baseUrl)}/categories</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n`;

  // Category filter pages (use slug if available, fallback to id)
  (categories || []).forEach((cat: any) => {
    const categoryParam = cat.slug || cat.id;
    urls += `<url><loc>${escapeXml(baseUrl)}/categories?category=${escapeXml(categoryParam)}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n`;
  });

  // Product detail pages
  (sheets || []).forEach((sheet) => {
    urls += `<url><loc>${escapeXml(baseUrl)}/drum-sheet/${escapeXml(sheet.slug)}</loc><lastmod>${formatDate(sheet.updated_at)}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>\n`;
  });

  // Static pages
  urls += `<url><loc>${escapeXml(baseUrl)}/policy/refund</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>\n`;
  urls += `<url><loc>${escapeXml(baseUrl)}/company/about</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>\n`;

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}</urlset>`;

  return new NextResponse(sitemapXml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
