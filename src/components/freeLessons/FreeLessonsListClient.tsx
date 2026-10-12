'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import MainHeader from '@/components/common/MainHeader';
import Footer from '@/components/common/Footer';
import { useSignupBonus } from '@/components/auth/SignupBonus';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { getLocalizedUrl } from '@/lib/localeUrl';
import {
  FREE_LESSON_CATEGORIES,
  FREE_LESSON_LEVELS,
  sortLessonsDefault,
  type FreeLessonCardData,
} from '@/lib/freeLessons';
import FreeLessonCard from './FreeLessonCard';
import { useCurrentUser, useFreeLessonDownload } from './useFreeLessonDownload';

type SortOption = 'latest' | 'popular';

interface FreeLessonsListClientProps {
  initialLessons: FreeLessonCardData[];
}

export default function FreeLessonsListClient({ initialLessons }: FreeLessonsListClientProps) {
  const { t, i18n } = useTranslation();
  const router = useLocaleRouter();
  const searchParams = useSearchParams();
  const bonus = useSignupBonus();
  const { user, ready } = useCurrentUser();
  const noop = useCallback(() => {}, []);
  const { downloadedIds } = useFreeLessonDownload(user, noop);

  const [category, setCategory] = useState<string>(() => searchParams?.get('category') ?? '');
  const [level, setLevel] = useState<string>(() => searchParams?.get('level') ?? '');
  const [searchTerm, setSearchTerm] = useState('');
  const [sort, setSort] = useState<SortOption>('latest');
  const [onlyMine, setOnlyMine] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (category) url.searchParams.set('category', category);
    else url.searchParams.delete('category');
    if (level) url.searchParams.set('level', level);
    else url.searchParams.delete('level');
    window.history.replaceState(window.history.state, '', url.toString());
  }, [category, level]);

  const lessons = useMemo(() => sortLessonsDefault(initialLessons), [initialLessons]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lesson of lessons) counts.set(lesson.category, (counts.get(lesson.category) ?? 0) + 1);
    return counts;
  }, [lessons]);

  const availableCategories = FREE_LESSON_CATEGORIES.filter((item) => categoryCounts.has(item.value));
  const totalDownloads = lessons.reduce((sum, lesson) => sum + (lesson.download_count || 0), 0);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase().replace(/\s+/g, '');
    let result = lessons.filter((lesson) => {
      if (category && lesson.category !== category) return false;
      if (level && lesson.level !== level) return false;
      if (onlyMine && !downloadedIds.has(lesson.id)) return false;
      if (!term) return true;
      const haystack = [lesson.title, lesson.title_en, lesson.summary, lesson.summary_en]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .replace(/\s+/g, '');
      return haystack.includes(term);
    });
    if (sort === 'popular') {
      result = [...result].sort((a, b) => b.download_count - a.download_count || b.view_count - a.view_count);
    }
    return result;
  }, [lessons, category, level, onlyMine, downloadedIds, searchTerm, sort]);

  const hasFilters = Boolean(category || level || searchTerm.trim() || onlyMine);
  const featured = hasFilters || sort !== 'latest' ? [] : lessons.filter((lesson) => lesson.is_featured).slice(0, 3);
  const featuredIds = new Set(featured.map((lesson) => lesson.id));
  const gridLessons = filtered.filter((lesson) => !featuredIds.has(lesson.id));

  const resetFilters = () => {
    setCategory('');
    setLevel('');
    setSearchTerm('');
    setOnlyMine(false);
    setSort('latest');
  };

  const goAuth = (target: 'register' | 'login') => {
    try {
      localStorage.setItem('auth_redirect_path', getLocalizedUrl('/free-lessons', i18n.language));
    } catch {
      // 무시
    }
    router.push(target === 'register' ? '/auth/register' : '/auth/login');
  };

  const steps = [
    { icon: 'ri-youtube-fill', label: t('freeLessons.hero.stepWatch') },
    { icon: 'ri-file-download-fill', label: t('freeLessons.hero.stepDownload') },
    { icon: 'ri-music-2-fill', label: t('freeLessons.hero.stepPractice') },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <MainHeader user={user} />

      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-900 to-blue-800 text-white">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-blue-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-violet-500/25 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1 text-xs font-bold tracking-widest text-blue-100">
            <i className="ri-gift-line" />
            {t('freeLessons.hero.badge')}
          </span>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">
            {t('freeLessons.hero.title')}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-blue-100 sm:text-base md:text-lg">
            {t('freeLessons.hero.subtitle')}
          </p>

          <ol className="mt-6 flex flex-wrap items-center gap-2 sm:gap-3">
            {steps.map((step, index) => (
              <li key={step.label} className="flex items-center gap-2 sm:gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold backdrop-blur-sm sm:text-sm">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-bold text-indigo-700">
                    {index + 1}
                  </span>
                  <i className={`${step.icon} text-base text-blue-200`} />
                  {step.label}
                </span>
                {index < steps.length - 1 && <i className="ri-arrow-right-s-line hidden text-blue-300 sm:inline" />}
              </li>
            ))}
          </ol>

          {lessons.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-4 text-xs text-blue-200 sm:text-sm">
              <span className="inline-flex items-center gap-1.5">
                <i className="ri-play-list-2-line" />
                {t('freeLessons.hero.lessonCount', { count: lessons.length })}
              </span>
              {totalDownloads > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <i className="ri-download-cloud-2-line" />
                  {t('freeLessons.hero.downloadCount', { count: totalDownloads })}
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {ready && !user && (
          <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                <i className="ri-vip-crown-2-line text-xl" />
              </span>
              <div>
                <p className="font-bold text-gray-900">{t('freeLessons.banner.guestTitle')}</p>
                <p className="mt-0.5 text-sm text-gray-600">{t('freeLessons.banner.guestDescription')}</p>
                {bonus.show && (
                  <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-amber-600">
                    <i className="ri-gift-2-fill" />
                    {bonus.headline}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <button
                type="button"
                onClick={() => goAuth('register')}
                className="flex-1 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 sm:flex-none"
              >
                {t('freeLessons.banner.signup')}
              </button>
              <button
                type="button"
                onClick={() => goAuth('login')}
                className="flex-1 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 sm:flex-none"
              >
                {t('freeLessons.banner.login')}
              </button>
            </div>
          </div>
        )}

        {lessons.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-20 text-center">
            <i className="ri-video-line text-5xl text-gray-300" />
            <p className="text-gray-500">{t('freeLessons.list.empty')}</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative w-full md:w-96">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder={t('freeLessons.filters.searchPlaceholder')}
                    className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-11 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={level}
                    onChange={(event) => setLevel(event.target.value)}
                    aria-label={t('freeLessons.filters.level')}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">{t('freeLessons.filters.allLevels')}</option>
                    {FREE_LESSON_LEVELS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {t(`freeLessons.levels.${item.value}`)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as SortOption)}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="latest">{t('freeLessons.filters.sortLatest')}</option>
                    <option value="popular">{t('freeLessons.filters.sortPopular')}</option>
                  </select>
                  {user && downloadedIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setOnlyMine((prev) => !prev)}
                      aria-pressed={onlyMine}
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                        onlyMine
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <i className={onlyMine ? 'ri-checkbox-circle-fill' : 'ri-checkbox-circle-line'} />
                      {t('freeLessons.filters.myDownloads')}
                    </button>
                  )}
                </div>
              </div>

              {availableCategories.length > 1 && (
                <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" style={{ scrollbarWidth: 'none' }}>
                  <div className="flex gap-2 pb-1">
                    <button
                      type="button"
                      onClick={() => setCategory('')}
                      className={`flex-shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                        category === '' ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {t('freeLessons.filters.all')} <span className="opacity-70">{lessons.length}</span>
                    </button>
                    {availableCategories.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setCategory(item.value)}
                        className={`inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                          category === item.value
                            ? 'bg-blue-600 text-white'
                            : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <i className={item.icon} />
                        {t(`freeLessons.categories.${item.value}`)}
                        <span className="opacity-70">{categoryCounts.get(item.value)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {featured.length > 0 && (
              <section className="mt-8">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900 sm:text-xl">
                  <i className="ri-star-smile-fill text-amber-400" />
                  {t('freeLessons.list.featuredTitle')}
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {featured.map((lesson) => (
                    <FreeLessonCard key={lesson.id} lesson={lesson} downloaded={downloadedIds.has(lesson.id)} />
                  ))}
                </div>
              </section>
            )}

            {(gridLessons.length > 0 || featured.length === 0) && (
            <section className="mt-8">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900 sm:text-xl">
                  {featured.length > 0 ? t('freeLessons.list.allTitle') : t('freeLessons.list.count', { count: filtered.length })}
                </h2>
                {hasFilters && (
                  <button type="button" onClick={resetFilters} className="text-sm text-gray-500 hover:text-gray-700">
                    <i className="ri-refresh-line mr-1" />
                    {t('freeLessons.filters.reset')}
                  </button>
                )}
              </div>

              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
                  <i className="ri-search-eye-line text-4xl text-gray-300" />
                  <p className="text-sm text-gray-500">{t('freeLessons.list.emptyFiltered')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {gridLessons.map((lesson) => (
                    <FreeLessonCard key={lesson.id} lesson={lesson} downloaded={downloadedIds.has(lesson.id)} />
                  ))}
                </div>
              )}
            </section>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
