'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { formatCurrency, getSiteCurrency, convertFromKrw } from '@/lib/currency';
import MainHeader from '@/components/common/MainHeader';
import type { User } from '@supabase/supabase-js';

interface Collection {
  id: string;
  title: string;
  description: string;
  title_translations?: Record<string, string>;
  description_translations?: Record<string, string>;
  thumbnail_url: string;
  original_price: number;
  sale_price: number;
  discount_percentage: number;
  slug: string;
  is_active: boolean;
  sheet_count?: number;
  category_ids?: string[] | null;
}

interface Category {
  id: string;
  name: string;
  slug?: string | null;
}

const ITEMS_PER_PAGE = 12;

export default function CollectionsPageClient() {
  const { t, i18n } = useTranslation();
  const router = useLocaleRouter();
  const [allCollections, setAllCollections] = useState<Collection[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'copydrum.com';
  const currency = getSiteCurrency(hostname, i18n.language);
  const locale = i18n.language;

  useEffect(() => {
    // 사용자 인증 상태 로드
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    fetchCategories();
    fetchCollections();

    return () => subscription.unsubscribe();
  }, []);

  // URL 쿼리 파라미터에서 카테고리 필터 읽기
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const categoryParam = searchParams.get('category');
    if (categoryParam) {
      setSelectedCategoryId(categoryParam);
    }
  }, []);

  // 카테고리 필터 변경 시 페이지 1로 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategoryId]);

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug')
        .neq('name', '드럼레슨')
        .order('name');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchCollections = async () => {
    try {
      setLoading(true);

      // Fetch collections with category_ids and sheet count
      const { data: collectionsData, error: collectionsError } = await supabase
        .from('collections')
        .select('id, title, description, title_translations, description_translations, thumbnail_url, original_price, sale_price, discount_percentage, slug, is_active, category_ids')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (collectionsError) throw collectionsError;

      // Fetch sheet counts for each collection
      const collectionsWithCounts = await Promise.all(
        (collectionsData || []).map(async (collection) => {
          const { count } = await supabase
            .from('collection_sheets')
            .select('*', { count: 'exact', head: true })
            .eq('collection_id', collection.id);

          return {
            ...collection,
            sheet_count: count || 0,
            category_ids: Array.isArray(collection.category_ids) ? collection.category_ids : null,
          };
        })
      );

      setAllCollections(collectionsWithCounts);
    } catch (error) {
      console.error('Error fetching collections:', error);
    } finally {
      setLoading(false);
    }
  };

  // 카테고리별 필터링
  const filteredCollections = useMemo(() => {
    if (!selectedCategoryId) {
      return allCollections;
    }
    return allCollections.filter((collection) => {
      if (!collection.category_ids || collection.category_ids.length === 0) {
        return false;
      }
      return collection.category_ids.includes(selectedCategoryId);
    });
  }, [allCollections, selectedCategoryId]);

  // Pagination
  const totalPages = Math.ceil(filteredCollections.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedCollections = filteredCollections.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handleCategoryFilter = (categoryId: string | null) => {
    setSelectedCategoryId(categoryId);
    setCurrentPage(1);
    // URL 쿼리 파라미터 업데이트
    const url = new URL(window.location.href);
    if (categoryId) {
      url.searchParams.set('category', categoryId);
    } else {
      url.searchParams.delete('category');
    }
    window.history.pushState({}, '', url.toString());
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCollectionClick = (collection: Collection) => {
    // Use slug if available, otherwise use id
    const identifier = collection.slug || collection.id;
    console.log('[Collections Debug] Navigating to collection:', { slug: collection.slug, id: collection.id, identifier });
    router.push(`/collections/${identifier}`);
  };

  const getLocalizedTitle = (collection: Collection) => {
    if (locale === 'ko') {
      // Korean: use Korean title
      return collection.title;
    } else {
      // All other languages: use English translation
      if (collection.title_translations && collection.title_translations['en']) {
        return collection.title_translations['en'];
      }
      // Fallback to default title
      return collection.title;
    }
  };

  const getLocalizedDescription = (collection: Collection) => {
    if (locale === 'ko') {
      // Korean: use Korean description
      return collection.description;
    } else {
      // All other languages: use English translation
      if (collection.description_translations && collection.description_translations['en']) {
        return collection.description_translations['en'];
      }
      // Fallback to default description
      return collection.description;
    }
  };

  if (loading) {
    return (
      <>
        <MainHeader user={user} />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-gray-600">{t('collectionsPage.loading')}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <MainHeader user={user} />
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {t('collectionsPage.title')}
            </h1>
            <p className="text-gray-600">
              {t('collectionsPage.subtitle')}
            </p>
          </div>

          {/* Category Filter Tabs */}
          {categories.length > 0 && (
            <div className="mb-6">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleCategoryFilter(null)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedCategoryId === null
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {t('collectionsPage.category.all') || '전체'}
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => handleCategoryFilter(category.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedCategoryId === category.id
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
              {selectedCategoryId && (
                <p className="mt-3 text-sm text-gray-600">
                  {t('collectionsPage.category.filtered', { 
                    count: filteredCollections.length,
                    category: categories.find(c => c.id === selectedCategoryId)?.name || ''
                  }) || `${filteredCollections.length}개의 모음집`}
                </p>
              )}
            </div>
          )}

          {/* Collections Grid */}
          {filteredCollections.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">
                {selectedCategoryId 
                  ? (t('collectionsPage.empty.noCollectionsInCategory') || '이 카테고리에 해당하는 모음집이 없습니다.')
                  : t('collectionsPage.empty.noCollections')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {paginatedCollections.map((collection) => (
                <div
                  key={collection.id}
                  onClick={() => handleCollectionClick(collection)}
                  className="bg-white rounded-lg shadow-md overflow-hidden cursor-pointer transition-transform hover:scale-105 hover:shadow-lg"
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-square bg-gray-200">
                    {collection.thumbnail_url ? (
                      <img
                        src={collection.thumbnail_url}
                        alt={collection.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <i className="ri-image-line text-6xl"></i>
                      </div>
                    )}

                    {/* Badge */}
                    <div className="absolute top-2 left-2">
                      <span className="bg-blue-600 text-white text-xs font-semibold px-2 py-1 rounded">
                        {t('collectionsPage.collection.badge')}
                      </span>
                    </div>

                    {/* Discount Badge */}
                    {collection.discount_percentage > 0 && (
                      <div className="absolute top-2 right-2">
                        <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
                          {t('collectionsPage.collection.discount', { percentage: collection.discount_percentage })}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                      {getLocalizedTitle(collection)}
                    </h3>

                    {getLocalizedDescription(collection) && (
                      <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                        {getLocalizedDescription(collection)}
                      </p>
                    )}

                    {/* Sheet Count */}
                    <div className="text-sm text-gray-500 mb-3">
                      {t('collectionsPage.collection.songs', { count: collection.sheet_count || 0 })}
                    </div>

                    {/* Price */}
                    <div className="flex items-center justify-between">
                      {collection.sale_price > 0 ? (
                        <div className="flex flex-col">
                          {collection.original_price > collection.sale_price && (
                            <span className="text-xs text-gray-400 line-through">
                              {formatCurrency(convertFromKrw(collection.original_price, currency, locale), currency)}
                            </span>
                          )}
                          <span className="text-lg font-bold text-blue-600">
                            {formatCurrency(convertFromKrw(collection.sale_price, currency, locale), currency)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-lg font-bold text-green-600">
                          {t('collectionsPage.collection.free')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center space-x-2">
              <button
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  currentPage === 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                }`}
              >
                <i className="ri-arrow-left-s-line"></i>
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                if (
                  page === 1 ||
                  page === totalPages ||
                  (page >= currentPage - 2 && page <= currentPage + 2)
                ) {
                  return (
                    <button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        currentPage === page
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                      }`}
                    >
                      {page}
                    </button>
                  );
                } else if (
                  page === currentPage - 3 ||
                  page === currentPage + 3
                ) {
                  return (
                    <span key={page} className="px-2 text-gray-400">
                      ...
                    </span>
                  );
                }
                return null;
              })}

              <button
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  currentPage === totalPages
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                }`}
              >
                <i className="ri-arrow-right-s-line"></i>
              </button>
            </div>
          )}

          {/* Page Info */}
          {!loading && totalPages > 1 && (
            <div className="mt-3 text-center text-sm text-gray-500">
              {t('collectionsPage.pagination.pageInfo', {
                current: currentPage,
                total: totalPages,
                defaultValue: '{{current}} / {{total}}',
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
