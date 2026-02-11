'use client';
import { useMemo, useState, useEffect, type KeyboardEvent, type ChangeEvent } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { googleAuth } from '../../lib/google';
import LanguageSelector from './LanguageSelector';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { getLocaleFromPathname, removeLocaleFromPathname } from '@/lib/localeUrl';
import { useCart } from '../../hooks/useCart';

interface MainHeaderProps {
  user?: User | null;
}

export default function MainHeader({ user }: MainHeaderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState<Array<{ id: string; name: string; slug: string | null }>>([]);
  const router = useLocaleRouter();
  const { t, i18n } = useTranslation();
  const pathname = usePathname();
  const currentLocale = getLocaleFromPathname(pathname);
  const isGlobalSite = currentLocale !== 'ko';
  const isKoreanSite = currentLocale === 'ko';
  const { cartItems } = useCart();
  // location.search dependency is implicit because usePathname() triggers re-render

  // 장르 목록 (순서대로) - 한글 원본 (한글 사이트용)
  const genreListKo = ['가요', '팝', '락', 'CCM', '트로트/성인가요', '재즈', 'J-POP', 'OST', '드럼솔로', '드럼커버'];
  // 영문 사이트용 장르 순서 (기준 순서)
  const genreListEn = ['팝', '락', '가요', '재즈', 'J-POP', 'OST', 'CCM', '트로트/성인가요', '드럼솔로', '드럼커버'];
  // 현재 언어에 맞는 장르 목록 가져오기
  // 한국어(ko)는 genreListKo, 영어(en)는 genreListEn, 나머지 모든 언어는 genreListEn(영어 순서) 사용
  const genreList = i18n.language === 'ko' ? genreListKo : genreListEn;

  // 장르 이름을 번역하는 함수
  const getGenreName = (genreKo: string): string => {
    if (i18n.language === 'ko') return genreKo;

    // categoriesPage.categories 키를 사용 (categories 페이지와 동일)
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

  // 카테고리 데이터 로드
  useEffect(() => {
    const loadCategories = async () => {
      try {
        // slug 컬럼이 없을 수도 있으므로 먼저 id, name만 조회
        let { data, error } = await supabase
          .from('categories')
          .select('id, name')
          .neq('name', '드럼레슨');

        if (error) throw error;

        // slug 컬럼 존재 여부 확인 후 재조회
        if (data && data.length > 0) {
          const { data: dataWithSlug, error: slugError } = await supabase
            .from('categories')
            .select('id, name, slug')
            .neq('name', '드럼레슨');

          // slug 컬럼이 있으면 slug 포함 데이터 사용, 없으면 기본 데이터 사용
          if (!slugError && dataWithSlug) {
            setCategories(dataWithSlug);
          } else {
            // slug 없으면 null로 처리
            setCategories(data.map(cat => ({ ...cat, slug: null })));
          }
        } else {
          setCategories(data || []);
        }
      } catch (error) {
        console.error('카테고리 로드 오류:', error);
        // 에러 발생해도 빈 배열로 초기화
        setCategories([]);
      }
    };

    loadCategories();
  }, []);

  // 현재 활성 장르 ID 가져오기 (URL 쿼리 파라미터 기반)
  const searchParams = useSearchParams();
  const activeCategoryId = useMemo(() => {
    const categoryParam = searchParams?.get('category') ?? null;

    // categories 페이지에서만 활성 상태 표시 (locale prefix 제거 후 비교)
    const pathWithoutLocale = removeLocaleFromPathname(pathname);
    if (pathWithoutLocale === '/categories' && categoryParam) {
      return categoryParam;
    }

    return null;
  }, [searchParams, pathname]);

  // 장르 네비게이션 아이템 생성
  const genreNavItems = useMemo(() => {
    return genreList.map((genreKo) => {
      const category = categories.find((cat) => cat.name === genreKo);
      if (!category) return null;

      // slug 우선 사용, 없으면 fallback으로 id 사용
      const categoryParam = category.slug || category.id;

      return {
        id: category.id,
        label: getGenreName(genreKo),
        href: `/categories?category=${categoryParam}`,
      };
    }).filter((item): item is { id: string; label: string; href: string } => item !== null);
  }, [genreList, categories, i18n.language, t]);

  const navItems = useMemo(
    () => [...genreNavItems],
    [genreNavItems],
  );

  const containerClassName = useMemo(() => {
    const classes = ['hidden', 'md:block', 'bg-blue-700'];
    return classes.join(' ');
  }, []);

  const handleSearch = () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      return;
    }
    router.push(`/categories?search=${encodeURIComponent(trimmed)}`);
  };

  const handleKeyPress = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSearch();
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  const handleLogout = async () => {
    try {
      // 구글 로그아웃
      if (googleAuth.isLoggedIn()) {
        googleAuth.logout();
      }

      // Supabase 로그아웃
      await supabase.auth.signOut();
      window.location.reload();
    } catch (error) {
      console.error('로그아웃 오류:', error);
    }
  };

  return (
    <div className={containerClassName} suppressHydrationWarning>
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col gap-4 py-4" suppressHydrationWarning>
        <div className="flex justify-end items-center gap-3" suppressHydrationWarning>
          {/* User Action Buttons */}
          <div className="flex items-center gap-2" suppressHydrationWarning>
            {user ? (
              <>
                <button
                  onClick={() => router.push('/custom-order')}
                  className="text-white hover:text-purple-300 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors cursor-pointer"
                  suppressHydrationWarning
                >
                  {t('sidebar.nav.customOrder')}
                </button>
                <button
                  onClick={() => router.push('/mypage')}
                  className="text-white hover:text-purple-300 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors cursor-pointer"
                  suppressHydrationWarning
                >
                  {t('sidebar.nav.mypage')}
                </button>
                <button
                  onClick={() => router.push('/purchases')}
                  className="text-white hover:text-purple-300 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors cursor-pointer"
                  suppressHydrationWarning
                >
                  {t('sidebar.nav.purchaseHistory')}
                </button>
                <button
                  onClick={() => router.push('/cart')}
                  className="relative text-white hover:text-purple-300 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors cursor-pointer"
                  suppressHydrationWarning
                >
                  {t('sidebar.nav.cart')}
                  {cartItems.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                      {cartItems.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={handleLogout}
                  className="text-white hover:text-purple-300 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors cursor-pointer"
                  suppressHydrationWarning
                >
                  {t('sidebar.nav.logout')}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => router.push('/cart')}
                  className="relative text-white hover:text-purple-300 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors cursor-pointer"
                  suppressHydrationWarning
                >
                  {t('sidebar.nav.cart')}
                  {cartItems.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                      {cartItems.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => router.push('/auth/login')}
                  className="text-white hover:text-purple-300 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors cursor-pointer"
                  suppressHydrationWarning
                >
                  {t('sidebar.nav.login')}
                </button>
                <button
                  onClick={() => router.push('/auth/register')}
                  className="text-white hover:text-purple-300 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors cursor-pointer"
                  suppressHydrationWarning
                >
                  {t('sidebar.header.signup')}
                </button>
              </>
            )}
          </div>
          <LanguageSelector />
        </div>
        {/* Logo, Search & Cart Row */}
        <div className="flex items-center relative">
          {/* Logo */}
          <div className="flex flex-col -ml-4 absolute left-0">
            <div className="flex items-center">
              <img
                src="/logo.png"
                alt={t('sidebar.site.name')}
                className={`h-12 w-auto cursor-pointer ${isGlobalSite ? '' : 'mr-3'}`}
                onClick={() => router.push('/')}
                suppressHydrationWarning
              />
              {!isGlobalSite && (
                <h1
                  className="text-2xl font-bold text-white cursor-pointer"
                  style={{ fontFamily: '"Noto Sans KR", "Malgun Gothic", sans-serif' }}
                  onClick={() => router.push('/')}
                  suppressHydrationWarning
                >
                  {t('sidebar.site.name')}
                </h1>
              )}
            </div>
            <span className="text-xs text-white/80 mt-0.5 ml-0.5" suppressHydrationWarning>
              {t('sidebar.header.tagline')}
            </span>
          </div>

          {/* Search Bar */}
          <div className="flex-1 max-w-2xl mx-auto">
            <div className="relative">
              <input
                type="text"
                placeholder={t('sidebar.search.placeholder')}
                value={searchQuery}
                onChange={handleChange}
                onKeyDown={handleKeyPress}
                className="w-full px-6 py-3 text-base border-0 rounded-full focus:outline-none pr-12 bg-blue-50 placeholder-gray-400 text-gray-900"
                suppressHydrationWarning
              />
              <button
                onClick={handleSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-blue-700 cursor-pointer transition-colors duration-200"
              >
                <i className="ri-search-line text-xl"></i>
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex items-center justify-center space-x-8 pb-2" suppressHydrationWarning>
          {navItems.map((item) => {
            const isActive = activeCategoryId === item.id;
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={(event) => {
                  event.preventDefault();
                  router.push(item.href);
                }}
                className={`font-semibold text-lg whitespace-nowrap cursor-pointer transition-all duration-200 ${
                  isActive
                    ? 'text-purple-300 underline'
                    : 'text-white hover:text-purple-300 hover:underline'
                }`}
                suppressHydrationWarning
              >
                {item.label}
              </a>
            );
          })}
          {/* Drum Lesson Menu */}
          <button
            onClick={() => router.push('/free-sheets')}
            className={`font-semibold text-lg whitespace-nowrap cursor-pointer transition-all duration-200 ${
              removeLocaleFromPathname(pathname).startsWith('/free-sheets')
                ? 'text-purple-300 underline'
                : 'text-white hover:text-purple-300 hover:underline'
            }`}
            suppressHydrationWarning
          >
            {t('sidebar.nav.drumLesson')}
          </button>
          {/* Collections Menu */}
          <button
            onClick={() => router.push('/collections')}
            className={`font-semibold text-lg whitespace-nowrap cursor-pointer transition-all duration-200 ${
              removeLocaleFromPathname(pathname).startsWith('/collections')
                ? 'text-purple-300 underline'
                : 'text-white hover:text-purple-300 hover:underline'
            }`}
            suppressHydrationWarning
          >
            {t('sidebar.nav.collections')}
          </button>
        </nav>
      </div>
    </div>
  );
}

