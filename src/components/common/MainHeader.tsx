'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type RefObject } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { googleAuth } from '../../lib/google';
import LanguageSelector from './LanguageSelector';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { getLocaleFromPathname, removeLocaleFromPathname } from '@/lib/localeUrl';
import { useCart } from '../../hooks/useCart';
import { useEventSales } from '../../hooks/useEventSales';
import { useHideOnScroll } from '@/hooks/useHideOnScroll';
import { useAuthStore } from '@/stores/authStore';
import { getGenreOrder, isSameCategory, useGenreCategories } from '@/hooks/useGenreCategories';
import {
  COLLECTIONS_PUBLIC_ENABLED,
  DRUM_LESSON_BOOKS_PUBLIC_ENABLED,
  FREE_LESSONS_PUBLIC_ENABLED,
  SHEET_BOOKS_PUBLIC_ENABLED,
  isMyBookVisible,
} from '@/config/featureFlags';
import { CashChargeHeaderButton } from '@/components/cash/CashChargeEntry';
import { SignupBonusBadge } from '@/components/auth/SignupBonus';

interface MainHeaderProps {
  user?: User | null;
}

interface ServiceNavItem {
  key: string;
  href: string;
  /** 활성 판정에 쓸 경로 (href에 쿼리가 붙는 경우) */
  match?: string;
  label: string;
  tone?: 'sale';
  live?: boolean;
  badge?: string;
}

/** 바깥 클릭·Esc 로 드롭다운을 닫는다 */
function useDismiss(open: boolean, close: () => void, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, ref]);
}

