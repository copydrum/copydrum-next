'use client';

import { useTranslation } from 'react-i18next';
import { useHydrated } from '@/hooks/useHydrated';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { isMyBookVisible } from '@/config/featureFlags';
import { MY_BOOK_MAX_DISCOUNT_PERCENT } from '@/lib/myBook/pricing';

interface MyBookPromoBannerProps {
  /** band: 메인 화면 띠 배너, card: 악보집 목록 상단 안내 카드 */
  variant?: 'band' | 'card';
}

export default function MyBookPromoBanner({ variant = 'band' }: MyBookPromoBannerProps) {
  const { t, i18n } = useTranslation();
  const router = useLocaleRouter();
  const hydrated = useHydrated();

  if (!hydrated || !isMyBookVisible(i18n.language)) return null;

  const percent = MY_BOOK_MAX_DISCOUNT_PERCENT;

  if (variant === 'card') {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-violet-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="text-base font-bold text-gray-900">
            <i className="ri-book-open-line mr-1 text-indigo-600" />
            {t('myBook.sheetBooksCard.title')}
          </p>
          <p className="mt-1 text-sm text-gray-600">{t('myBook.sheetBooksCard.description', { percent })}</p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/my-book')}
          className="shrink-0 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          {t('myBook.sheetBooksCard.button')}
        </button>
      </div>
    );
  }

  const chips = [
    { key: 'instant', icon: 'ri-flashlight-fill' },
    { key: 'discount', icon: 'ri-percent-line' },
    { key: 'toc', icon: 'ri-list-ordered' },
  ] as const;

  return (
    <section className="bg-gradient-to-r from-blue-600 via-indigo-600 to-fuchsia-600 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:py-10 lg:px-8">
        {/* Mobile */}
        <div className="text-center md:hidden">
          <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
            {t('myBook.banner.badge')}
          </span>
          <h3 className="mt-3 text-balance break-keep text-xl font-bold leading-snug">{t('myBook.banner.title')}</h3>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {chips.map(({ key, icon }) => (
              <span key={key} className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">
                <i className={`${icon} text-amber-300`} />
                {t(`myBook.banner.chips.${key}`, { percent })}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => router.push('/my-book')}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-indigo-700 shadow-lg active:scale-95"
          >
            <i className="ri-book-open-line" />
            {t('myBook.banner.button')}
          </button>
        </div>

        {/* PC */}
        <div className="hidden items-center justify-between gap-8 md:flex">
          <div className="flex items-center gap-6">
            <div className="relative flex h-24 w-[68px] shrink-0 rotate-[-4deg] flex-col items-center justify-center rounded-lg border-2 border-white/40 bg-white/15 shadow-xl">
              <i className="ri-book-open-line text-3xl" />
              <span className="mt-1 text-[9px] font-bold tracking-widest">PDF</span>
              <span className="absolute -right-3 -top-3 flex h-8 w-8 rotate-12 items-center justify-center rounded-full bg-amber-400 text-[10px] font-extrabold text-indigo-900 shadow">
                1분
              </span>
            </div>
            <div>
              <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
                {t('myBook.banner.badge')}
              </span>
              <h3 className="mt-2 text-2xl font-bold lg:text-3xl">{t('myBook.banner.title')}</h3>
              <p className="mt-1 text-base text-indigo-100">{t('myBook.banner.description', { percent })}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {chips.map(({ key, icon }) => (
                  <span key={key} className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                    <i className={`${icon} text-amber-300`} />
                    {t(`myBook.banner.chips.${key}`, { percent })}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push('/my-book')}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-8 py-3.5 text-base font-bold text-indigo-700 shadow-lg transition-colors hover:bg-indigo-50"
          >
            <i className="ri-book-open-line" />
            {t('myBook.banner.button')}
          </button>
        </div>
      </div>
    </section>
  );
}
