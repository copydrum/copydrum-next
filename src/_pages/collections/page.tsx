'use client';

import { useState, useEffect } from 'react';
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
}

const ITEMS_PER_PAGE = 12;

export default function CollectionsPageClient() {
  const { t, i18n } = useTranslation();
  const router = useLocaleRouter();
  const [collections, setCollections] = useState<Collection[]>([]);
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

    fetchCollections();

    return () => subscription.unsubscribe();
  }, []);

  const fetchCollections = async () => {
    try {
      setLoading(true);

      // Fetch collections with sheet count
      const { data: collectionsData, error: collectionsError } = await supabase
        .from('collections')
        .select('id, title, description, title_translations, description_translations, thumbnail_url, original_price, sale_price, discount_percentage, slug, is_active')
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
          };
        })
      );

      setCollections(collectionsWithCounts);
    } catch (error) {
      console.error('Error fetching collections:', error);
    } finally {
      setLoading(false);
    }
  };

  // Pagination
  const totalPages = Math.ceil(collections.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedCollections = collections.slice(startIndex, startIndex + ITEMS_PER_PAGE);

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

          {/* Collections Grid */}
          {collections.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">{t('collectionsPage.empty.noCollections')}</p>
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
