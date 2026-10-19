'use client';

import { useTranslation } from 'react-i18next';
import { getEventPercent, type EventDiscountSheet } from '@/lib/eventDiscountRules';
import EventCountdown from './EventCountdown';
import { useFormatKrw } from './SalePrice';

interface EventSaleDetailBannerProps {
  event: EventDiscountSheet;
  mode: 'active' | 'scheduled';
  /** 현재 정가 (KRW) */
  price: number;
  /** 가격까지 크게 보여준다 (데스크톱 가격 박스 대체용) */
  showPrice?: boolean;
  className?: string;
}

export default function EventSaleDetailBanner({
  event,
  mode,
  price,
  showPrice = true,
  className = '',
}: EventSaleDetailBannerProps) {
  const { t, i18n } = useTranslation();
  const formatKrw = useFormatKrw();
  const percent = getEventPercent({ ...event, sheet_price: price });

  if (mode === 'scheduled') {
    const openAt = new Date(event.event_start).toLocaleString(i18n.language, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return (
      <div className={`rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5 ${className}`}>
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <i className="ri-alarm-line text-lg" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-amber-900">{t('eventSale.detail.upcomingBanner')}</p>
            <p className="mt-0.5 text-sm text-amber-800">
              {t('eventSale.detail.upcomingInfo', {
                date: openAt,
                price: formatKrw(Math.min(price, event.discount_price)),
              })}
            </p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-900">
              {t('eventSale.timer.startsIn')}
              <EventCountdown target={event.event_start} />
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-2xl bg-gradient-to-br from-rose-500 via-pink-600 to-blue-600 text-white shadow-lg shadow-pink-500/20 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-bold ring-1 ring-white/30">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          </span>
          {t('eventSale.detail.liveBanner')}
        </span>
        {percent > 0 && (
          <span className="rounded-lg bg-white px-2.5 py-1 text-sm font-extrabold text-rose-600">
            {t('eventSale.badge.percentOff', { percent })}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4 px-4 pb-4 pt-3 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:pb-5">
        {showPrice && (
          <div>
            <p className="text-sm text-white/80 line-through">{formatKrw(price)}</p>
            <p className="text-3xl font-extrabold leading-tight sm:text-4xl">
              {formatKrw(Math.min(price, event.discount_price))}
            </p>
          </div>
        )}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-white/85">{t('eventSale.detail.endsIn')}</p>
          <EventCountdown target={event.event_end} variant="blocks" tone="light" />
        </div>
      </div>

      <p className="border-t border-white/15 bg-black/10 px-4 py-2 text-xs text-white/85 sm:px-6">
        <i className="ri-information-line mr-1" />
        {t('eventSale.detail.saleNotice')}
      </p>
    </div>
  );
}