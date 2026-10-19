'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { getLocalizedUrl } from '@/lib/localeUrl';
import {
  categoryIcon,
  isNewLesson,
  lessonThumbnail,
  levelBadgeClass,
  localizedLessonText,
  youtubeThumbnailUrl,
  type FreeLessonCardData,
} from '@/lib/freeLessons';

interface FreeLessonCardProps {
  lesson: FreeLessonCardData;
  downloaded?: boolean;
  /** 가로 스크롤 목록에서 쓰는 좁은 카드 */
  compact?: boolean;
}

export default function FreeLessonCard({ lesson, downloaded = false, compact = false }: FreeLessonCardProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const title = localizedLessonText(lesson.title, lesson.title_en, locale);
  const summary = localizedLessonText(lesson.summary, lesson.summary_en, locale);
  const href = getLocalizedUrl(`/free-lessons/${encodeURIComponent(lesson.slug)}`, locale);

  return (
    <Link
      href={href}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-gray-900">
        <img
          src={lessonThumbnail(lesson)}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(event) => {
            const img = event.currentTarget;
            const fallback = youtubeThumbnailUrl(lesson.youtube_video_id);
            if (img.src !== fallback) img.src = fallback;
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-600/90 text-white shadow-lg transition-transform group-hover:scale-110">
          <i className="ri-play-fill text-2xl" />
        </span>

        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
          {lesson.is_featured && (
            <span className="rounded-md bg-amber-400 px-1.5 py-0.5 text-[11px] font-bold text-amber-950 shadow-sm">
              {t('freeLessons.card.featured')}
            </span>
          )}
          {isNewLesson(lesson) && (
            <span className="rounded-md bg-blue-600 px-1.5 py-0.5 text-[11px] font-bold text-white shadow-sm">
              {t('freeLessons.card.new')}
            </span>
          )}
        </div>

        {downloaded && (
          <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-md bg-emerald-500 px-1.5 py-0.5 text-[11px] font-bold text-white shadow-sm">
            <i className="ri-check-line" />
            {t('freeLessons.card.downloaded')}
          </span>
        )}

        <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-md bg-white/95 px-1.5 py-0.5 text-[11px] font-bold text-red-600 shadow-sm">
          <i className="ri-file-pdf-2-line" />
          {t('freeLessons.card.pdf')}
          {lesson.pdf_page_count ? ` · ${t('freeLessons.card.pages', { count: lesson.pdf_page_count })}` : ''}
        </span>
      </div>

      <div className={`flex flex-1 flex-col ${compact ? 'gap-1.5 p-3' : 'gap-2 p-3.5 sm:p-4'}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${levelBadgeClass(lesson.level)}`}>
            {t(`freeLessons.levels.${lesson.level}`)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
            <i className={categoryIcon(lesson.category)} />
            {t(`freeLessons.categories.${lesson.category}`, { defaultValue: lesson.category })}
          </span>
        </div>
        <h3
          className={`font-bold leading-snug text-gray-900 transition-colors group-hover:text-blue-600 ${
            compact ? 'line-clamp-2 text-sm' : 'line-clamp-2 text-[15px]'
          }`}
        >
          {title}
        </h3>
        {!compact && summary && <p className="line-clamp-2 text-xs leading-relaxed text-gray-500">{summary}</p>}
        <div className="mt-auto flex items-center gap-3 pt-1 text-[11px] text-gray-400">
          {lesson.download_count > 0 && (
            <span className="inline-flex items-center gap-1">
              <i className="ri-download-2-line" />
              {t('freeLessons.card.downloads', { count: lesson.download_count })}
            </span>
          )}
          {lesson.bpm && (
            <span className="inline-flex items-center gap-1">
              <i className="ri-timer-flash-line" />
              {lesson.bpm} BPM
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
