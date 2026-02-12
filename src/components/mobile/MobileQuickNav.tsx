'use client';

import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { removeLocaleFromPathname } from '@/lib/localeUrl';

interface QuickNavItem {
  key: string;
  labelKey: string;
  href: string;
  icon: string;
}

const quickNavItems: QuickNavItem[] = [
  { key: 'home', labelKey: 'nav.home', href: '/', icon: 'ri-home-4-line' },
  { key: 'categories', labelKey: 'nav.categories', href: '/categories', icon: 'ri-apps-line' },
  { key: 'lesson', labelKey: 'nav.drumLesson', href: '/free-sheets', icon: 'ri-graduation-cap-line' },
  { key: 'collections', labelKey: 'nav.collections', href: '/collections', icon: 'ri-stack-line' },
  { key: 'customOrder', labelKey: 'nav.customOrder', href: '/custom-order', icon: 'ri-edit-line' },
];

export default function MobileQuickNav() {
  const router = useLocaleRouter();
  const pathname = usePathname();
  const { t } = useTranslation();

  const pathWithoutLocale = removeLocaleFromPathname(pathname);

  return (
    <nav className="md:hidden fixed top-[180px] left-0 right-0 z-40 bg-white border-b border-gray-200">
      <div
        className="flex gap-2 px-3 py-2 overflow-x-auto mobile-quick-nav-scroll"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {quickNavItems.map((item) => {
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
                isActive
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
