import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense, cache } from 'react';
import FreeLessonDetailClient from '@/components/freeLessons/FreeLessonDetailClient';
import { createPublicServerClient } from '@/lib/supabase/publicServer';
import { BASE_URL, buildLanguageAlternates, canonicalFor, localeFromPathSegment, localeToPath } from '@/lib/seo/hreflang';
import {
  FREE_LESSON_CARD_COLUMNS,
  FREE_LESSON_PUBLIC_COLUMNS,
  lessonThumbnail,
  localizedLessonText,
  sortLessonsDefault,
  type FreeLessonCardData,
  type FreeLessonDetailData,
  type FreeLessonRelatedSheet,
} from '@/lib/freeLessons';
import koFreeLessons from '@/i18n/locales/ko/freeLessons.json';
import enFreeLessons from '@/i18n/locales/en/freeLessons.json';

export const revalidate = 60;

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
}

type LessonRow = Omit<FreeLessonDetailData, 'has_pdf'> & { has_pdf: string | null };

const getLesson = cache(async (slug: string): Promise<FreeLessonDetailData | null> => {
  try {
    const supabase = createPublicServerClient();
    const { data, error } = await supabase
      .from('free_lessons')
      .select(FREE_LESSON_PUBLIC_COLUMNS)
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as unknown as LessonRow;
    return { ...row, has_pdf: Boolean(row.has_pdf) };
  } catch {
    return null;
  }
});

async function getRelatedLessons(lesson: FreeLessonDetailData): Promise<FreeLessonCardData[]> {
  try {
    const supabase = createPublicServerClient();
    const { data } = await supabase
      .from('free_lessons')
      .select(FREE_LESSON_CARD_COLUMNS)
      .eq('is_published', true)
      .neq('id', lesson.id)
      .limit(200);
    const others = sortLessonsDefault((data ?? []) as FreeLessonCardData[]);
    const sameCategory = others.filter((item) => item.category === lesson.category);
    const rest = others.filter((item) => item.category !== lesson.category);
    return [...sameCategory, ...rest].slice(0, 4);
  } catch {
    return [];
  }
}

async function getRelatedSheets(ids: string[] | null): Promise<FreeLessonRelatedSheet[]> {
  if (!ids || ids.length === 0) return [];
  try {
    const supabase = createPublicServerClient();
    const { data } = await supabase
      .from('drum_sheets')
      .select('id, title, artist, slug, thumbnail_url, price')
      .in('id', ids)
      .eq('is_active', true);
    const rows = (data ?? []) as FreeLessonRelatedSheet[];
    return ids.map((id) => rows.find((row) => row.id === id)).filter((row): row is FreeLessonRelatedSheet => Boolean(row));
  } catch {
    return [];
  }
}

function stripHtml(html: string | null | undefined): string {
  return (html ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: localePath, slug } = await params;
  const locale = localeFromPathSegment(localePath);
  const lesson = await getLesson(decodeURIComponent(slug));
  if (!lesson) return { title: 'Not Found' };

  const strings = locale === 'ko' ? koFreeLessons : enFreeLessons;
  const title = localizedLessonText(lesson.title, lesson.title_en, locale);
  const pageTitle = `${title} | ${strings.hero.title} - COPYDRUM`;
  const description =
    localizedLessonText(lesson.summary, lesson.summary_en, locale) ||
    stripHtml(localizedLessonText(lesson.description, lesson.description_en, locale)).slice(0, 150) ||
    strings.seo.description;
  const relativePath = `/free-lessons/${lesson.slug}`;
  const canonical = canonicalFor(locale, relativePath);
  const image = lessonThumbnail(lesson);

  return {
    title: { absolute: pageTitle },
    description,
    alternates: { canonical, languages: buildLanguageAlternates(relativePath) },
    openGraph: {
      title: pageTitle,
      description,
      url: canonical,
      siteName: 'COPYDRUM',
      type: 'video.other',
      images: [{ url: image, width: 1280, height: 720, alt: title }],
    },
    twitter: { card: 'summary_large_image', title: pageTitle, description, images: [image] },
  };
}

export default async function FreeLessonDetailPage({ params }: PageProps) {
  const { locale: localePath, slug } = await params;
  const locale = localeFromPathSegment(localePath);
  const lesson = await getLesson(decodeURIComponent(slug));
  if (!lesson) notFound();

  const [relatedLessons, relatedSheets] = await Promise.all([
    getRelatedLessons(lesson),
    getRelatedSheets(lesson.related_sheet_ids),
  ]);

  const strings = locale === 'ko' ? koFreeLessons : enFreeLessons;
  const pathSegment = localeToPath[locale] || 'en';
  const title = localizedLessonText(lesson.title, lesson.title_en, locale);
  const pageUrl = `${BASE_URL}/${pathSegment}/free-lessons/${encodeURIComponent(lesson.slug)}`;
  const description =
    localizedLessonText(lesson.summary, lesson.summary_en, locale) ||
    stripHtml(localizedLessonText(lesson.description, lesson.description_en, locale)).slice(0, 300) ||
    strings.seo.description;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'VideoObject',
        name: title,
        description,
        thumbnailUrl: [lessonThumbnail(lesson)],
        uploadDate: lesson.published_at || lesson.created_at,
        embedUrl: `https://www.youtube.com/embed/${lesson.youtube_video_id}`,
        contentUrl: `https://www.youtube.com/watch?v=${lesson.youtube_video_id}`,
        publisher: { '@type': 'Organization', name: 'COPYDRUM', url: BASE_URL },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'COPYDRUM', item: `${BASE_URL}/${pathSegment}` },
          { '@type': 'ListItem', position: 2, name: strings.hero.title, item: `${BASE_URL}/${pathSegment}/free-lessons` },
          { '@type': 'ListItem', position: 3, name: title, item: pageUrl },
        ],
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <Suspense fallback={null}>
        <FreeLessonDetailClient lesson={lesson} relatedLessons={relatedLessons} relatedSheets={relatedSheets} />
      </Suspense>
    </>
  );
}
