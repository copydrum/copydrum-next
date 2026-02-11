'use client';
import type { User } from '@supabase/supabase-js';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useCart } from '../../hooks/useCart';
import { useTranslation } from 'react-i18next';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { removeLocaleFromPathname } from '@/lib/localeUrl';

interface MobileBottomNavProps {
  user?: User | null;
  onSearchToggle: () => void;
}

interface NavAction {
  key: string;
  label: string;
  icon: string;
  onClick: () => void;
  isActive?: boolean;
  badge?: string | null;
}

export default function MobileBottomNav({
  user,
  onSearchToggle,
}: MobileBottomNavProps) {
  const router = useLocaleRouter();
  const pathname = usePathname();
  const { cartItems } = useCart();
  const { t } = useTranslation();

  const cartCount = cartItems.length;

  const actions = useMemo<NavAction[]>(() => {
    const pathWithoutLocale = removeLocaleFromPathname(pathname);
    const isLoginActive =
      pathWithoutLocale.startsWith('/auth') ||
      pathWithoutLocale.startsWith('/mypage');

    return [
      {
        key: 'account',
        label: user ? t('nav.mypage') : t('nav.login'),
        icon: user ? 'ri-user-line' : 'ri-login-box-line',
        onClick: () => {
          if (user) {
            router.push('/mypage');
          } else {
            router.push('/auth/login');
          }
        },
        isActive: isLoginActive,
      },
      {
        key: 'cart',
        label: t('nav.cart'),
        icon: 'ri-shopping-cart-line',
        onClick: () => router.push('/cart'),
        isActive: pathWithoutLocale.startsWith('/cart'),
        badge: cartCount > 0 ? String(cartCount) : null,
      },
      {
        key: 'support',
        label: t('nav.customerSupport'),
        icon: 'ri-customer-service-2-line',
        onClick: () => router.push('/customer-support'),
        isActive: pathWithoutLocale.startsWith('/customer-support'),
      },
      {
        key: 'search',
        label: t('search.button'),
        icon: 'ri-search-line',
        onClick: onSearchToggle,
      },
    ];
  }, [cartCount, pathname, router, onSearchToggle, t, user]);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-4">
        {actions.map((action) => {
          const isActive = action.isActive;
          return (
            <button
              key={action.key}
              type="button"
              onClick={action.onClick}
              className={`relative flex flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors ${
                isActive ? 'text-blue-600' : 'text-gray-500 hover:text-blue-500'
              }`}
            >
              <i className={`${action.icon} text-xl`} />
              <span>{action.label}</span>
              {action.badge ? (
                <span className="absolute top-1 right-6 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                  {action.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}


