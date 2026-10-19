'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import type { User } from '@supabase/supabase-js';
import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import type { Profile } from '../../lib/supabase';
import { googleAuth } from '../../lib/google';
import { getUserDisplayName } from '../../utils/userDisplayName';
import { isKoreanSiteHost } from '../../config/hostType';
import {
  COLLECTIONS_PUBLIC_ENABLED,
  DRUM_LESSON_BOOKS_PUBLIC_ENABLED,
  FREE_LESSONS_PUBLIC_ENABLED,
  SHEET_BOOKS_PUBLIC_ENABLED,
  isMyBookVisible,
} from '@/config/featureFlags';
import { CashChargeMenuCard } from '../cash/CashChargeEntry';
import { SignupBonusBadge } from '../auth/SignupBonus';
import { useEventSales } from '../../hooks/useEventSales';
import LanguageSelector from '../common/LanguageSelector';
import BrandLogo from '../common/BrandLogo';
import { buildGenreNavItems, useGenreCategories } from '@/hooks/useGenreCategories';
import { removeLocaleFromPathname } from '@/lib/localeUrl';

interface MobileMenuSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  user?: User | null;
}

interface NavItem {
  labelKey: string;
  href: string;
  icon: string;
}

const TRANSITION_MS = 280;

const supportLinks: { labelKey: string; href: string }[] = [
  { labelKey: 'footer.guide', href: '/guide' },
  { labelKey: 'footer.faq', href: '/customer-support' },
  { labelKey: 'footer.contact', href: '/customer-support?tab=contact' },
  { labelKey: 'footer.refundPolicy', href: '/policy/refund' },
  { labelKey: 'footer.terms', href: '/policy/terms' },
  { labelKey: 'footer.privacy', href: '/policy/privacy' },
  { labelKey: 'footer.businessInfo', href: '/company/business-info' },
];

const baseMenuItems: NavItem[] = [
  { labelKey: 'sidebar.nav.collections', href: '/collections', icon: 'ri-stack-line' },
  { labelKey: 'freeLessons.nav.label', href: '/free-lessons', icon: 'ri-play-circle-line' },
  { labelKey: 'sidebar.nav.drumLesson', href: '/free-sheets', icon: 'ri-book-2-line' },
  { labelKey: 'sidebar.nav.sheetBooks', href: '/sheet-books', icon: 'ri-book-marked-line' },
  { labelKey: 'myBook.name', href: '/my-book', icon: 'ri-book-open-line' },
  { labelKey: 'nav.customOrder', href: '/custom-order', icon: 'ri-edit-line' },
  { labelKey: 'sidebar.nav.purchaseHistory', href: '/purchases', icon: 'ri-file-list-3-line' },
];

