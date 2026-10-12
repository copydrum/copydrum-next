'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import MainHeader from '@/components/common/MainHeader';
import Footer from '@/components/common/Footer';
import { useSignupBonus } from '@/components/auth/SignupBonus';
import { supabase } from '@/lib/supabase';
import { getLocalizedUrl } from '@/lib/localeUrl';
import { sanitizeLessonDetailHtml } from '@/lib/sanitizeLessonDetailHtml';
import { generateDefaultThumbnail } from '@/lib/defaultThumbnail';
import { getSiteCurrency, convertFromKrw, formatCurrency } from '@/lib/currency';
import {
  FREE_LESSON_AUTO_DOWNLOAD_PARAM,
  categoryIcon,
  lessonThumbnail,
  levelBadgeClass,
  localizedLessonText,
  youtubeThumbnailUrl,
  type FreeLessonCardData,
  type FreeLessonDetailData,
  type FreeLessonRelatedSheet,
} from '@/lib/freeLessons';
import FreeLessonCard from './FreeLessonCard';
import SignupGateModal from './SignupGateModal';
import { useCurrentUser, useFreeLessonDownload } from './useFreeLessonDownload';

interface FreeLessonDetailClientProps {
  lesson: FreeLessonDetailData;
  relatedLessons: FreeLessonCardData[];
  relatedSheets: FreeLessonRelatedSheet[];
}

function LessonDescription({ raw }: { raw: string }) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    return (
      <div
        className="prose prose-sm max-w-none text-gray-800 sm:prose-base [&_iframe]:aspect-video [&_iframe]:h-auto [&_iframe]:w-full [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg"
        dangerouslySetInnerHTML={{ __html: sanitizeLessonDetailHtml(trimmed) }}
      />
    );
  }
  return <p className="whitespace-pre-wrap break-words text-sm leading-7 text-gray-800 sm:text-[15px]">{trimmed}</p>;
}

function LessonVideo({ videoId, title, poster }: { videoId: string; title: string; poster: string }) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
        title={title}
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="group relative h-full w-full"
      aria-label={title}
    >
      <img
        src={poster}
        alt={title}
        className="h-full w-full object-cover"
        onError={(event) => {
          const img = event.currentTarget;
          const fallback = youtubeThumbnailUrl(videoId);
          if (img.src !== fallback) img.src = fallback;
        }}
      />
      <span className="absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/10" />
      <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-600 text-white shadow-2xl transition-transform group-hover:scale-110 sm:h-20 sm:w-20">
        <i className="ri-play-fill text-4xl sm:text-5xl" />
      </span>
    </button>
  );
}

