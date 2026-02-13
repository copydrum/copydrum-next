'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { formatCurrency, getSiteCurrency, convertFromKrw } from '@/lib/currency';
import MainHeader from '@/components/common/MainHeader';
import { useDialogStore } from '@/stores/dialogStore';
import { useAuthStore } from '@/stores/authStore';
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
}

interface DrumSheet {
  id: string;
  title: string;
  artist: string;
  price: number;
  thumbnail_url?: string;
  preview_image_url?: string;
  difficulty?: string;
  slug: string;
}

interface CollectionDetailClientProps {
  slug: string;
}

export default function CollectionDetailClient({ slug }: CollectionDetailClientProps) {
  const { t, i18n } = useTranslation();
  const router = useLocaleRouter();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [sheets, setSheets] = useState<DrumSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const { showAlert } = useDialogStore();
  const { user: authUser } = useAuthStore();
  const [purchasing, setPurchasing] = useState(false);

  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'copydrum.com';
  const currency = getSiteCurrency(hostname, i18n.language);
  const locale = i18n.language;

  // 상세페이지 진입 시 스크롤을 최상단으로 이동
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    fetchUserAndCollection();
  }, [slug]);

  const fetchUserAndCollection = async () => {
    try {
      setLoading(true);

      // Fetch user
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      // Validate slug
      if (!slug) {
        console.error('[Collections Debug] ❌ Slug is undefined or empty');
        setCollection(null);
        setLoading(false);
        return;
      }

      // Decode URL-encoded slug
      const decodedSlug = decodeURIComponent(slug);
      console.log('[Collections Debug] Original slug:', slug);
      console.log('[Collections Debug] Decoded slug:', decodedSlug);
      console.log('[Collections Debug] Fetching collection with slug:', decodedSlug);

      let collectionData = null;

      // Strategy 1: Try to fetch by slug first (if slug column exists)
      try {
        const { data, error } = await supabase
          .from('collections')
          .select('*')
          .eq('slug', decodedSlug)
          .eq('is_active', true)
          .maybeSingle();

        if (!error && data) {
          console.log('[Collections Debug] ✅ Found by slug:', data);
          collectionData = data;
        } else {
          console.log('[Collections Debug] Slug fetch failed:', error?.message || 'No data');
        }
      } catch (err) {
        console.log('[Collections Debug] Slug column might not exist:', err);
      }

      // Strategy 2: If not found by slug, try by id (if slug is a UUID)
      if (!collectionData) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(decodedSlug)) {
          console.log('[Collections Debug] Trying to fetch by id (UUID):', decodedSlug);

          const { data, error } = await supabase
            .from('collections')
            .select('*')
            .eq('id', decodedSlug)
            .eq('is_active', true)
            .maybeSingle();

          if (!error && data) {
            console.log('[Collections Debug] ✅ Found by id:', data);
            collectionData = data;
          } else {
            console.error('[Collections Debug] ID fetch error:', error);
          }
        } else {
          console.log('[Collections Debug] Not a UUID, skipping id lookup');
        }
      }

      // Strategy 3: If still not found, try to find by title (case-insensitive)
      if (!collectionData && decodedSlug) {
        console.log('[Collections Debug] Trying to fetch by title match:', decodedSlug);

        const { data, error } = await supabase
          .from('collections')
          .select('*')
          .eq('is_active', true);

        if (!error && data && data.length > 0) {
          // Try to find by slug-like title match
          const slugified = decodedSlug.toLowerCase().replace(/-/g, ' ');
          const slugLower = decodedSlug.toLowerCase();

          const match = data.find(c => {
            const title = c.title || '';
            const titleLower = title.toLowerCase();
            const titleSlugified = titleLower.replace(/\s+/g, '-');

            return titleLower.includes(slugified) || titleSlugified.includes(slugLower);
          });

          if (match) {
            console.log('[Collections Debug] ✅ Found by title match:', match);
            collectionData = match;
          }
        }
      }

      if (!collectionData) {
        console.error('[Collections Debug] ❌ Collection not found with slug:', decodedSlug);
        setCollection(null);
        setLoading(false);
        return;
      }

      console.log('[Collections Debug] ✅ Final collection data:', collectionData);
      setCollection(collectionData);

      // Fetch sheets in collection
      console.log('[Collections Debug] Fetching sheets for collection:', collectionData.id);

      const { data: collectionSheets, error: sheetsError } = await supabase
        .from('collection_sheets')
        .select(`
          drum_sheet_id,
          drum_sheets (
            id,
            title,
            artist,
            price,
            thumbnail_url,
            preview_image_url,
            difficulty,
            slug
          )
        `)
        .eq('collection_id', collectionData.id);

      if (sheetsError) {
        console.error('[Collections Debug] ⚠️ Sheets fetch error:', sheetsError);
        console.log('[Collections Debug] Continuing without sheets...');
        setSheets([]); // Set empty array instead of returning
      } else {
        const sheetsData = (collectionSheets || [])
          .map((cs: any) => cs.drum_sheets)
          .filter(Boolean);

        console.log('[Collections Debug] ✅ Sheets fetched:', sheetsData.length, 'sheets');
        setSheets(sheetsData);
      }
    } catch (error) {
      console.error('[Collections Debug] ❌ Fatal error:', error);
    } finally {
      console.log('[Collections Debug] Setting loading to false');
      setLoading(false);
    }
  };

  // 컬렉션 바로구매: 할인가로 주문 생성 후 결제 페이지로 이동
  const handleBuyCollection = async () => {
    if (!authUser) {
      await showAlert(t('cart.loginRequired'));
      router.push('/auth/login');
      return;
    }

    if (!collection || sheets.length === 0) {
      await showAlert(t('collectionsDetail.errors.collectionNotFound'));
      return;
    }

    setPurchasing(true);
    try {
      // 할인가를 각 악보에 비례 배분
      const totalIndividual = sheets.reduce((sum, s) => sum + s.price, 0);
      const salePrice = collection.sale_price;

      const orderItems = sheets.map((sheet, index) => {
        // 마지막 아이템은 나머지 금액으로 (반올림 오차 방지)
        let itemPrice: number;
        if (index === sheets.length - 1) {
          const previousSum = sheets.slice(0, index).reduce((sum, s) => {
            return sum + Math.round((s.price / totalIndividual) * salePrice);
          }, 0);
          itemPrice = salePrice - previousSum;
        } else {
          itemPrice = Math.round((sheet.price / totalIndividual) * salePrice);
        }

        return {
          sheetId: sheet.id,
          title: sheet.title,
          price: itemPrice,
        };
      });

      const response = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: authUser.id,
          items: orderItems,
          amount: salePrice,
          description: `${t('collectionsDetail.badge')}: ${getLocalizedTitle(collection)} (${sheets.length}${t('collectionsDetail.includedSheets.unit') || '곡'})`,
        }),
      });

      const result = await response.json();

      if (result.success && result.orderId) {
        router.push(`/payments/${result.orderId}`);
      } else {
        await showAlert(result.error || t('collectionsDetail.errors.purchaseFailed'));
      }
    } catch (error) {
      console.error('[Collection] 주문 생성 오류:', error);
      await showAlert(t('collectionsDetail.errors.purchaseFailed'));
    } finally {
      setPurchasing(false);
    }
  };

  const handleSheetClick = (sheetSlug: string) => {
    router.push(`/drum-sheet/${sheetSlug}`);
  };

  const handleBackToList = () => {
    router.push('/collections');
  };

  const getDifficultyBadgeColor = (difficulty?: string) => {
    switch (difficulty?.toLowerCase()) {
      case 'beginner':
        return 'bg-green-100 text-green-800';
      case 'intermediate':
        return 'bg-yellow-100 text-yellow-800';
      case 'advanced':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
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

  const getTranslatedDifficulty = (difficulty?: string) => {
    if (!difficulty) return '';

    // Map Korean difficulty values to English keys
    const koreanToEnglishMap: Record<string, string> = {
      '초급': 'beginner',
      '중급': 'intermediate',
      '고급': 'advanced',
      '초보': 'beginner',
      '입문': 'beginner',
    };

    // Normalize the difficulty value
    const normalizedDifficulty = difficulty.toLowerCase().trim();

    // Check if it's a Korean value
    if (koreanToEnglishMap[difficulty]) {
      return t(`collectionsDetail.difficulty.${koreanToEnglishMap[difficulty]}`);
    }

    // Check if it's an English value
    if (['beginner', 'intermediate', 'advanced'].includes(normalizedDifficulty)) {
      return t(`collectionsDetail.difficulty.${normalizedDifficulty}`);
    }

    // Return original value if no translation found
    return difficulty;
  };

  console.log('[Collections Debug] Render - loading:', loading, 'collection:', collection ? 'exists' : 'null', 'sheets:', sheets.length);

  if (loading) {
    return (
      <>
        <MainHeader user={user} />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-gray-600">{t('collectionsDetail.loading')}</div>
        </div>
      </>
    );
  }

  if (!collection) {
    console.log('[Collections Debug] Showing "not found" message');

    return (
      <>
        <MainHeader user={user} />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-600 mb-4">{t('collectionsDetail.errors.collectionNotFound')}</p>
            <button
              onClick={handleBackToList}
              className="text-blue-600 hover:text-blue-700"
            >
              {t('collectionsDetail.backToList')}
            </button>
          </div>
        </div>
      </>
    );
  }

  const totalIndividualPrice = sheets.reduce((sum, sheet) => sum + sheet.price, 0);
  const savings = totalIndividualPrice - collection.sale_price;

  return (
    <>
      <MainHeader user={user} />
      <div className="min-h-screen bg-gray-50 pb-24 lg:pb-0">
        {/* Back Button */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={handleBackToList}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 cursor-pointer"
          >
            <i className="ri-arrow-left-line"></i>
            <span>{t('collectionsDetail.backToList')}</span>
          </button>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Main Content Area (75%) */}
            <div className="lg:w-3/4 space-y-6">
              {/* Collection Header */}
              <div className="bg-white rounded-lg shadow-sm p-6">
                {/* Badges */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className="bg-blue-600 text-white text-sm font-semibold px-3 py-1 rounded">
                    {t('collectionsDetail.badge')}
                  </span>
                  {collection.discount_percentage > 0 && (
                    <span className="bg-red-500 text-white text-sm font-bold px-3 py-1 rounded">
                      {t('collectionsDetail.discount', { percentage: collection.discount_percentage })}
                    </span>
                  )}
                  <span className="bg-gray-100 text-gray-700 text-sm px-3 py-1 rounded">
                    {t('collectionsDetail.includedSheets.number', { count: sheets.length })}
                  </span>
                </div>

                {/* Title */}
                <h1 className="text-3xl font-bold text-gray-900 mb-4">
                  {getLocalizedTitle(collection)}
                </h1>

                {/* Description */}
                {getLocalizedDescription(collection) && (
                  <p className="text-gray-600 whitespace-pre-line">
                    {getLocalizedDescription(collection)}
                  </p>
                )}
              </div>

              {/* Mobile Purchase Card - shown above sheets on mobile only */}
              <div className="lg:hidden bg-white rounded-lg shadow-sm overflow-hidden">
                {/* Thumbnail - 배너형 이미지 */}
                <div className="w-full aspect-[2/1] bg-gray-200 overflow-hidden">
                  {collection.thumbnail_url ? (
                    <img
                      src={collection.thumbnail_url}
                      alt={collection.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <i className="ri-image-line text-4xl"></i>
                    </div>
                  )}
                </div>

                <div className="p-5">
                  {/* Price Info */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-gray-400 text-sm line-through">
                      {formatCurrency(convertFromKrw(totalIndividualPrice, currency, locale), currency)}
                    </span>
                    {savings > 0 && (
                      <span className="bg-green-100 text-green-700 text-[11px] font-semibold px-1.5 py-0.5 rounded">
                        {t('collectionsDetail.purchase.save', { amount: formatCurrency(convertFromKrw(savings, currency, locale), currency) })}
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-bold text-blue-600">
                    {collection.sale_price > 0
                      ? formatCurrency(convertFromKrw(collection.sale_price, currency, locale), currency)
                      : t('collectionsDetail.free')}
                  </div>

                  {/* Buy Button */}
                  <button
                    onClick={handleBuyCollection}
                    disabled={purchasing}
                    className={`w-full mt-4 bg-blue-600 text-white px-6 py-3.5 rounded-lg hover:bg-blue-700 transition-colors font-bold text-base shadow-md hover:shadow-lg ${purchasing ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {purchasing
                      ? (t('collectionsDetail.purchase.processing') || '처리 중...')
                      : (t('collectionsDetail.purchase.buyCollection') || '컬렉션 구매하기')}
                  </button>

                  <p className="text-xs text-gray-500 text-center mt-2">
                    {t('collectionsDetail.purchase.note')}
                  </p>
                </div>
              </div>

              {/* Mobile Features Card - 모바일에서도 특장점 표시 */}
              <div className="lg:hidden bg-white rounded-lg shadow-sm p-5">
                <h4 className="font-semibold text-gray-900 mb-3 text-sm">{t('collectionsDetail.features.title')}</h4>
                <ul className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                  <li className="flex items-start space-x-2">
                    <i className="ri-check-line text-blue-600 mt-0.5 flex-shrink-0"></i>
                    <span>{t('collectionsDetail.features.allSheets')}</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <i className="ri-check-line text-blue-600 mt-0.5 flex-shrink-0"></i>
                    <span>{t('collectionsDetail.features.highQuality')}</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <i className="ri-check-line text-blue-600 mt-0.5 flex-shrink-0"></i>
                    <span>{t('collectionsDetail.features.instantDownload')}</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <i className="ri-check-line text-blue-600 mt-0.5 flex-shrink-0"></i>
                    <span>{t('collectionsDetail.features.lifetimeAccess')}</span>
                  </li>
                </ul>
              </div>

              {/* Included Sheets List */}
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  {t('collectionsDetail.includedSheets.title')}
                </h2>
                <p className="text-gray-600 mb-6">
                  {t('collectionsDetail.includedSheets.description')}
                </p>

                {sheets.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">
                    {t('collectionsDetail.includedSheets.empty')}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {sheets.map((sheet) => (
                      <div
                        key={sheet.id}
                        className="border rounded-md p-3 sm:p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => handleSheetClick(sheet.slug)}
                      >
                        {/* Mobile Layout (< sm) */}
                        <div className="sm:hidden">
                          <div className="flex items-start gap-3">
                            {/* Thumbnail - compact on mobile */}
                            <div className="flex-shrink-0 w-14 h-14 bg-gray-200 rounded overflow-hidden">
                              {(sheet.thumbnail_url || sheet.preview_image_url) ? (
                                <img
                                  src={sheet.thumbnail_url || sheet.preview_image_url}
                                  alt={sheet.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-400">
                                  <i className="ri-file-music-line text-xl"></i>
                                </div>
                              )}
                            </div>

                            {/* Info - full width */}
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
                                {sheet.title}
                              </h3>
                              <p className="text-xs text-gray-500 mt-0.5 truncate">
                                {sheet.artist}
                              </p>
                              {sheet.difficulty && (
                                <span className={`inline-block mt-1 text-[11px] font-medium px-1.5 py-0.5 rounded ${getDifficultyBadgeColor(sheet.difficulty)}`}>
                                  {getTranslatedDifficulty(sheet.difficulty)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Price and Action - separate row */}
                          <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-gray-100">
                            <span className="text-sm font-semibold text-gray-900">
                              {sheet.price > 0
                                ? formatCurrency(convertFromKrw(sheet.price, currency, locale), currency)
                                : t('collectionsDetail.sheet.free')}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleSheetClick(sheet.slug); }}
                              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
                            >
                              {t('collectionsDetail.viewSheet') || '악보보기'}
                            </button>
                          </div>
                        </div>

                        {/* Desktop Layout (>= sm) */}
                        <div className="hidden sm:flex items-center gap-4">
                          {/* Thumbnail */}
                          <div className="flex-shrink-0 w-20 h-20 bg-gray-200 rounded overflow-hidden">
                            {(sheet.thumbnail_url || sheet.preview_image_url) ? (
                              <img
                                src={sheet.thumbnail_url || sheet.preview_image_url}
                                alt={sheet.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-400">
                                <i className="ri-file-music-line text-2xl"></i>
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 truncate">
                              {sheet.title}
                            </h3>
                            <p className="text-sm text-gray-500 truncate">
                              {sheet.artist}
                            </p>
                            {sheet.difficulty && (
                              <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded ${getDifficultyBadgeColor(sheet.difficulty)}`}>
                                {getTranslatedDifficulty(sheet.difficulty)}
                              </span>
                            )}
                          </div>

                          {/* Price and Action */}
                          <div className="flex-shrink-0 flex items-center gap-4">
                            <div className="text-right">
                              <div className="text-lg font-semibold text-gray-900">
                                {sheet.price > 0
                                  ? formatCurrency(convertFromKrw(sheet.price, currency, locale), currency)
                                  : t('collectionsDetail.sheet.free')}
                              </div>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleSheetClick(sheet.slug); }}
                              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors whitespace-nowrap"
                            >
                              {t('collectionsDetail.viewSheet') || '보러가기'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Navigation Links */}
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {t('collectionsDetail.navigation.title')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <button
                    onClick={() => router.push('/categories')}
                    className="text-left p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center space-x-2">
                      <i className="ri-folder-music-line text-blue-600 text-xl"></i>
                      <span className="text-blue-600 font-semibold">
                        {t('collectionsDetail.navigation.viewCategories')}
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={() => router.push('/free-sheets')}
                    className="text-left p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center space-x-2">
                      <i className="ri-percent-line text-blue-600 text-xl"></i>
                      <span className="text-blue-600 font-semibold">
                        {t('collectionsDetail.navigation.eventSale')}
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={() => router.push('/custom-order')}
                    className="text-left p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center space-x-2">
                      <i className="ri-pencil-line text-blue-600 text-xl"></i>
                      <span className="text-blue-600 font-semibold">
                        {t('collectionsDetail.navigation.customOrder')}
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Sidebar (25%) - Desktop only */}
            <div className="hidden lg:block lg:w-1/4">
              <div className="lg:sticky lg:top-24 space-y-4">
                {/* Collection Summary Card */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    {getLocalizedTitle(collection)}
                  </h3>

                  {/* Thumbnail */}
                  <div className="aspect-square bg-gray-200 rounded-lg overflow-hidden mb-4">
                    {collection.thumbnail_url ? (
                      <img
                        src={collection.thumbnail_url}
                        alt={collection.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <i className="ri-image-line text-4xl"></i>
                      </div>
                    )}
                  </div>

                  {/* Price Section */}
                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">{t('collectionsDetail.purchase.totalIndividual')}</span>
                      <span className="text-gray-500 line-through">
                        {formatCurrency(convertFromKrw(totalIndividualPrice, currency, locale), currency)}
                      </span>
                    </div>

                    <div className="border-t pt-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-900">
                          {t('collectionsDetail.purchase.collectionPrice')}
                        </span>
                        <span className="text-2xl font-bold text-blue-600">
                          {collection.sale_price > 0
                            ? formatCurrency(convertFromKrw(collection.sale_price, currency, locale), currency)
                            : t('collectionsDetail.free')}
                        </span>
                      </div>

                      {savings > 0 && (
                        <div className="text-right">
                          <span className="inline-block bg-green-100 text-green-700 text-xs font-semibold px-2 py-1 rounded">
                            {t('collectionsDetail.purchase.save', { amount: formatCurrency(convertFromKrw(savings, currency, locale), currency) })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Buy Button */}
                  <button
                    onClick={handleBuyCollection}
                    disabled={purchasing}
                    className={`w-full bg-blue-600 text-white px-6 py-4 rounded-lg hover:bg-blue-700 transition-colors font-bold text-lg shadow-md hover:shadow-lg ${purchasing ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {purchasing
                      ? (t('collectionsDetail.purchase.processing') || '처리 중...')
                      : (t('collectionsDetail.purchase.buyCollection') || '컬렉션 구매하기')}
                  </button>

                  <p className="text-xs text-gray-500 text-center mt-3">
                    {t('collectionsDetail.purchase.note')}
                  </p>
                </div>

                {/* Features Card */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h4 className="font-semibold text-gray-900 mb-3 text-sm">{t('collectionsDetail.features.title')}</h4>
                  <ul className="space-y-2 text-sm text-gray-600">
                    <li className="flex items-start space-x-2">
                      <i className="ri-check-line text-blue-600 mt-0.5"></i>
                      <span>{t('collectionsDetail.features.allSheets')}</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <i className="ri-check-line text-blue-600 mt-0.5"></i>
                      <span>{t('collectionsDetail.features.highQuality')}</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <i className="ri-check-line text-blue-600 mt-0.5"></i>
                      <span>{t('collectionsDetail.features.instantDownload')}</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <i className="ri-check-line text-blue-600 mt-0.5"></i>
                      <span>{t('collectionsDetail.features.lifetimeAccess')}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Fixed Bottom Bar - 스크롤해도 항상 하단에 구매 버튼 표시 */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.1)] z-50 px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Price Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400 line-through">
                {formatCurrency(convertFromKrw(totalIndividualPrice, currency, locale), currency)}
              </span>
              {collection.discount_percentage > 0 && (
                <span className="text-xs font-bold text-red-500">
                  -{collection.discount_percentage}%
                </span>
              )}
            </div>
            <div className="text-lg font-bold text-blue-600 leading-tight">
              {collection.sale_price > 0
                ? formatCurrency(convertFromKrw(collection.sale_price, currency, locale), currency)
                : t('collectionsDetail.free')}
            </div>
          </div>

          {/* Buy Button */}
          <button
            onClick={handleBuyCollection}
            disabled={purchasing}
            className={`flex-shrink-0 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-bold text-sm shadow-md ${purchasing ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {purchasing
              ? (t('collectionsDetail.purchase.processing') || '처리 중...')
              : (t('collectionsDetail.purchase.buyCollection') || '컬렉션 구매하기')}
          </button>
        </div>
      </div>
    </>
  );
}