export default function MobileMenuSidebar({
  isOpen,
  onClose,
  user,
}: MobileMenuSidebarProps) {
  const router = useLocaleRouter();
  const pathname = usePathname();
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isKoreanSite, setIsKoreanSite] = useState<boolean>(false);
  const categories = useGenreCategories(isOpen);
  const eventSales = useEventSales();

  // 닫힘 애니메이션이 끝날 때까지 DOM을 유지한다
  const [rendered, setRendered] = useState(isOpen);
  const [visible, setVisible] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const historyPushedRef = useRef(false);
  const historyTokenRef = useRef<string | null>(null);
  const pendingHrefRef = useRef<string | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const routerRef = useRef(router);
  routerRef.current = router;

  // 호스트 타입을 컴포넌트 마운트 시 한 번만 계산
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsKoreanSite(isKoreanSiteHost(window.location.host));
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setRendered(true);
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    setVisible(false);
    const timer = window.setTimeout(() => setRendered(false), TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  // 열려 있는 동안 배경 스크롤 잠금 + ESC 닫기
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // 뒤로가기(안드로이드)로 메뉴가 닫히도록 열 때 히스토리 항목을 하나 쌓는다
  useEffect(() => {
    if (!isOpen) {
      historyTokenRef.current = null;
      // 캐쉬 충전 모달 등 다른 경로로 닫힌 경우 쌓아 둔 항목을 되돌린다
      if (historyPushedRef.current) {
        historyPushedRef.current = false;
        window.history.back();
      }
      return;
    }

    // 열 때마다 새 토큰: StrictMode 이중 실행에서는 한 번만 쌓고,
    // 새로고침 뒤 남아 있는 이전 항목은 내 항목으로 착각하지 않는다
    historyTokenRef.current ??= `${Date.now()}-${Math.random()}`;
    if (window.history.state?.copydrumMobileMenu !== historyTokenRef.current) {
      window.history.pushState({ ...window.history.state, copydrumMobileMenu: historyTokenRef.current }, '');
    }
    historyPushedRef.current = true;

    const handlePopState = () => {
      if (!historyPushedRef.current) return;
      historyPushedRef.current = false;
      onCloseRef.current();
      const href = pendingHrefRef.current;
      pendingHrefRef.current = null;
      if (href) routerRef.current.push(href);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isOpen]);

  /** 메뉴용 히스토리 항목을 먼저 지운 뒤 이동해야 뒤로가기가 이전 페이지로 정확히 돌아간다 */
  const requestClose = useCallback(
    (href?: string) => {
      if (historyPushedRef.current) {
        pendingHrefRef.current = href ?? null;
        window.history.back();
        return;
      }
      onClose();
      if (href) router.push(href);
    },
    [onClose, router],
  );
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  const menuItems = useMemo(() => {
    let items = baseMenuItems;
    if (!COLLECTIONS_PUBLIC_ENABLED) {
      items = items.filter((item) => item.href !== '/collections');
    }
    if (!SHEET_BOOKS_PUBLIC_ENABLED) {
      items = items.filter((item) => item.href !== '/sheet-books');
    }
    if (!DRUM_LESSON_BOOKS_PUBLIC_ENABLED) {
      items = items.filter((item) => item.href !== '/free-sheets');
    }
    if (!FREE_LESSONS_PUBLIC_ENABLED) {
      items = items.filter((item) => item.href !== '/free-lessons');
    }
    if (!isMyBookVisible(i18n.language)) {
      items = items.filter((item) => item.href !== '/my-book');
    }
    if (isKoreanSite) {
      return items;
    }
    return items.filter(item => item.labelKey !== 'nav.customOrder');
  }, [isKoreanSite, i18n.language]);

  const genreNavItems = useMemo(
    () => buildGenreNavItems(categories, i18n.language, t),
    [categories, i18n.language, t],
  );

  // 현재 활성 카테고리 (URL에는 slug 또는 id가 들어온다)
  const searchParams = useSearchParams();
  const activeCategoryParam = searchParams?.get('category') ?? null;
  const pathWithoutLocale = removeLocaleFromPathname(pathname);
  const isCategoriesPage = pathWithoutLocale.startsWith('/categories') && !searchParams?.get('search');

  const displayName = useMemo(
    () => (user ? getUserDisplayName(profile, user.email || null) : ''),
    [user, profile],
  );

  // 프로필 정보 로드
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    const loadProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('display_name, email, name')
          .eq('id', user.id)
          .maybeSingle();

        if (error) {
          // RLS 또는 권한 오류 시 user metadata로 fallback
          console.warn('모바일 프로필 조회 실패, fallback 사용:', error.message);
          setProfile({
            id: user.id,
            email: user.email || '',
            name: user.user_metadata?.name as string || '',
            display_name: user.user_metadata?.display_name as string || null,
            role: 'user',
            created_at: user.created_at,
            updated_at: user.created_at,
          });
          return;
        }

        if (data) {
          setProfile({
            id: user.id,
            email: data.email || user.email || '',
            name: data.name || '',
            display_name: data.display_name || null,
            role: 'user',
            created_at: user.created_at,
            updated_at: user.created_at,
          });
        } else {
          // 프로필이 아직 생성되지 않은 경우 user metadata로 fallback
          setProfile({
            id: user.id,
            email: user.email || '',
            name: user.user_metadata?.name as string || '',
            display_name: null,
            role: 'user',
            created_at: user.created_at,
            updated_at: user.created_at,
          });
        }
      } catch (error) {
        console.error('모바일 프로필 로드 오류:', error);
      }
    };

    if (isOpen) {
      void loadProfile();
    }
  }, [isOpen, user]);

  const handleLogout = async () => {
    try {
      // 구글 로그아웃
      if (googleAuth.isLoggedIn()) {
        googleAuth.logout();
      }

      // Supabase 로그아웃
      await supabase.auth.signOut();
      onClose();
      window.location.reload();
    } catch (error) {
      console.error('로그아웃 오류:', error);
    }
  };

  if (!rendered) {
    return null;
  }

  const sectionTitle = 'px-1 text-[13px] font-bold text-gray-900';

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => requestClose()}
        aria-hidden="true"
      />
      <aside
        className={`absolute inset-y-0 left-0 flex h-full w-[86vw] max-w-[340px] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          visible ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={t('site.name')}
      >
        <div className="bg-ink px-4 pb-4 text-white">
          <div className="flex h-14 items-center justify-between">
            <button type="button" onClick={() => requestClose('/')} aria-label={t('mobile.header.goHome', { site: t('site.name') })}>
              <BrandLogo size={30} />
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => requestClose()}
              aria-label={t('mobile.menu.close')}
              className="-mr-1.5 flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition-colors active:bg-white/15"
            >
              <i className="ri-close-line text-2xl" />
            </button>
          </div>

          {user ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => requestClose('/mypage')}
                className="flex w-full items-center gap-3 rounded-2xl text-left"
              >
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-pink-500 text-base font-bold">
                  {displayName.charAt(0).toUpperCase() || <i className="ri-user-3-line" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{displayName}</span>
                  <span className="block text-xs text-white/60">{t('nav.mypage')}</span>
                </span>
                <i className="ri-arrow-right-s-line text-xl text-white/50" />
              </button>
              <CashChargeMenuCard user={user} onBeforeOpen={() => requestClose()} />
            </div>
          ) : (
            <div>
              <p className="mb-3 text-[13px] text-white/70">{t('mobile.menu.loginPrompt')}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => requestClose('/auth/login')}
                  className="rounded-xl bg-white py-2.5 text-sm font-bold text-ink transition-colors active:bg-white/90"
                >
                  {t('nav.login')}
                </button>
                <button
                  type="button"
                  onClick={() => requestClose('/auth/register')}
                  className="relative rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white transition-colors active:bg-blue-700"
                >
                  {t('header.signup')}
                  <SignupBonusBadge variant="cornerSm" />
                </button>
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          {/* 주요 메뉴 */}
          <div className="grid grid-cols-3 gap-2">
            {eventSales.hasAny && (
              <button
                type="button"
                onClick={() => requestClose('/event-sale')}
                className="relative flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-rose-50 px-1 py-3 text-rose-600 transition-colors active:bg-rose-100"
              >
                <i className="ri-timer-flash-line text-[22px] leading-none" />
                <span className="text-center text-xs font-bold leading-tight">{t('eventSale.nav')}</span>
                {eventSales.hasActive && (
                  <span className="absolute right-2.5 top-2.5 flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-600" />
                    <span className="sr-only">{t('eventSale.badge.live')}</span>
                  </span>
                )}
              </button>
            )}
            {menuItems.map((item) => {
              const isActive = pathWithoutLocale === item.href;
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => requestClose(item.href)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-3 transition-colors ${
                    isActive ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200' : 'bg-gray-50 text-gray-800 active:bg-gray-100'
                  }`}
                >
                  <i className={`${item.icon} text-[22px] leading-none ${isActive ? 'text-blue-600' : 'text-blue-600/90'}`} />
                  <span className="text-center text-xs font-semibold leading-tight">{t(item.labelKey)}</span>
                </button>
              );
            })}
          </div>

          {/* 장르 */}
          <section className="mt-6">
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className={sectionTitle}>{t('nav.categories')}</h2>
              <button
                type="button"
                onClick={() => requestClose('/categories')}
                className="flex items-center text-xs font-medium text-gray-500 active:text-gray-800"
              >
                {t('home.viewAll')}
                <i className="ri-arrow-right-s-line text-base" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {genreNavItems.map((genre) => {
                const isActive =
                  isCategoriesPage &&
                  activeCategoryParam !== null &&
                  (activeCategoryParam === genre.id || activeCategoryParam === genre.slug);
                return (
                  <button
                    key={genre.id}
                    type="button"
                    onClick={() => requestClose(genre.href)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors ${
                      isActive ? 'bg-ink text-white' : 'border border-gray-200 bg-white text-gray-700 active:bg-gray-50'
                    }`}
                  >
                    {genre.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 고객 지원 · 약관 */}
          <section className="mt-6 border-t border-gray-100 pt-5">
            <h2 className={`${sectionTitle} mb-1.5`}>{t('footer.support')}</h2>
            <div className="grid grid-cols-2 gap-x-2">
              {supportLinks.map((link) => (
                <button
                  key={link.href}
                  type="button"
                  onClick={() => requestClose(link.href)}
                  className={`rounded-lg px-1 py-2 text-left text-[13px] active:bg-gray-50 ${
                    link.href === '/policy/privacy' ? 'font-semibold text-gray-900' : 'text-gray-600'
                  }`}
                >
                  {t(link.labelKey)}
                </button>
              ))}
            </div>
          </section>

          <div className="mt-4">
            <LanguageSelector variant="menu" />
          </div>

          {user && (
            <button
              type="button"
              onClick={handleLogout}
              className="mt-4 flex items-center gap-1.5 px-1 py-2 text-[13px] text-gray-500 active:text-gray-800"
            >
              <i className="ri-logout-box-r-line text-base" />
              {t('nav.logout')}
            </button>
          )}
        </nav>
      </aside>
    </div>
  );
}
