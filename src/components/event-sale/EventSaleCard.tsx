'use client';

import { useTranslation } from 'react-i18next';
import { generateDefaultThumbnail } from '@/lib/defaultThumbnail';
import {
  getEventDisplayTitle,
  getEventPercent,
  getEventThumbnail,
  type EventDiscountSheet,
} from '@/lib/eventDiscountRules';
import EventCountdown from './EventCountdown';
import SalePrice, { useFormatKrw } from './SalePrice';

interface EventSaleCardProps {
  event: EventDiscountSheet;
  mode: 'active' | 'scheduled';
  onOpen: (event: EventDiscountSheet) => void;
  onBuyNow?: (event: EventDiscountSheet) => void;
  onAddToCart?: (event: EventDiscountSheet) => void;
  inCart?: boolean;
  buying?: boolean;
  purchased?: boolean;
  /** 메인 페이지 가로 스크롤용 작은 카드 */
  compact?: boolean;
}

export default function EventSaleCard({
  event,
  mode,
  onOpen,
  onBuyNow,
  onAddToCart,
  inCart = false,
  buying = false,
  purchased = false,
  compact = false,
}: EventSaleCardProps) {
  const { t, i18n } = useTranslation();
  const formatKrw = useFormatKrw();
  const title = getEventDisplayTitle(event, i18n.language);
  const price = Number(event.sheet_price) || 0;
  const percent = getEventPercent(event);
  const isLive = mode === 'active';

  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-lg ${
        isLive ? 'border-red-100' : 'border-gray-200'
      }`}
    >
      <button
        type="button"
        onClick={() => onOpen(event)}
        className="relative block aspect-square w-full overflow-hidden bg-gray-100 text-left"
        aria-label={title}
      >
        <img
          src={getEventThumbnail(event) || generateDefaultThumbnail(400, 400)}
          alt={title}
          loading="lazy"
          className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${
            isLive ? '' : 'grayscale-[35%]'
          }`}
          onError={(e) => {
            (e.target as HTMLImageElement).src = generateDefaultThumbnail(400, 400);
          }}
        />
        {percent > 0 && (
          <span
            className={`absolute left-2 top-2 rounded-lg bg-red-600 font-extrabold text-white shadow ${
              compact ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm'
            }`}
          >
            -{percent}%
          </span>
        )}
        {!isLive && (
          <span className="absolute right-2 top-2 rounded-full bg-gray-900/80 px-2 py-0.5 text-[11px] font-semibold text-white">
            {t('eventSale.badge.soon')}
          </span>
        )}
        <div
          className={`absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t px-2 pb-2 pt-6 text-white ${
            isLive ? 'from-red-700/95 via-red-600/70 to-transparent' : 'from-gray-900/90 via-gray-900/60 to-transparent'
          }`}
        >
          <i className={`${isLive ? 'ri-timer-flash-line' : 'ri-time-line'} ${compact ? 'text-sm' : 'text-base'}`} />
          <span className={`hidden whitespace-nowrap font-medium sm:inline ${compact ? 'text-[11px]' : 'text-xs'}`}>
            {isLive ? t('eventSale.timer.endsIn') : t('eventSale.timer.startsIn')}
          </span>
          <EventCountdown
            target={isLive ? event.event_end : event.event_start}
            className={`whitespace-nowrap font-bold ${compact ? 'text-xs' : 'text-xs sm:text-sm'}`}
          />
        </div>
      </button>

      <div className={`flex flex-1 flex-col ${compact ? 'gap-1.5 p-2.5' : 'gap-2 p-3 sm:p-4'}`}>
        <button type="button" onClick={() => onOpen(event)} className="min-w-0 text-left">
          <h3
            className={`line-clamp-1 font-bold text-gray-900 group-hover:text-red-600 ${
              compact ? 'text-sm' : 'text-sm sm:text-base'
            }`}
          >
            {title}
          </h3>
          <p className={`line-clamp-1 text-gray-500 ${compact ? 'text-xs' : 'text-xs sm:text-sm'}`}>{event.artist}</p>
        </button>

        {isLive ? (
          <SalePrice price={price} event={event} size={compact ? 'sm' : 'md'} showPercent={false} />
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className={`font-bold text-gray-700 ${compact ? 'text-sm' : 'text-base'}`}>
              {formatKrw(Math.min(price, event.discount_price))}
            </span>
            <span className="text-xs text-gray-400 line-through">{formatKrw(price)}</span>
          </div>
        )}

        {!compact && (
          <div className="mt-auto flex gap-2 pt-1">
            {isLive && purchased ? (
              <button
                type="button"
                onClick={() => onOpen(event)}
                className="flex h-10 flex-1 items-center justify-center gap-1 rounded-xl bg-gray-100 px-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-200"
              >
                <i className="ri-check-double-line" />
                {t('eventSale.actions.purchased')}
              </button>
            ) : isLive ? (
              <>
                {onAddToCart && (
                  <button
                    type="button"
                    onClick={() => onAddToCart(event)}
                    disabled={inCart}
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={inCart ? t('eventSale.actions.inCart') : t('eventSale.actions.addToCart')}
                    title={inCart ? t('eventSale.actions.inCart') : t('eventSale.actions.addToCart')}
                  >
                    <i className={inCart ? 'ri-check-line text-lg' : 'ri-shopping-cart-2-line text-lg'} />
                  </button>
                )}
                {onBuyNow && (
                  <button
                    type="button"
                    onClick={() => onBuyNow(event)}
                    disabled={buying}
                    className="flex h-10 flex-1 items-center justify-center rounded-xl bg-red-600 px-3 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                  >
                    {buying ? <i className="ri-loader-4-line animate-spin" /> : t('eventSale.actions.buyNow')}
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => onOpen(event)}
                className="flex h-10 flex-1 items-center justify-center rounded-xl border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                {t('eventSale.actions.viewDetail')}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
