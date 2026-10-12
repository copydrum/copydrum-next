'use client';

import { useTranslation } from 'react-i18next';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { refreshEventSales, useEventSales } from '@/hooks/useEventSales';
import type { EventDiscountSheet } from '@/lib/eventDiscountRules';
import EventCountdown from './EventCountdown';
import EventSaleCard from './EventSaleCard';

const MAX_ITEMS = 8;

/** 진행 중이거나 예정된 특가가 있을 때만 메인에 노출되는 섹션 */
export default function HomeEventSaleSection() {
  const { t } = useTranslation();
  const router = useLocaleRouter();
  const { active, scheduled, hasActive, hasAny } = useEventSales();

  if (!hasAny) return null;

  const items = [
    ...active.map((event) => ({ event, mode: 'active' as const })),
    ...scheduled.map((event) => ({ event, mode: 'scheduled' as const })),
  ].slice(0, MAX_ITEMS);

  const soonestEnd = active.reduce<string | null>(
    (min, event) => (min === null || event.event_end < min ? event.event_end : min),
    null,
  );
  const countdownTarget = soonestEnd ?? scheduled[0]?.event_start ?? null;

  const openDetail = (event: EventDiscountSheet) => {
    if (event.slug) router.push(`/drum-sheet/${event.slug}`);
  };

  return (
    <section className="pt-2 md:pt-8">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl bg-gradient-to-br from-red-600 via-rose-600 to-orange-500 p-4 text-white shadow-lg sm:p-6 lg:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold ring-1 ring-white/30 sm:text-xs">
              {hasActive ? (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </span>
              ) : (
                <i className="ri-time-line" />
              )}
              {hasActive ? t('eventSale.badge.live') : t('eventSale.badge.soon')}
            </span>
            <h2 className="mt-2 text-2xl font-extrabold sm:text-3xl">{t('eventSale.home.title')}</h2>
            <p className="mt-1 text-sm text-white/90">
              {hasActive ? t('eventSale.home.subtitle') : t('eventSale.home.upcomingSubtitle')}
            </p>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 md:justify-end">
            {countdownTarget && (
              <div>
                <p className="mb-1 text-[11px] font-semibold text-white/85 sm:text-xs">
                  {soonestEnd ? t('eventSale.page.soonestEnd') : t('eventSale.page.nextOpen')}
                </p>
                <EventCountdown
                  target={countdownTarget}
                  variant="blocks"
                  tone="light"
                  onExpire={() => void refreshEventSales(true)}
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => router.push('/event-sale')}
              className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-bold text-red-600 shadow transition-colors hover:bg-red-50"
            >
              {t('eventSale.actions.viewAll')}
              <i className="ri-arrow-right-s-line text-base" />
            </button>
          </div>
        </div>

        <div className="-mx-4 mt-5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-3 sm:grid sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {items.map(({ event, mode }) => (
              <div key={event.id} className="w-[44vw] max-w-[200px] flex-shrink-0 text-gray-900 sm:w-auto sm:max-w-none">
                <EventSaleCard event={event} mode={mode} onOpen={openDetail} compact />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
