import { NextResponse } from 'next/server';

/**
 * Sitemap Index - /sitemap.xml
 * 17개 언어별 사이트맵 파일 목록을 제공합니다.
 * 
 * next.config.ts의 beforeFiles rewrite로 /sitemap.xml → /api/sitemap 매핑됨
 */

const SUPPORTED_LANG_PATHS = [
  'en', 'ko', 'ja', 'zh-cn', 'zh-tw',
  'de', 'fr', 'es', 'vi', 'th', 'hi',
  'id', 'pt', 'ru', 'it', 'tr', 'uk',
];

const BASE_DOMAIN = 'https://copydrum.com';

export async function GET() {
  const today = new Date().toISOString().split('T')[0];

  let sitemapEntries = '';
  for (const lang of SUPPORTED_LANG_PATHS) {
    sitemapEntries += `  <sitemap>\n`;
    sitemapEntries += `    <loc>${BASE_DOMAIN}/sitemap/${lang}.xml</loc>\n`;
    sitemapEntries += `    <lastmod>${today}</lastmod>\n`;
    sitemapEntries += `  </sitemap>\n`;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries}</sitemapindex>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
