'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import type { User } from '@supabase/supabase-js';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import LanguageSelector from '../common/LanguageSelector';
import { isGlobalSiteHost } from '../../config/hostType';
import { useCart } from '../../hooks/useCart';
import { getLanguageFromPath } from '../../i18n/languages';

interface MobileHeaderProps {
  user?: User | null;
  onMenuToggle: () => void;
  onSearchToggle: () => void;
}

export default function MobileHeader({
  user,
  onMenuToggle,
  onSearchToggle,
}: MobileHeaderProps) {
  const router = useLocaleRouter();
  const { t, i18n } = useTranslation();
  const pathname = usePathname();
  const [isGlobalSite, setIsGlobalSite] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { cartItems } = useCart();

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

  // 호스트 타입을 컴포넌트 마운트 시 한 번만 계산
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsGlobalSite(isGlobalSiteHost(window.location.host));
    }
  }, []);

  const cartCount = cartItems.length;

  const handleSearch = () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      return;
    }
    const searchParams = new URLSearchParams({ search: trimmed });
    router.push(`/categories?${searchParams.toString()}`);
    setSearchQuery('');
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-blue-700 text-white" suppressHydrationWarning>
      {/* 상단: 햄버거 / 로고 / 장바구니 / 마이페이지 */}
      <div className="flex items-center justify-between px-4 py-3" suppressHydrationWarning>
        <button
          type="button"
          onClick={onMenuToggle}
          aria-label={t('mobile.header.openMenu')}
          className="flex items-center justify-center h-10 w-10 rounded-full hover:bg-blue-600 transition-colors"
          suppressHydrationWarning
        >
          <i className="ri-menu-line text-2xl" />
        </button>

        <button
          type="button"
          onClick={() => router.push('/')}
          className="flex flex-col items-center justify-center"
          aria-label={t('mobile.header.goHome', { site: siteName })}
          suppressHydrationWarning
        >
          <img
            src="/logo.png"
            alt={siteName}
            className="h-10 w-auto"
            suppressHydrationWarning
          />
          {!isGlobalSite && (
            <span className="text-xs font-semibold mt-1 tracking-wide" suppressHydrationWarning>
              {siteName}
            </span>
          )}
        </button>

        {/* 우측: 장바구니 / 마이페이지 아이콘 */}
        <div className="flex items-center gap-2" suppressHydrationWarning>
          <button
            type="button"
            onClick={() => router.push('/cart')}
            aria-label={t('nav.cart')}
            className="relative flex items-center justify-center h-10 w-10 rounded-full hover:bg-blue-600 transition-colors"
            suppressHydrationWarning
          >
            <i className="ri-shopping-cart-line text-2xl" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-semibold">
                {cartCount}
              </span>
            )}
          </button>
          {!user && (
            <button
              type="button"
              onClick={() => router.push('/auth/register')}
              aria-label={t('header.signup')}
              className="flex items-center justify-center px-3 py-1.5 rounded-md text-sm font-medium text-white hover:bg-blue-600 transition-colors"
              suppressHydrationWarning
            >
              {t('header.signup')}
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push(user ? '/mypage' : '/auth/login')}
            aria-label={user ? t('nav.mypage') : t('nav.login')}
            className="flex items-center justify-center h-10 w-10 rounded-full hover:bg-blue-600 transition-colors"
            suppressHydrationWarning
          >
            <i className={user ? 'ri-user-line text-2xl' : 'ri-login-box-line text-2xl'} />
          </button>
        </div>
      </div>

      {/* 하단: 언어 선택 (우측 정렬) + 검색창 */}
      <div className="px-4 pb-3 space-y-2" suppressHydrationWarning>
        <div className="flex justify-end">
          <LanguageSelector variant="mobile" />
        </div>
        {/* 모바일 검색창 */}
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            placeholder={t('sidebar.search.placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyPress}
            className="w-full px-4 py-2.5 pl-11 pr-10 text-sm rounded-full bg-blue-50 border-0 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white/50"
            suppressHydrationWarning
          />
          <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label={t('mobile.search.clear')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <i className="ri-close-circle-line text-xl" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}