function HeaderIconButton({
  icon,
  label,
  badge,
  onClick,
  expanded,
}: {
  icon: string;
  label: string;
  badge?: number;
  onClick: () => void;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      className="relative flex h-12 min-w-[52px] flex-col items-center justify-center rounded-xl px-2 text-white/90 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      suppressHydrationWarning
    >
      <i className={`${icon} text-[22px] leading-none`} />
      <span className="mt-1 whitespace-nowrap text-[11px] font-medium leading-none">{label}</span>
      {badge ? (
        <span className="absolute right-1.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-blue-700">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </button>
  );
}

export default function MainHeader({ user: userProp }: MainHeaderProps) {
  const storeUser = useAuthStore((state) => state.user);
  const user = userProp ?? storeUser;
  const router = useLocaleRouter();
  const { t, i18n } = useTranslation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pathWithoutLocale = removeLocaleFromPathname(pathname);
  const currentLocale = getLocaleFromPathname(pathname);
  const isKoreanSite = currentLocale === 'ko';
  const { cartItems } = useCart();
  const eventSales = useEventSales();
  const categories = useGenreCategories();
  const isScrollingDown = useHideOnScroll();

  const isCategoriesPage = pathWithoutLocale.startsWith('/categories');
  const urlSearchQuery = isCategoriesPage ? searchParams?.get('search') ?? '' : '';
  const activeCategoryParam = isCategoriesPage && !urlSearchQuery ? searchParams?.get('category') ?? null : null;

  const [searchQuery, setSearchQuery] = useState(urlSearchQuery);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const categoryRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | null>(null);

  const navHidden = isScrollingDown && !categoryOpen;

  useDismiss(categoryOpen, () => setCategoryOpen(false), categoryRef);
  useDismiss(accountOpen, () => setAccountOpen(false), accountRef);

  // 검색 결과 화면에서는 검색창에 현재 검색어를 유지한다
  useEffect(() => {
    setSearchQuery(urlSearchQuery);
  }, [urlSearchQuery]);

  // 페이지가 바뀌면 열린 드롭다운을 닫는다
  useEffect(() => {
    setCategoryOpen(false);
    setAccountOpen(false);
  }, [pathname, searchParams]);

  // "/" 키로 어디서든 검색창에 포커스
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (!searchInputRef.current?.offsetParent) return;
      event.preventDefault();
      searchInputRef.current.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(
    () => () => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    },
    [],
  );

  const getGenreName = (genreKo: string): string => {
    if (i18n.language === 'ko') return genreKo;
    const genreMap: Record<string, string> = {
      '가요': t('categoriesPage.categories.kpop'),
      '팝': t('categoriesPage.categories.pop'),
      '락': t('categoriesPage.categories.rock'),
      'CCM': t('categoriesPage.categories.ccm'),
      '트로트/성인가요': t('categoriesPage.categories.trot'),
      '재즈': t('categoriesPage.categories.jazz'),
      'J-POP': t('categoriesPage.categories.jpop'),
      'OST': t('categoriesPage.categories.ost'),
      '드럼솔로': t('categoriesPage.categories.drumSolo'),
      '드럼커버': t('categoriesPage.categories.drumCover'),
    };
    return genreMap[genreKo] || genreKo;
  };

  const genreItems = useMemo(
    () =>
      getGenreOrder(i18n.language)
        .map((genreKo) => {
          const category = categories.find((cat) => cat.name === genreKo);
          if (!category) return null;
          return {
            id: category.id,
            slug: category.slug,
            label: getGenreName(genreKo),
            href: `/categories?category=${category.slug || category.id}`,
          };
        })
        .filter((item): item is { id: string; slug: string | null; label: string; href: string } => item !== null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories, i18n.language, t],
  );

  const activeGenre = genreItems.find((item) => isSameCategory(activeCategoryParam, item)) ?? null;

  const serviceItems = useMemo(() => {
    const items: (ServiceNavItem | false)[] = [
      eventSales.hasAny && {
        key: 'eventSale',
        href: '/event-sale',
        label: t('eventSale.nav'),
        tone: 'sale',
        live: eventSales.hasActive,
      },
      FREE_LESSONS_PUBLIC_ENABLED && { key: 'freeLessons', href: '/free-lessons', label: t('freeLessons.nav.label') },
      DRUM_LESSON_BOOKS_PUBLIC_ENABLED && {
        key: 'drumLesson',
        href: '/free-sheets?tab=books',
        match: '/free-sheets',
        label: t('sidebar.nav.drumLesson'),
      },
      COLLECTIONS_PUBLIC_ENABLED && { key: 'collections', href: '/collections', label: t('sidebar.nav.collections') },
      SHEET_BOOKS_PUBLIC_ENABLED && { key: 'sheetBooks', href: '/sheet-books', label: t('sidebar.nav.sheetBooks') },
      isMyBookVisible(currentLocale) && {
        key: 'myBook',
        href: '/my-book',
        label: t('myBook.name'),
        badge: t('myBook.badge'),
      },
      isKoreanSite && { key: 'customOrder', href: '/custom-order', label: t('nav.customOrder') },
    ];
    return items.filter((item): item is ServiceNavItem => Boolean(item));
  }, [eventSales.hasAny, eventSales.hasActive, currentLocale, isKoreanSite, t]);

  const navigate = (href: string) => (event?: MouseEvent) => {
    event?.preventDefault();
    router.push(href);
  };

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      searchInputRef.current?.focus();
      return;
    }
    router.push(`/categories?search=${encodeURIComponent(trimmed)}`);
    searchInputRef.current?.blur();
  };

  const handleLogout = async () => {
    try {
      if (googleAuth.isLoggedIn()) {
        googleAuth.logout();
      }
      await supabase.auth.signOut();
      window.location.reload();
    } catch (error) {
      console.error('로그아웃 오류:', error);
    }
  };

  const openCategoryOnHover = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    setCategoryOpen(true);
  };

  const closeCategoryOnLeave = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setCategoryOpen(false), 150);
  };

  const accountLinks = [
    { href: '/mypage', icon: 'ri-user-3-line', label: t('sidebar.nav.mypage') },
    { href: '/purchases', icon: 'ri-file-list-3-line', label: t('sidebar.nav.purchaseHistory') },
    ...(isKoreanSite ? [{ href: '/custom-order', icon: 'ri-edit-line', label: t('sidebar.nav.customOrder') }] : []),
    { href: '/customer-support', icon: 'ri-customer-service-2-line', label: t('nav.customerSupport') },
  ];

  const cartCount = cartItems.length;

  return (
    <div className="hidden md:block" suppressHydrationWarning>
      {/* 고정 헤더 높이만큼 본문을 밀어낸다 */}
      <div aria-hidden="true" className="h-[120px]" />

      <header className="fixed inset-x-0 top-0 z-50" suppressHydrationWarning>
        {/* 1단: 로고 · 검색 · 계정 */}
        <div className="relative z-10 bg-blue-700" suppressHydrationWarning>
          <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-4 px-4 sm:px-6 lg:gap-8 lg:px-8" suppressHydrationWarning>
            <a
              href="/"
              onClick={navigate('/')}
              className="flex flex-shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              aria-label={t('sidebar.site.name')}
            >
              <img src="/logo.png" alt={t('sidebar.site.name')} className="h-9 w-auto" suppressHydrationWarning />
              {isKoreanSite && (
                <h1 className="hidden whitespace-nowrap text-[22px] font-extrabold tracking-tight text-white lg:block" suppressHydrationWarning>
                  {t('sidebar.site.name')}
                </h1>
              )}
            </a>

            <form role="search" onSubmit={handleSearch} className="relative min-w-0 max-w-2xl flex-1">
              <i className="ri-search-line pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-gray-400" />
              <input
                ref={searchInputRef}
                type="search"
                enterKeyHint="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t('sidebar.search.placeholder')}
                aria-label={t('sidebar.search.placeholder')}
                className="h-11 w-full rounded-full border-0 bg-white pl-11 pr-24 text-[15px] text-gray-900 placeholder-gray-400 shadow-sm outline-none transition-shadow focus:ring-4 focus:ring-white/30 [&::-webkit-search-cancel-button]:hidden"
                suppressHydrationWarning
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  aria-label={t('mobile.search.clear')}
                  className="absolute right-12 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <i className="ri-close-line text-lg" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-12 top-1/2 hidden h-6 -translate-y-1/2 items-center rounded-md border border-gray-200 px-2 font-sans text-xs text-gray-400 lg:flex">
                  /
                </kbd>
              )}
              <button
                type="submit"
                aria-label={t('search.button')}
                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
              >
                <i className="ri-search-line text-lg" />
              </button>
            </form>

            <div className="ml-auto flex flex-shrink-0 items-center gap-1" suppressHydrationWarning>
              <div className="mr-2 hidden xl:block">
                <CashChargeHeaderButton user={user} />
              </div>
              <HeaderIconButton
                icon="ri-shopping-cart-2-line"
                label={t('nav.cart')}
                badge={cartCount}
                onClick={() => router.push('/cart')}
              />
              {user ? (
                <div ref={accountRef} className="relative">
                  <HeaderIconButton
                    icon="ri-user-3-line"
                    label={t('nav.mypage')}
                    expanded={accountOpen}
                    onClick={() => setAccountOpen((open) => !open)}
                  />
                  {accountOpen && (
                    <div className="absolute right-0 top-full mt-2 w-64 overflow-hidden rounded-2xl border border-gray-100 bg-white py-2 text-gray-700 shadow-xl">
                      <div className="mb-1 border-b border-gray-100 px-4 pb-3 pt-1">
                        <p className="truncate text-sm font-semibold text-gray-900">{user.email}</p>
                        <div className="mt-2 xl:hidden">
                          <CashChargeHeaderButton user={user} />
                        </div>
                      </div>
                      {accountLinks.map((link) => (
                        <a
                          key={link.href}
                          href={link.href}
                          onClick={navigate(link.href)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50"
                        >
                          <i className={`${link.icon} text-lg text-gray-400`} />
                          {link.label}
                        </a>
                      ))}
                      <div className="my-1 border-t border-gray-100" />
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-500 hover:bg-gray-50"
                      >
                        <i className="ri-logout-box-r-line text-lg text-gray-400" />
                        {t('sidebar.nav.logout')}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <HeaderIconButton
                    icon="ri-user-3-line"
                    label={t('nav.login')}
                    onClick={() => router.push('/auth/login')}
                  />
                  <button
                    type="button"
                    onClick={() => router.push('/auth/register')}
                    className="relative ml-1 h-9 whitespace-nowrap rounded-full bg-white px-4 text-sm font-bold text-blue-700 shadow-sm transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    suppressHydrationWarning
                  >
                    {t('header.signup')}
                    <SignupBonusBadge />
                  </button>
                </>
              )}
              <LanguageSelector variant="header" className="ml-1" />
            </div>
          </div>
        </div>

        {/* 2단: 카테고리 · 서비스 메뉴 (아래로 스크롤하면 1단 뒤로 숨는다) */}
        <nav
          aria-label={t('nav.categories')}
          aria-hidden={navHidden || undefined}
          className={`relative border-b border-gray-200 bg-white shadow-sm transition-transform duration-200 ease-out ${
            navHidden ? '-translate-y-full' : ''
          }`}
          suppressHydrationWarning
        >
          <div className="mx-auto flex h-12 max-w-7xl items-center gap-2 px-4 sm:px-6 lg:px-8" suppressHydrationWarning>
            <div
              ref={categoryRef}
              className="relative flex-shrink-0"
              onMouseEnter={openCategoryOnHover}
              onMouseLeave={closeCategoryOnLeave}
            >
              <button
                type="button"
                onClick={() => setCategoryOpen((open) => !open)}
                aria-expanded={categoryOpen}
                aria-haspopup="true"
                tabIndex={navHidden ? -1 : undefined}
                className={`-ml-3 flex h-9 items-center gap-1.5 rounded-full px-3 text-[15px] font-bold transition-colors ${
                  categoryOpen || activeGenre ? 'bg-blue-50 text-blue-700' : 'text-gray-900 hover:bg-gray-100'
                }`}
              >
                <i className="ri-menu-2-line text-lg" />
                <span className="whitespace-nowrap">{activeGenre ? activeGenre.label : t('nav.categories')}</span>
                <i className={`ri-arrow-down-s-line text-lg transition-transform ${categoryOpen ? 'rotate-180' : ''}`} />
              </button>

              <div
                className={`absolute left-0 top-full pt-2 transition duration-150 ${
                  categoryOpen ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1 opacity-0'
                }`}
              >
                <div className="w-[440px] rounded-2xl border border-gray-100 bg-white p-3 shadow-xl">
                  <p className="px-3 pb-2 pt-1 text-xs font-semibold text-gray-400">{t('nav.categories')}</p>
                  <div className="grid grid-cols-2 gap-1">
                    {genreItems.map((item) => {
                      const isActive = activeGenre?.id === item.id;
                      return (
                        <a
                          key={item.id}
                          href={item.href}
                          onClick={navigate(item.href)}
                          tabIndex={categoryOpen ? undefined : -1}
                          aria-current={isActive ? 'page' : undefined}
                          className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                            isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                          }`}
                        >
                          {item.label}
                          <i className={`ri-arrow-right-s-line ${isActive ? 'text-blue-400' : 'text-gray-300 group-hover:text-gray-400'}`} />
                        </a>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <span aria-hidden="true" className="h-5 w-px flex-shrink-0 bg-gray-200" />

            <div className="flex min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {serviceItems.map((item) => {
                const isActive = pathWithoutLocale.startsWith(item.match ?? item.href);
                return (
                  <a
                    key={item.key}
                    href={item.href}
                    onClick={navigate(item.href)}
                    tabIndex={navHidden ? -1 : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    className={`relative inline-flex h-12 flex-shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-[15px] font-semibold transition-colors ${
                      item.tone === 'sale'
                        ? 'text-red-600 hover:text-red-700'
                        : isActive
                          ? 'text-blue-700'
                          : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {item.live && (
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                      </span>
                    )}
                    {item.label}
                    {item.badge && (
                      <span className="rounded-full bg-fuchsia-500 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">
                        {item.badge}
                      </span>
                    )}
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className={`absolute inset-x-3 bottom-0 h-0.5 rounded-full ${item.tone === 'sale' ? 'bg-red-600' : 'bg-blue-700'}`}
                      />
                    )}
                  </a>
                );
              })}
            </div>

            <div className="hidden flex-shrink-0 items-center gap-5 text-sm text-gray-500 lg:flex">
              <a href="/guide" onClick={navigate('/guide')} tabIndex={navHidden ? -1 : undefined} className="hover:text-gray-900">
                {t('nav.guide')}
              </a>
              <a
                href="/customer-support"
                onClick={navigate('/customer-support')}
                tabIndex={navHidden ? -1 : undefined}
                className="hover:text-gray-900"
              >
                {t('nav.customerSupport')}
              </a>
            </div>
          </div>
        </nav>
      </header>
    </div>
  );
}
