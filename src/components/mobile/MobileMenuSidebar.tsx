'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import type { User } from '@supabase/supabase-js';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import type { Profile } from '../../lib/supabase';
import { googleAuth } from '../../lib/google';
import { getUserDisplayName } from '../../utils/userDisplayName';
import { isKoreanSiteHost } from '../../config/hostType';

interface Category {
  id: string;
  name: string;
  slug: string | null;
}

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

const baseMenuItems: NavItem[] = [
  { labelKey: 'nav.categories', href: '/categories', icon: 'ri-apps-line' },
  { labelKey: 'sidebar.nav.drumLesson', href: '/free-sheets', icon: 'ri-music-2-line' },
  { labelKey: 'sidebar.nav.collections', href: '/collections', icon: 'ri-stack-line' },
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
  const [categories, setCategories] = useState<Category[]>([]);

  // 호스트 타입을 컴포넌트 마운트 시 한 번만 계산
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsKoreanSite(isKoreanSiteHost(window.location.host));
    }
  }, []);

  // 카테고리 로드
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
        setCategories([]);
      }
    };

    if (isOpen) {
      void loadCategories();
    }
  }, [isOpen]);
  
  const menuItems = useMemo(() => {
    if (isKoreanSite) {
      return baseMenuItems.filter(item => item.labelKey !== 'nav.categories');
    }
    return baseMenuItems.filter(item => item.labelKey !== 'nav.customOrder' && item.labelKey !== 'nav.categories');
  }, [isKoreanSite]);

  // 장르 목록 생성
  const genreListKo = ['가요', '팝', '락', 'CCM', '트로트/성인가요', '재즈', 'J-POP', 'OST', '드럼솔로', '드럼커버'];
  const genreListEn = ['팝', '락', '가요', '재즈', 'J-POP', 'OST', 'CCM', '트로트/성인가요', '드럼솔로', '드럼커버'];
  // 한국어(ko)는 genreListKo, 영어(en)는 genreListEn, 나머지 모든 언어는 genreListEn(영어 순서) 사용
  const genreList = i18n.language === 'ko' ? genreListKo : genreListEn;

  // 카테고리 이름을 번역하는 함수
  const getCategoryName = (categoryName: string | null | undefined): string => {
    if (!categoryName) return '';
    if (i18n.language === 'ko') return categoryName;

    const categoryMap: Record<string, string> = {
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

    return categoryMap[categoryName] || categoryName;
  };

  // 장르 네비게이션 아이템 생성
  const genreNavItems = useMemo(() => {
    return genreList.map((genreKo) => {
      const category = categories.find((cat) => cat.name === genreKo);
      if (!category) return null;

      // slug 우선 사용, 없으면 fallback으로 id 사용
      const categoryParam = category.slug || category.id;

      return {
        id: category.id,
        label: getCategoryName(genreKo),
        href: `/categories?category=${categoryParam}`,
      };
    }).filter((item): item is { id: string; label: string; href: string } => item !== null);
  }, [genreList, categories, i18n.language, t]);

  // 현재 활성 카테고리 ID
  const searchParams = useSearchParams();
  const activeCategoryId = useMemo(() => {
    return searchParams?.get('category') ?? null;
  }, [searchParams]);

  const greeting = useMemo(() => {
    if (!user) {
      return t('auth.loginRequired');
    }
    const name = getUserDisplayName(profile, user.email || null);
    return t('mobile.menu.greeting', { name });
  }, [t, user, profile]);

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

  const handleNavigate = (href: string) => {
    router.push(href);
    onClose();
  };

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

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="absolute inset-y-0 left-0 flex h-full w-72 flex-col bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">{t('site.name')}</p>
            <p className="text-xs text-gray-500 mt-1">{greeting}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('mobile.menu.close')}
            className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <i className="ri-close-line text-xl" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
          {/* 장르 리스트 */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">
              {t('nav.categories')}
            </p>
            <div className="space-y-1">
              {genreNavItems.map((genre) => {
                const isActive = activeCategoryId === genre.id && pathname === '/categories';
                return (
                  <button
                    key={genre.id}
                    type="button"
                    onClick={() => handleNavigate(genre.href)}
                    className={`flex w-full items-center rounded-lg px-3 py-2 text-left transition-colors ${isActive
                        ? 'bg-blue-50 text-blue-600 border border-blue-200'
                        : 'bg-white text-gray-700 border border-gray-100 hover:bg-gray-50'
                      }`}
                  >
                    <span className="text-sm font-medium">{genre.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 기타 메뉴 아이템 */}
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <button
                key={item.href}
                type="button"
                onClick={() => handleNavigate(item.href)}
                className={`flex w-full items-center rounded-xl px-4 py-3 text-left transition-colors ${isActive
                    ? 'bg-blue-50 text-blue-600 border border-blue-200'
                    : 'bg-white text-gray-700 border border-gray-100 hover:bg-gray-50'
                  }`}
              >
                <i
                  className={`${item.icon} mr-3 text-lg ${isActive ? 'text-blue-500' : 'text-gray-400'
                    }`}
                />
                <span className="text-sm font-medium">{t(item.labelKey)}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-gray-100 px-5 py-4 pb-24 space-y-2">
          {user ? (
            <>
              <button
                type="button"
                onClick={() => handleNavigate('/mypage')}
                className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                {t('nav.mypage')}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center justify-center rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
              >
                <i className="ri-logout-box-line mr-2"></i>
                {t('nav.logout')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleNavigate('/auth/login')}
                className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                {t('nav.login')}
              </button>
              <button
                type="button"
                onClick={() => handleNavigate('/auth/register')}
                className="flex w-full items-center justify-center rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
              >
                {t('header.signup')}
              </button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}


