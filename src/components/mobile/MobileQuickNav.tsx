'use client';

import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { removeLocaleFromPathname } from '@/lib/localeUrl';
import { useEventSales } from '@/hooks/useEventSales';
import {
  COLLECTIONS_PUBLIC_ENABLED,
  DRUM_LESSON_BOOKS_PUBLIC_ENABLED,
  FREE_LESSONS_PUBLIC_ENABLED,
  SHEET_BOOKS_PUBLIC_ENABLED,
} from '@/config/featureFlags';

interface QuickNavItem {
  key: string;
  labelKey: string;
  href: string;
  icon: string;
}

const quickNavItems: QuickNavItem[] = [
  { key: 'home', labelKey: 'nav.home', href: '/', icon: 'ri-home-4-line' },
  { key: 'eventSale', labelKey: 'eventSale.nav', href: '/event-sale', icon: 'ri-timer-flash-line' },
  { key: 'categories', labelKey: 'nav.categories', href: '/categories', icon: 'ri-apps-line' },
  { key: 'collections', labelKey: 'nav.collections', href: '/collections', icon: 'ri-stack-line' },
  { key: 'freeLessons', labelKey: 'freeLessons.nav.label', href: '/free-lessons', icon: 'ri-play-circle-line' },
  { key: 'lesson', labelKey: 'nav.drumLesson', href: '/free-sheets', icon: 'ri-book-2-line' },
  { key: 'sheetBooks', labelKey: 'nav.sheetBooks', href: '/sheet-books', icon: 'ri-book-mark-line' },
  { key: 'customOrder', labelKey: 'nav.customOrder', href: '/custom-order', icon: 'ri-edit-line' },
];

export default function MobileQuickNav() {
  const router = useLocaleRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const eventSales = useEventSales();

  const pathWithoutLocale = removeLocaleFromPathname(pathname);

  return (
    <nav className="md:hidden fixed top-[140px] left-0 right-0 z-40 bg-white border-b border-gray-200">
      <div
        className="flex gap-2 px-3 py-2 overflow-x-auto mobile-quick-nav-scroll"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {quickNavItems
          .filter((item) => {
            if (item.key === 'eventSale' && !eventSales.hasAny) return false;
            if (item.key === 'collections' && !COLLECTIONS_PUBLIC_ENABLED) return false;
            if (item.key === 'sheetBooks' && !SHEET_BOOKS_PUBLIC_ENABLED) return false;
            if (item.key === 'lesson' && !DRUM_LESSON_BOOKS_PUBLIC_ENABLED) return false;
            if (item.key === 'freeLessons' && !FREE_LESSONS_PUBLIC_ENABLED) return false;
            return true;
          })
          .map((item) => {
          const isActive =
            item.key === 'home'
              ? pathWithoutLocale === '/' || pathWithoutLocale === ''
              : pathWithoutLocale.startsWith(item.href);

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => router.push(item.href)}
              className={`flex items-center gap-1.5 flex-shrink-0 px-3.5 py-2 rounded-full text-[13px] font-semibold whitespace-nowrap transition-all ${
                item.key === 'eventSale'
                  ? isActive
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'bg-red-50 text-red-600 border border-red-200 active:bg-red-100'
                  : isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-50 text-gray-600 border border-gray-200 active:bg-gray-100'
              }`}
            >
              <i className={`${item.icon} text-[15px]`} />
              <span>{t(item.labelKey)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
