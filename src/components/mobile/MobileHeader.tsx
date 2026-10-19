'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import type { User } from '@supabase/supabase-js';
import { useState, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useCart } from '../../hooks/useCart';
import { getLanguageFromPath } from '../../i18n/languages';
import { removeLocaleFromPathname } from '@/lib/localeUrl';
import { CashChargeMobileHeaderButton } from '../cash/CashChargeEntry';
import { SignupBonusBadge } from '../auth/SignupBonus';
import MobileQuickNav from './MobileQuickNav';
import BrandLogo from '../common/BrandLogo';

interface MobileHeaderProps {
  user?: User | null;
  onMenuToggle: () => void;
  onSearchToggle?: () => void;
  /** 아래로 스크롤 중이면 검색줄·퀵네비를 접어 본문 영역을 넓힌다 */
  collapsed?: boolean;
}

export default function MobileHeader({
  user,
  onMenuToggle,
  collapsed = false,
}: MobileHeaderProps) {
  const router = useLocaleRouter();
  const { t, i18n } = useTranslation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { cartItems } = useCart();

  const isCategoriesPage = removeLocaleFromPathname(pathname).startsWith('/categories');
  const urlSearchQuery = isCategoriesPage ? searchParams?.get('search') ?? '' : '';

  // 검색 결과 화면에서는 검색창에 현재 검색어를 유지한다
  useEffect(() => {
    setSearchQuery(urlSearchQuery);
  }, [urlSearchQuery]);

  // URL 경로에서 감지한 언어로 i18n 동기화
  useEffect(() => {
    const pathLang = getLanguageFromPath(pathname);
    if (pathLang && i18n.language !== pathLang) {
      i18n.changeLanguage(pathLang);
    }
  }, [pathname, i18n]);

  // React 19 + suppressHydrationWarning 환경에서 서버 렌더링(영어)이 클라이언트에서 갱신되지 않는 문제 해결
  // ref를 통해 직접 DOM placeholder를 설정
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.placeholder = t('sidebar.search.placeholder');
    }
  }, [t, i18n.language]);

  const siteName = t('site.name');

  const cartCount = cartItems.length;

  const handleSearch = () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      return;
    }
    const searchParams = new URLSearchParams({ search: trimmed });
    router.push(`/categories?${searchParams.toString()}`);
    searchInputRef.current?.blur();
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <header className="md:hidden fixed top-0 left-0 right-0 z-50" suppressHydrationWarning>
      {/* 상단: 햄버거 · 로고 | 캐쉬 · 회원가입 · 장바구니 · 계정 */}
      <div className="relative z-10 flex h-14 items-center bg-ink pl-1.5 pr-2 text-white" suppressHydrationWarning>
        <button
          type="button"
          onClick={onMenuToggle}
          aria-label={t('mobile.header.openMenu')}
          className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-white/15"
          suppressHydrationWarning
        >
          <i className="ri-menu-line text-[22px]" />
        </button>

        <button
          type="button"
          onClick={() => router.push('/')}
          className="flex items-center rounded-lg px-1"
          aria-label={t('mobile.header.goHome', { site: siteName })}
          suppressHydrationWarning
        >
          <BrandLogo size={30} wordmarkClassName="max-[359px]:hidden" />
        </button>

        <div className="ml-auto flex items-center gap-0.5" suppressHydrationWarning>
          {user ? (
            <div className="mr-1">
              <CashChargeMobileHeaderButton user={user} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => router.push('/auth/register')}
              className="relative mr-1 h-8 whitespace-nowrap rounded-full bg-white px-3 text-xs font-bold text-blue-700 active:bg-blue-50"
              suppressHydrationWarning
            >
              {t('header.signup')}
              <SignupBonusBadge variant="cornerSm" />
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push('/cart')}
            aria-label={t('nav.cart')}
            className="relative flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-white/15"
            suppressHydrationWarning
          >
            <i className="ri-shopping-cart-2-line text-[22px]" />
            {cartCount > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-ink">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => router.push(user ? '/mypage' : '/auth/login')}
            aria-label={user ? t('nav.mypage') : t('nav.login')}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-white/15"
            suppressHydrationWarning
          >
            <i className="ri-user-3-line text-[22px]" />
          </button>
        </div>
      </div>

      {/* 하단: 검색창 + 퀵 네비게이션 (스크롤을 내리면 접힘) */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
        }`}
        aria-hidden={collapsed || undefined}
        suppressHydrationWarning
      >
        <div className="min-h-0 overflow-hidden" suppressHydrationWarning>
          <div className="h-[52px] bg-ink px-3" suppressHydrationWarning>
            <div className="relative">
              <input
                ref={searchInputRef}
                type="search"
                enterKeyHint="search"
                placeholder={t('sidebar.search.placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyPress}
                tabIndex={collapsed ? -1 : undefined}
                className="h-10 w-full rounded-full border-0 bg-white pl-11 pr-10 text-base text-gray-900 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-4 focus:ring-white/30 [&::-webkit-search-cancel-button]:hidden"
                suppressHydrationWarning
              />
              <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  aria-label={t('mobile.search.clear')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-circle-line text-xl" />
                </button>
              )}
            </div>
          </div>
          <MobileQuickNav />
        </div>
      </div>
    </header>
  );
}
