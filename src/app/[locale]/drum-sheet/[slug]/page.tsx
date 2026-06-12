import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { cache } from 'react';
import SheetDetailClient from './SheetDetailClient';
import type { Metadata } from 'next';
import { languages } from '@/i18n/languages';
import { getServerDetailSeo } from '@/lib/seo/serverSeo';
import { getSiteCurrency, convertFromKrw } from '@/lib/currency';
import { buildDigitalOfferMerchantExtras } from '@/lib/seo/productOfferSchema';

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

const getReviewStats = cache(async (sheetId: string) => {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('drum_sheet_review_stats')
      .select('review_count, avg_rating')
      .eq('sheet_id', sheetId)
      .maybeSingle();
    return {
      reviewCount: Number(data?.review_count) || 0,
      avgRating: data?.avg_rating ? Number(data.avg_rating) : 0,
    };
  } catch {
    return { reviewCount: 0, avgRating: 0 };
  }
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

  const sheetRow = sheet as {
    title: string;
    artist: string;
    categories?: { name?: string } | null;
    title_translations?: Record<string, string> | null;
    difficulty?: string;
    tempo?: number;
    page_count?: number;
  };
  const isDrumLessonBook = sheetRow.categories?.name === '드럼레슨';
  // 드럼레슨 교재는 비한국어 locale 에서 영어 제목을 우선 사용 (곡명은 원제 유지)
  const metaTitle =
    isDrumLessonBook && locale !== 'ko'
      ? (sheetRow.title_translations?.en?.trim() || sheetRow.title)
      : sheetRow.title;

  // locale 별 번역된 SEO 문자열 생성 (seo.json 기반)
  const seoStrings = getServerDetailSeo(locale, {
    title: metaTitle,
    artist: sheetRow.artist,
    difficulty: sheetRow.difficulty,
    tempo: sheetRow.tempo,
    page_count: sheetRow.page_count,
    categories: sheetRow.categories?.name ? { name: sheetRow.categories.name } : null,
  });

  // Use canonical slug (not UUID)
  const canonicalSlug = sheet.slug || slug;

  // Build canonical URL for current locale
  const currentLocalePath = localeToPath[locale] || 'en';
  const canonical = `${BASE_URL}/${currentLocalePath}/drum-sheet/${canonicalSlug}`;

  // Build alternate language URLs (hreflang 키는 BCP-47 표준: zh-Hans/zh-Hant 등)
  const languageAlternates: Record<string, string> = {};
  languages.forEach((lang) => {
    const langPath = localeToPath[lang.code] || lang.code.toLowerCase();
    languageAlternates[lang.hreflang] = `${BASE_URL}/${langPath}/drum-sheet/${canonicalSlug}`;
  });
  // x-default → 영어
  languageAlternates['x-default'] = `${BASE_URL}/en/drum-sheet/${canonicalSlug}`;

  const ogImage = sheet.preview_image_url || sheet.thumbnail_url;

  return {
    title: seoStrings.title,
    description: seoStrings.description,
    keywords: seoStrings.keywords,
    alternates: {
      canonical,
      languages: languageAlternates,
    },
    openGraph: {
      title: seoStrings.title,
      description: seoStrings.description,
      url: canonical,
      siteName: 'COPYDRUM',
      type: 'website',
      images: ogImage
        ? [
            {
              url: ogImage,
              width: 1200,
              height: 630,
              alt: `${metaTitle} - ${sheetRow.artist} drum sheet music`,
            },
          ]
        : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: seoStrings.title,
      description: seoStrings.description,
      images: ogImage ? [ogImage] : undefined,
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

  // 현재 locale (미들웨어가 설정한 x-locale 헤더)
  const headersList = await headers();
  const locale = headersList.get('x-locale') || 'en';
  const localePath = localeToPath[locale] || 'en';

  // UUID 기반 URL → slug 기반 URL 로 리다이렉트 (locale prefix 보존)
  if (isUUIDParam && sheet.slug) {
    redirect(`/${localePath}/drum-sheet/${sheet.slug}`);
  }

  // ─── JSON-LD 구조화 데이터 (Product + BreadcrumbList) ───
  const canonicalSlug = sheet.slug || decodedSlug;
  const pageUrl = `${BASE_URL}/${localePath}/drum-sheet/${canonicalSlug}`;
  const productImage = sheet.preview_image_url || sheet.thumbnail_url || undefined;
  const isPreorder = sheet.sales_type === 'PREORDER';
  const price = Math.max(0, Math.round(Number(sheet.price) || 0));

  // JSON-LD 가격은 해당 로케일의 실제 표시 통화/금액과 일치시켜야 한다 (KRW 하드코딩 금지)
  const offerCurrency = getSiteCurrency(undefined, locale);
  const offerPrice =
    offerCurrency === 'KRW'
      ? price
      : Number(convertFromKrw(price, offerCurrency, locale).toFixed(2));

  // 리뷰 통계 (있을 때만 aggregateRating 노출 → 리치 결과 자격)
  const reviewStats = await getReviewStats(sheet.id);

  const refundPolicyUrl = `${BASE_URL}/${localePath}/policy/refund`;
  const merchantOfferExtras = buildDigitalOfferMerchantExtras(
    offerCurrency,
    locale,
    refundPolicyUrl,
  );

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        name: `${sheet.title} - ${sheet.artist} Drum Sheet Music`,
        ...(productImage ? { image: [productImage] } : {}),
        description: `Drum sheet music (PDF) for ${sheet.title} by ${sheet.artist}.`,
        category: sheet.categories?.name || 'Drum Sheet Music',
        brand: { '@type': 'Brand', name: 'COPYDRUM' },
        ...(reviewStats.reviewCount > 0
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: reviewStats.avgRating,
                reviewCount: reviewStats.reviewCount,
                bestRating: 5,
                worstRating: 1,
              },
            }
          : {}),
        offers: {
          '@type': 'Offer',
          url: pageUrl,
          priceCurrency: offerCurrency,
          price: offerPrice,
          itemCondition: 'https://schema.org/NewCondition',
          availability: isPreorder
            ? 'https://schema.org/PreOrder'
            : 'https://schema.org/InStock',
          seller: { '@type': 'Organization', name: 'COPYDRUM' },
          ...merchantOfferExtras,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'COPYDRUM',
            item: `${BASE_URL}/${localePath}`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: sheet.categories?.name || 'Drum Sheet Music',
            item: `${BASE_URL}/${localePath}/categories`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: `${sheet.title} - ${sheet.artist}`,
            item: pageUrl,
          },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SheetDetailClient sheet={sheet} />
    </>
  );
}