export default function FreeLessonDetailClient({ lesson, relatedLessons, relatedSheets }: FreeLessonDetailClientProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const searchParams = useSearchParams();
  const bonus = useSignupBonus();
  const { user, ready } = useCurrentUser();
  const [gateOpen, setGateOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const openGate = useCallback(() => setGateOpen(true), []);
  const { download, downloadingId, downloadedIds } = useFreeLessonDownload(user, openGate);
  const autoDownloadDoneRef = useRef(false);

  const title = localizedLessonText(lesson.title, lesson.title_en, locale);
  const summary = localizedLessonText(lesson.summary, lesson.summary_en, locale);
  const description = localizedLessonText(lesson.description, lesson.description_en, locale);
  const isDownloading = downloadingId === lesson.id;
  const isDownloaded = downloadedIds.has(lesson.id);
  const returnPath = `/free-lessons/${encodeURIComponent(lesson.slug)}?${FREE_LESSON_AUTO_DOWNLOAD_PARAM}=1`;

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }, []);

  const handleDownload = useCallback(async () => {
    const ok = await download(lesson.id);
    if (ok) showToast(t('freeLessons.detail.downloadStarted'));
  }, [download, lesson.id, showToast, t]);

  useEffect(() => {
    const key = `free_lesson_viewed_${lesson.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // sessionStorage 를 못 쓰면 매번 집계
    }
    void supabase.rpc('free_lesson_increment_view', { p_lesson_id: lesson.id });
  }, [lesson.id]);

  // 로그인 후 돌아오면 ?download=1 로 자동 다운로드
  useEffect(() => {
    if (!ready || autoDownloadDoneRef.current) return;
    if (searchParams?.get(FREE_LESSON_AUTO_DOWNLOAD_PARAM) !== '1') return;
    autoDownloadDoneRef.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete(FREE_LESSON_AUTO_DOWNLOAD_PARAM);
    window.history.replaceState(window.history.state, '', url.toString());
    if (user && lesson.has_pdf) window.setTimeout(() => void handleDownload(), 0);
  }, [ready, user, searchParams, lesson.has_pdf, handleDownload]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href.split('?')[0]);
      showToast(t('freeLessons.detail.linkCopied'));
    } catch {
      // 복사 실패는 무시
    }
  };

  const formatSheetPrice = (price: number | null) => {
    const krw = Math.max(0, price ?? 0);
    const currency = getSiteCurrency(undefined, locale);
    return formatCurrency(convertFromKrw(krw, currency, locale), currency);
  };

  const meta = [
    { icon: 'ri-bar-chart-2-line', label: t('freeLessons.detail.level'), value: t(`freeLessons.levels.${lesson.level}`) },
    {
      icon: categoryIcon(lesson.category),
      label: t('freeLessons.detail.category'),
      value: t(`freeLessons.categories.${lesson.category}`, { defaultValue: lesson.category }),
    },
    ...(lesson.bpm ? [{ icon: 'ri-timer-flash-line', label: t('freeLessons.detail.bpm'), value: `${lesson.bpm} BPM` }] : []),
    ...(lesson.download_count > 0
      ? [{
          icon: 'ri-download-2-line',
          label: t('freeLessons.detail.downloads'),
          value: t('freeLessons.detail.downloadsValue', { count: lesson.download_count }),
        }]
      : []),
  ];

  const downloadCard = (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
          <i className="ri-file-pdf-2-fill text-2xl" />
        </span>
        <div className="min-w-0">
          <p className="font-bold text-gray-900">
            {lesson.pdf_page_count ? t('freeLessons.detail.pdfPages', { count: lesson.pdf_page_count }) : 'PDF'}
          </p>
          <p className="text-xs font-semibold text-emerald-600">{t('freeLessons.detail.memberOnly')}</p>
        </div>
      </div>

      {lesson.has_pdf ? (
        <button
          type="button"
          onClick={handleDownload}
          disabled={isDownloading}
          className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base font-bold text-white shadow-sm transition-colors disabled:opacity-70 ${
            isDownloaded ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isDownloading ? <Loader2 className="h-5 w-5 animate-spin" /> : <i className="ri-download-2-line text-lg" />}
          {isDownloading
            ? t('freeLessons.detail.downloading')
            : !ready || user
              ? isDownloaded
                ? t('freeLessons.detail.downloadAgain')
                : t('freeLessons.detail.downloadPdf')
              : t('freeLessons.detail.loginToDownload')}
        </button>
      ) : (
        <div className="mt-4 rounded-xl bg-gray-100 py-3.5 text-center text-sm font-semibold text-gray-500">
          {t('freeLessons.detail.noPdf')}
        </div>
      )}

      {ready && !user && bonus.show && (
        <p className="mt-3 flex items-center justify-center gap-1 text-xs font-semibold text-amber-600">
          <i className="ri-gift-2-fill" />
          {bonus.short}
        </p>
      )}

      <div className="mt-4 flex gap-2 border-t border-gray-100 pt-4">
        <a
          href={lesson.youtube_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          <i className="ri-youtube-fill text-base text-red-600" />
          {t('freeLessons.detail.watchOnYoutube')}
        </a>
        <button
          type="button"
          onClick={copyLink}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          <i className="ri-link text-base" />
          {t('freeLessons.detail.share')}
        </button>
      </div>
    </div>
  );

  const practiceSteps = [
    t('freeLessons.detail.practiceStep1'),
    t('freeLessons.detail.practiceStep2'),
    t('freeLessons.detail.practiceStep3'),
    t('freeLessons.detail.practiceStep4'),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <MainHeader user={user} />

      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <Link
          href={getLocalizedUrl('/free-lessons', locale)}
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-800"
        >
          <i className="ri-arrow-left-s-line text-lg" />
          {t('freeLessons.detail.back')}
        </Link>

        <div className="mt-3 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
          <div className="min-w-0 space-y-6">
            <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-lg">
              <LessonVideo videoId={lesson.youtube_video_id} title={title} poster={lessonThumbnail(lesson)} />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${levelBadgeClass(lesson.level)}`}>
                  {t(`freeLessons.levels.${lesson.level}`)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                  <i className={categoryIcon(lesson.category)} />
                  {t(`freeLessons.categories.${lesson.category}`, { defaultValue: lesson.category })}
                </span>
              </div>
              <h1 className="mt-2 text-2xl font-extrabold leading-snug text-gray-900 sm:text-3xl">{title}</h1>
              {summary && <p className="mt-2 text-sm leading-relaxed text-gray-600 sm:text-base">{summary}</p>}
            </div>

            <div className="lg:hidden">{downloadCard}</div>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {meta.map((item) => (
                <div key={item.label} className="rounded-xl border border-gray-100 bg-white px-4 py-3">
                  <dt className="flex items-center gap-1 text-xs text-gray-500">
                    <i className={item.icon} />
                    {item.label}
                  </dt>
                  <dd className="mt-0.5 text-sm font-bold text-gray-900">{item.value}</dd>
                </div>
              ))}
            </dl>

            {description && (
              <section className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
                <h2 className="mb-3 text-lg font-bold text-gray-900">{t('freeLessons.detail.aboutLesson')}</h2>
                <LessonDescription raw={description} />
              </section>
            )}

            {lesson.pdf_preview_url && (
              <section className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
                <h2 className="mb-3 text-lg font-bold text-gray-900">{t('freeLessons.detail.pdfPreview')}</h2>
                <div className="relative mx-auto max-w-xl overflow-hidden rounded-xl border border-gray-200">
                  <img src={lesson.pdf_preview_url} alt={`${title} PDF`} loading="lazy" className="w-full" />
                  {ready && !user && (
                    <div className="absolute inset-x-0 bottom-0 flex h-2/3 flex-col items-center justify-end bg-gradient-to-t from-white via-white/90 to-transparent px-4 pb-6 text-center">
                      <p className="mb-3 text-sm font-semibold text-gray-800">{t('freeLessons.detail.pdfPreviewLocked')}</p>
                      <button
                        type="button"
                        onClick={openGate}
                        className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-blue-700"
                      >
                        {t('freeLessons.detail.loginToDownload')}
                      </button>
                    </div>
                  )}
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5 sm:p-6">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
                <i className="ri-lightbulb-flash-line text-blue-600" />
                {t('freeLessons.detail.howToPractice')}
              </h2>
              <ol className="space-y-3">
                {practiceSteps.map((step, index) => (
                  <li key={step} className="flex gap-3 text-sm leading-relaxed text-gray-700">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                      {index + 1}
                    </span>
                    <span className="pt-0.5">
                      {step}
                      {index === 3 && lesson.bpm ? ` (${lesson.bpm} BPM)` : ''}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            {relatedSheets.length > 0 && (
              <section>
                <h2 className="mb-4 text-lg font-bold text-gray-900">{t('freeLessons.detail.relatedSheets')}</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {relatedSheets.map((sheet) => (
                    <Link
                      key={sheet.id}
                      href={getLocalizedUrl(`/drum-sheet/${sheet.slug || sheet.id}`, locale)}
                      className="group overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="aspect-square overflow-hidden bg-gray-100">
                        <img
                          src={sheet.thumbnail_url || generateDefaultThumbnail(400, 400)}
                          alt={`${sheet.title} - ${sheet.artist}`}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                      <div className="p-2.5">
                        <p className="line-clamp-1 text-sm font-bold text-gray-900">{sheet.title}</p>
                        <p className="line-clamp-1 text-xs text-gray-500">{sheet.artist}</p>
                        <p className="mt-1 text-sm font-extrabold text-blue-600">{formatSheetPrice(sheet.price)}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-6 space-y-4">{downloadCard}</div>
          </aside>
        </div>

        {relatedLessons.length > 0 && (
          <section className="mt-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 sm:text-xl">{t('freeLessons.detail.relatedLessons')}</h2>
              <Link
                href={getLocalizedUrl('/free-lessons', locale)}
                className="text-sm font-medium text-gray-500 hover:text-gray-800"
              >
                {t('freeLessons.detail.moreLessons')} <i className="ri-arrow-right-s-line" />
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-4">
              {relatedLessons.map((item) => (
                <FreeLessonCard key={item.id} lesson={item} downloaded={downloadedIds.has(item.id)} compact />
              ))}
            </div>
          </section>
        )}

        <section className="mt-10 flex flex-col items-center gap-4 rounded-2xl bg-gradient-to-r from-blue-700 to-indigo-700 px-6 py-8 text-center text-white sm:flex-row sm:justify-between sm:text-left">
          <div>
            <h2 className="text-lg font-bold sm:text-xl">{t('freeLessons.detail.ctaTitle')}</h2>
            <p className="mt-1 text-sm text-blue-100">{t('freeLessons.detail.ctaDescription')}</p>
          </div>
          <Link
            href={getLocalizedUrl('/categories', locale)}
            className="inline-flex flex-shrink-0 items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-blue-700 shadow hover:bg-blue-50"
          >
            <i className="ri-music-2-line" />
            {t('freeLessons.detail.browseSheets')}
          </Link>
        </section>
      </div>

      <Footer />

      <SignupGateModal open={gateOpen} onClose={() => setGateOpen(false)} returnPath={returnPath} />

      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-[90] flex justify-center px-4">
          <div className="rounded-full bg-gray-900/90 px-5 py-2.5 text-sm font-medium text-white shadow-lg">{toast}</div>
        </div>
      )}
    </div>
  );
}
