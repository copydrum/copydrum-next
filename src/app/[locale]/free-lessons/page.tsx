import type { Metadata } from 'next';
import { Suspense } from 'react';
import FreeLessonsListClient from '@/components/freeLessons/FreeLessonsListClient';
import { createPublicServerClient } from '@/lib/supabase/publicServer';
import {
  BASE_URL,
  buildLanguageAlternates,
  canonicalFor,
  localeFromPathSegment,
  localeToPath,
} from '@/lib/seo/hreflang';
import { FREE_LESSON_CARD_COLUMNS, localizedLessonText, type FreeLessonCardData } from '@/lib/freeLessons';
import koFreeLessons from '@/i18n/locales/ko/freeLessons.json';
import enFreeLessons from '@/i18n/locales/en/freeLessons.json';

export const revalidate = 60;

interface PageProps {
  params: Promise<{ locale: string }>;
}

async function getPublishedLessons(): Promise<FreeLessonCardData[]> {
  try {
    const supabase = createPublicServerClient();
    const { data, error } = await supabase
      .from('free_lessons')
      .select(FREE_LESSON_CARD_COLUMNS)
      .eq('is_published', true)
      .limit(500);
    if (error) {
      console.error('[free-lessons] 목록 조회 실패:', error.message);
      return [];
    }
    return (data ?? []) as FreeLessonCardData[];
  } catch (error) {
    console.error('[free-lessons] 목록 조회 예외:', error);
    return [];
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: localePath } = await params;
  const locale = localeFromPathSegment(localePath);
  const seo = (locale === 'ko' ? koFreeLessons : enFreeLessons).seo;
  const canonical = canonicalFor(locale, '/free-lessons');

  return {
    title: { absolute: seo.title },
    description: seo.description,
    alternates: { canonical, languages: buildLanguageAlternates('/free-lessons') },
    openGraph: { title: seo.title, description: seo.description, url: canonical, siteName: 'COPYDRUM', type: 'website' },
    twitter: { card: 'summary_large_image', title: seo.title, description: seo.description },
  };
}

export default async function FreeLessonsPage({ params }: PageProps) {
  const { locale: localePath } = await params;
  const locale = localeFromPathSegment(localePath);
  const pathSegment = localeToPath[locale] || 'en';
  const lessons = await getPublishedLessons();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: (locale === 'ko' ? koFreeLessons : enFreeLessons).hero.title,
    itemListElement: lessons.slice(0, 50).map((lesson, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${BASE_URL}/${pathSegment}/free-lessons/${encodeURIComponent(lesson.slug)}`,
      name: localizedLessonText(lesson.title, lesson.title_en, locale),
    })),
  };

  return (
    <>
      {lessons.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      )}
      <Suspense fallback={null}>
        <FreeLessonsListClient initialLessons={lessons} />
      </Suspense>
    </>
  );
}
