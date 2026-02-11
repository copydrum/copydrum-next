'use client';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import LanguageSelector from './LanguageSelector';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { getLocaleFromPathname } from '@/lib/localeUrl';

interface HeaderProps {
  user?: User | null;
}

export default function Header({ user: propUser }: HeaderProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [user, setUser] = useState<User | null>(propUser || null);
  const [customOrderCategoryId, setCustomOrderCategoryId] = useState<string | null>(null);
  const router = useLocaleRouter();
  const pathname = usePathname();
  const currentLocale = getLocaleFromPathname(pathname);
  const isGlobalSite = currentLocale !== 'ko'; // Global site = any locale except Korean

  useEffect(() => {
    if (!propUser) {
      const getUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
      };
      getUser();

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
          setUser(session?.user ?? null);
        }
      );

      return () => subscription.unsubscribe();
    } else {
      setUser(propUser);
    }
  }, [propUser]);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      router.push(`/categories?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const isActive = (path: string) => {
    // Remove locale prefix from pathname for comparison
    const pathWithoutLocale = pathname.replace(/^\/(ko|ja|de|es|fr|hi|id|it|pt|ru|th|tr|uk|vi|zh-cn|zh-tw)/, '');
    const normalizedPath = pathWithoutLocale || '/';
    return normalizedPath === path;
  };

  useEffect(() => {
    let isMounted = true;

    const fetchCustomOrderCategory = async () => {
      try {
        const { data, error } = await supabase
          .from('categories')
          .select('id')
          .eq('name', '주문제작')
          .maybeSingle();

        if (!isMounted) {
          return;
        }

        if (error) {
          console.error('주문제작 카테고리 조회 실패:', error);
          return;
        }

        setCustomOrderCategoryId(data?.id ?? null);
      } catch (err) {
        if (isMounted) {
          console.error('주문제작 카테고리 연동 중 오류:', err);
        }
      }
    };

    fetchCustomOrderCategory();

    return () => {
      isMounted = false;
    };
  }, []);

  const customOrderLink = customOrderCategoryId
    ? `/categories?category=${customOrderCategoryId}`
    : '/custom-order';

  const isCustomOrderActive = () => {
    // Remove locale prefix from pathname for comparison
    const pathWithoutLocale = pathname.replace(/^\/(ko|ja|de|es|fr|hi|id|it|pt|ru|th|tr|uk|vi|zh-cn|zh-tw)/, '');
    const normalizedPath = pathWithoutLocale || '/';

    if (customOrderCategoryId) {
      const params = new URLSearchParams(window.location.search);
      return normalizedPath === '/categories' && params.get('category') === customOrderCategoryId;
    }

    return normalizedPath === '/custom-order';
  };

  const containerClassName = `hidden md:block bg-blue-700`;

  return (
    <div className={containerClassName}>
      <div className="mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        {/* Top Utility Row */}
        <div className="flex justify-end pt-4">
          <LanguageSelector />
        </div>

        {/* Logo, Search Row */}
        <div className="flex items-center justify-between gap-6 py-4">
          {/* Logo */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <img
                src="/logo.png"
                alt={t('site.name')}
                className={`h-12 w-auto cursor-pointer ${isGlobalSite ? '' : 'mr-3'}`}
                onClick={() => router.push('/')}
              />
              {!isGlobalSite && (
                <h1
                  className="text-2xl font-bold text-white cursor-pointer"
                  style={{ fontFamily: '"Noto Sans KR", "Malgun Gothic", sans-serif' }}
                  onClick={() => router.push('/')}
                >
                  {t('site.name')}
                </h1>
              )}
            </div>
          </div>

          {/* Search Bar */}
          <div className="flex flex-1 justify-end">
            <div className="flex-1 max-w-2xl">
              <div className="relative">
                <input
                  type="text"
                  placeholder={t('search.placeholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSearch();
                    }
                  }}
                  className="w-full px-6 py-3 text-base border-0 rounded-full focus:outline-none pr-12 bg-blue-50 placeholder-gray-400 text-gray-900"
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
        </div>

        {/* Navigation Menu - Below Search Bar */}
        <nav className="flex items-center justify-center space-x-8 pb-4">
          <button
            onClick={() => router.push('/')}
            className={`font-semibold text-lg whitespace-nowrap cursor-pointer transition-colors duration-200 ${isActive('/') ? 'text-white' : 'text-white hover:text-blue-200'
              }`}
          >
            {t('nav.home')}
          </button>
          <button
            onClick={() => router.push('/categories')}
            className={`font-semibold text-lg whitespace-nowrap cursor-pointer transition-colors duration-200 ${isActive('/categories') ? 'text-white' : 'text-white hover:text-blue-200'
              }`}
          >
            {t('nav.categories')}
          </button>
          <button
            onClick={() => router.push('/collections')}
            className={`font-semibold text-lg whitespace-nowrap cursor-pointer transition-colors duration-200 ${isActive('/collections') ? 'text-white' : 'text-white hover:text-blue-200'
              }`}
          >
            {t('nav.collections')}
          </button>
          <button
            onClick={() => router.push(customOrderLink)}
            className={`font-semibold text-lg whitespace-nowrap cursor-pointer transition-colors duration-200 ${isCustomOrderActive() ? 'text-white' : 'text-white hover:text-blue-200'
              }`}
          >
            {t('nav.customOrder')}
          </button>
        </nav>
      </div>
    </div>
  );
}


