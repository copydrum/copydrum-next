'use client';

import { useTranslation } from 'react-i18next';
import { convertFromKrw, formatCurrency, getSiteCurrency } from '@/lib/currency';
import { getEventPercent, getEventSalePrice, type EventDiscountSheet } from '@/lib/eventDiscountRules';

type SalePriceSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface SalePriceProps {
  /** 정가 (KRW) */
  price: number;
  /** 진행 중인 이벤트 (없으면 정가만 표시) */
  event?: EventDiscountSheet | null;
  size?: SalePriceSize;
  /** 이벤트가 없을 때 정가에 적용할 클래스 */
  regularClassName?: string;
  showPercent?: boolean;
  align?: 'start' | 'end';
  /** 정가·할인가를 세로로 쌓는다 (좁은 영역용) */
  stacked?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<SalePriceSize, { sale: string; original: string; badge: string }> = {
  xs: { sale: 'text-xs font-bold', original: 'text-[10px]', badge: 'text-[10px] px-1 py-px' },
  sm: { sale: 'text-sm font-bold', original: 'text-xs', badge: 'text-[10px] px-1.5 py-0.5' },
  md: { sale: 'text-lg font-bold', original: 'text-sm', badge: 'text-xs px-1.5 py-0.5' },
  lg: { sale: 'text-2xl font-extrabold', original: 'text-sm', badge: 'text-xs px-2 py-0.5' },
  xl: { sale: 'text-3xl font-extrabold', original: 'text-base', badge: 'text-sm px-2 py-0.5' },
};

export function useFormatKrw() {
  const { i18n } = useTranslation();
  const currency = getSiteCurrency(undefined, i18n.language);
  return (krw: number) => formatCurrency(convertFromKrw(krw, currency, i18n.language), currency);
}

export default function SalePrice({
  price,
  event,
  size = 'md',
  regularClassName = 'text-gray-900 font-bold',
  showPercent = true,
  align = 'start',
  stacked = false,
  className = '',
}: SalePriceProps) {
  const formatKrw = useFormatKrw();
  const sizes = SIZE_CLASSES[size];

  if (!event) {
    return <span className={`${regularClassName} ${className}`}>{formatKrw(price)}</span>;
  }

  const salePrice = Math.min(price, getEventSalePrice(event));
  const percent = getEventPercent({ ...event, sheet_price: price });

  return (
    <span
      className={`inline-flex ${stacked ? 'flex-col' : 'flex-wrap items-baseline gap-x-1.5'} ${
        align === 'end' ? (stacked ? 'items-end' : 'justify-end') : stacked ? 'items-start' : ''
      } ${className}`}
    >
      <span className="inline-flex items-baseline gap-1.5">
        {showPercent && percent > 0 && (
          <span className={`rounded bg-red-600 font-bold text-white leading-none ${sizes.badge}`}>-{percent}%</span>
        )}
        <span className={`text-red-600 leading-tight ${sizes.sale}`}>{formatKrw(salePrice)}</span>
      </span>
      <span className={`text-gray-400 line-through leading-tight ${sizes.original}`}>{formatKrw(price)}</span>
    </span>
  );
}
