'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';

import MainHeader from '../../components/common/MainHeader';
import Footer from '../../components/common/Footer';
import Seo from '../../components/Seo';
import EventCountdown from '../../components/event-sale/EventCountdown';
import EventSaleCard from '../../components/event-sale/EventSaleCard';
import { supabase } from '../../lib/supabase';
import { fetchPurchasedSheetIds, hasPurchasedSheet } from '../../lib/purchaseCheck';
import { getEventDisplayTitle, type EventDiscountSheet } from '../../lib/eventDiscountRules';
import { languageDomainMap } from '../../config/languageDomainMap';
import { useCart } from '../../hooks/useCart';
import { useBuyNow } from '../../hooks/useBuyNow';
import { refreshEventSales, useEventSales } from '../../hooks/useEventSales';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
      <div className="aspect-square animate-pulse bg-gray-200" />
      <div className="space-y-2 p-3 sm:p-4">
        <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-gray-100" />
        <div className="h-5 w-2/3 animate-pulse rounded bg-gray-200" />
        <div className="h-10 animate-pulse rounded-xl bg-gray-100" />
      </div>
    </div>
  );
}

export default function EventSalePage() {
  const { t, i18n } = useTranslation();
  const router = useLocaleRouter();
  const eventSales = useEventSales();
  const { addToCart, isInCart } = useCart();

  const [user, setUser] = useState<User | null>(null);
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());
  const [buyingSheetId, setBuyingSheetId] = useState<string | null>(null);
  const buyNow = useBuyNow(user);

  useEffect(() => {
    void refreshEventSales(true);
    void supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
  }, []);

  const activeSheetIds = useMemo(
    () => eventSales.active.map((event) => event.sheet_id),
    [eventSales.active],
  );

  useEffect(() => {
    if (!user || activeSheetIds.length === 0) return;
    let cancelled = false;
    fetchPurchasedSheetIds(user.id, activeSheetIds)
      .then((ids) => {
        if (!cancelled) setPurchasedIds(new Set(ids));
      })
      .catch(() => {
        /* 구매 여부 표시는 부가 정보라 실패해도 무시 */
      });
    return () => {
      cancelled = true;
    };
  }, [user, activeSheetIds]);

  const soonestEnd = eventSales.active.reduce<string | null>(
    (min, event) => (min === null || event.event_end < min ? event.event_end : min),
    null,
  );
  const nextStart = eventSales.scheduled[0]?.event_start ?? null;

  const handleOpen = useCallback(
    (event: EventDiscountSheet) => {
      if (event.slug) router.push(`/drum-sheet/${event.slug}`);
    },
    [router],
  );

  const handleBuyNow = useCallback(
    async (event: EventDiscountSheet) => {
      setBuyingSheetId(event.sheet_id);
      try {
        await buyNow.handleBuyNow({
          id: event.sheet_id,
          title: getEventDisplayTitle(event, i18n.language),
          price: Number(event.sheet_price) || 0,
        });
      } finally {
        setBuyingSheetId(null);
      }
    },
    [buyNow, i18n.language],
  );

  const handleAddToCart = useCallback(
    async (event: EventDiscountSheet) => {
      if (user) {
        try {
          if (await hasPurchasedSheet(user.id, event.sheet_id)) {
            alert(t('categoriesPage.alreadyPurchased', { title: getEventDisplayTitle(event, i18n.language) }));
            return;
          }
        } catch {
          /* 구매 확인 실패 시에도 담기는 허용 (결제 단계에서 다시 검증) */
        }
      }
      await addToCart(event.sheet_id);
    },
    [user, addToCart, t, i18n.language],
  );

  const baseUrl =
    languageDomainMap[i18n.language as keyof typeof languageDomainMap] ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  const isLoading = !eventSales.loaded;
  const isEmpty = eventSales.loaded && !eventSales.hasAny;

  return (
    <div className="min-h-screen bg-gray-50">
      <Seo
        title={`${t('eventSale.page.title')} | COPYDRUM`}
        description={t('eventSale.page.subtitle')}
        canonicalUrl={baseUrl ? `${baseUrl}/event-sale` : '/event-sale'}
        locale={i18n.language}
      />
      <MainHeader user={user} />

      <section className="relative overflow-hidden bg-gradient-to-br from-red-600 via-rose-600 to-orange-500 text-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-orange-300/20 blur-3xl" />
        <div className="relative mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:py-14">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold tracking-wide ring-1 ring-white/30 sm:text-sm">
              {eventSales.hasActive ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                  </span>
                  {t('eventSale.badge.live')}
                </>
              ) : (
                <>
                  <i className="ri-timer-flash-line" />
                  {t('eventSale.nav')}
                </>
              )}
            </span>
            <h1 className="mt-4 text-3xl font-extrabold leading-tight sm:text-4xl">{t('eventSale.page.title')}</h1>
            <p className="mt-3 text-sm leading-relaxed text-white/90 sm:text-base">{t('eventSale.page.subtitle')}</p>
          </div>

          {(soonestEnd || nextStart) && (
            <div className="rounded-2xl bg-black/15 p-4 ring-1 ring-white/20 backdrop-blur-sm sm:p-5">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-white/90 sm:text-sm">
                <i className="ri-time-line" />
                {soonestEnd ? t('eventSale.page.soonestEnd') : t('eventSale.page.nextOpen')}
              </p>
              <EventCountdown
                target={(soonestEnd || nextStart)!}
                variant="blocks"
                tone="light"
                onExpire={() => void refreshEventSales(true)}
              />
            </div>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-7xl space-y-12 px-4 py-8 sm:px-6 sm:py-12">
        {isLoading && (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <CardSkeleton key={index} />
            ))}
          </div>
        )}

        {eventSales.active.length > 0 && (
          <section>
            <div className="mb-4 flex items-end justify-between gap-3 sm:mb-6">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-extrabold text-gray-900 sm:text-2xl">
                  <i className="ri-fire-fill text-red-500" />
                  {t('eventSale.page.liveTitle')}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {t('eventSale.page.liveCount', { count: eventSales.active.length })}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
              {eventSales.active.map((event) => (
                <EventSaleCard
                  key={event.id}
                  event={event}
                  mode="active"
                  onOpen={handleOpen}
                  onBuyNow={handleBuyNow}
                  onAddToCart={handleAddToCart}
                  inCart={isInCart(event.sheet_id)}
                  buying={buyingSheetId === event.sheet_id}
                  purchased={purchasedIds.has(event.sheet_id)}
                />
              ))}
            </div>
          </section>
        )}

        {eventSales.scheduled.length > 0 && (
          <section>
            <div className="mb-4 sm:mb-6">
              <h2 className="flex items-center gap-2 text-xl font-extrabold text-gray-900 sm:text-2xl">
                <i className="ri-calendar-event-line text-amber-500" />
                {t('eventSale.page.upcomingTitle')}
              </h2>
              <p className="mt-1 text-sm text-gray-500">{t('eventSale.page.upcomingDesc')}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
              {eventSales.scheduled.map((event) => (
                <EventSaleCard key={event.id} event={event} mode="scheduled" onOpen={handleOpen} />
              ))}
            </div>
          </section>
        )}

        {isEmpty && (
          <section className="flex flex-col items-center rounded-3xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-3xl text-red-500">
              <i className="ri-timer-flash-line" />
            </span>
            <h2 className="mt-4 text-lg font-bold text-gray-900 sm:text-xl">{t('eventSale.page.emptyTitle')}</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-500">{t('eventSale.page.emptyDesc')}</p>
            <button
              type="button"
              onClick={() => router.push('/categories')}
              className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-gray-800"
            >
              {t('eventSale.page.browseLatest')}
              <i className="ri-arrow-right-line" />
            </button>
          </section>
        )}

        <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-900 sm:text-base">
            <i className="ri-information-line text-gray-500" />
            {t('eventSale.page.noticeTitle')}
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-gray-600 sm:text-sm">
            <li>{t('eventSale.page.notice1')}</li>
            <li>{t('eventSale.page.notice2')}</li>
            <li>{t('eventSale.page.notice3')}</li>
          </ul>
        </section>
      </main>

      <Footer />
    </div>
  );
}
