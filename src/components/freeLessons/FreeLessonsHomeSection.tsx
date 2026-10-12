'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { FREE_LESSON_CARD_COLUMNS, sortLessonsDefault, type FreeLessonCardData } from '@/lib/freeLessons';
import FreeLessonCard from './FreeLessonCard';

/** 메인 페이지 무료 레슨 섹션. 공개된 레슨이 없으면 아무것도 그리지 않는다. */
export default function FreeLessonsHomeSection() {
  const { t } = useTranslation();
  const router = useLocaleRouter();
  const [lessons, setLessons] = useState<FreeLessonCardData[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('free_lessons')
      .select(FREE_LESSON_CARD_COLUMNS)
      .eq('is_published', true)
      .order('published_at', { ascending: false })
      .limit(40)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setLessons(sortLessonsDefault(data as FreeLessonCardData[]).slice(0, 8));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (lessons.length === 0) return null;

  return (
    <section className="py-8 md:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex items-center justify-between md:mb-8">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h3 className="text-2xl font-bold text-gray-900 md:text-3xl">{t('freeLessons.home.title')}</h3>
              <span className="rounded-full bg-gradient-to-r from-red-500 to-rose-500 px-2 py-0.5 text-[10px] font-bold text-white md:text-xs">
                {t('freeLessons.home.badge')}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500 md:text-base">{t('freeLessons.home.description')}</p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/free-lessons')}
            className="hidden items-center gap-1 whitespace-nowrap text-sm text-gray-500 hover:text-gray-700 md:inline-flex"
          >
            {t('freeLessons.home.viewAll')} &gt;
          </button>
        </div>

        <div className="md:hidden">
          <div
            className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {lessons.map((lesson) => (
              <div key={lesson.id} className="w-[72%] flex-shrink-0 snap-start">
                <FreeLessonCard lesson={lesson} compact />
              </div>
            ))}
          </div>
          <div className="mt-2 text-center">
            <button
              type="button"
              onClick={() => router.push('/free-lessons')}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm"
            >
              <i className="ri-play-list-2-line" />
              {t('freeLessons.home.viewAll')}
            </button>
          </div>
        </div>

        <div className="hidden grid-cols-4 gap-5 md:grid">
          {lessons.slice(0, 8).map((lesson) => (
            <FreeLessonCard key={lesson.id} lesson={lesson} compact />
          ))}
        </div>
      </div>
    </section>
  );
}
