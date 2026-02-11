'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import { generateDefaultThumbnail } from '../../lib/defaultThumbnail';
import { fetchUserFavorites, toggleFavorite } from '../../lib/favorites';
import MainHeader from '../../components/common/MainHeader';
import Footer from '../../components/common/Footer';
import { useTranslation } from 'react-i18next';
import { getSiteCurrency, convertFromKrw, formatCurrency as formatCurrencyUtil } from '../../lib/currency';
import { useSiteLanguage } from '../../hooks/useSiteLanguage';
import Seo from '../../components/Seo';
import { languageDomainMap } from '../../config/languageDomainMap';

interface DrumSheet {
  id: string;
  title: string;
  artist: string;
  price: number;
  thumbnail_url?: string;
  youtube_url?: string;
  is_featured?: boolean;
  category_id?: string;
  slug: string;
}

interface Category {
  id: string;
  name: string;
}


export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [latestSheets, setLatestSheets] = useState<DrumSheet[]>([]);
  const [popularSheets, setPopularSheets] = useState<DrumSheet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string>('');
  const router = useLocaleRouter();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoriteLoadingIds, setFavoriteLoadingIds] = useState<Set<string>>(new Set());
  const { i18n, t } = useTranslation();
  const { isKoreanSite } = useSiteLanguage();

  const loadLatestSheets = useCallback(async () => {
    try {
      // 장르 필터링: 한국 사이트는 '가요'(K-POP), 글로벌 사이트는 '팝'(Pop)
      const targetGenreName = isKoreanSite ? '가요' : '팝';
      
      // 카테고리에서 해당 장르 ID 찾기
      const targetCategory = categories.find(cat => cat.name === targetGenreName);
      
      let query = supabase
        .from('drum_sheets')
        .select('id, title, artist, price, thumbnail_url, youtube_url, category_id, slug')
        .eq('is_active', true);

      // 카테고리를 찾았으면 해당 장르로 필터링
      if (targetCategory) {
        query = query.eq('category_id', targetCategory.id);
      }

      query = query.order('created_at', { ascending: false }).limit(12);

      const { data, error } = await query;

      if (error) throw error;
      setLatestSheets(data || []);
    } catch (error) {
      console.error(t('home.console.latestSheetsLoadError'), error);
    }
  }, [t, categories, isKoreanSite]);

  const loadCategories = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name');

      if (error) throw error;

      // Genre order matching category page
      const genreOrder = ['가요', '팝', '락', 'CCM', '트로트/성인가요', '재즈', 'J-POP', 'OST', '드럼솔로', '드럼커버'];

      // Filter out drum lesson category
      const filteredCategories = (data || []).filter(cat => cat.name !== '드럼레슨');

      // Sort by genre order
      const sortedCategories = filteredCategories.sort((a, b) => {
        const indexA = genreOrder.indexOf(a.name);
        const indexB = genreOrder.indexOf(b.name);

        // Move items not in order to the end
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;

        return indexA - indexB;
      });

      setCategories(sortedCategories);
    } catch (error) {
      console.error(t('home.console.categoryLoadError'), error);
    }
  }, [t]);


  const loadPopularSheets = useCallback(async () => {
    // 장르가 선택되지 않았으면 요청하지 않음
    if (!selectedGenre) {
      setPopularSheets([]);
      return;
    }

    try {
      // 1. 순위가 지정된 악보 먼저 가져오기
      // 우선 drum_sheet_categories에서 읽기 (최신 방식)
      let rankedSheets: any[] = [];
      
      const { data: categoryRanks, error: categoryError } = await supabase
        .from('drum_sheet_categories')
        .select(`
          popularity_rank,
          sheet:drum_sheets (
            id,
            title,
            artist,
            price,
            thumbnail_url,
            youtube_url,
            category_id,
            created_at,
            slug
          )
        `)
        .eq('category_id', selectedGenre)
        .not('popularity_rank', 'is', null)
        .gte('popularity_rank', 1)
        .lte('popularity_rank', 10)
        .order('popularity_rank', { ascending: true });

      if (categoryError) {
        console.warn('drum_sheet_categories 로드 실패:', categoryError);
      } else if (categoryRanks && categoryRanks.length > 0) {
        // drum_sheet_categories에서 데이터가 있으면 사용
        rankedSheets = categoryRanks
          .map((row: any) => ({
            ...row.sheet,
            popularity_rank: row.popularity_rank,
          }))
          .filter((sheet: any) => sheet && sheet.id);
      } else {
        // drum_sheet_categories에 데이터가 없으면 drum_sheets.popularity_rank를 fallback으로 사용
        const { data: sheetRanks, error: sheetError } = await supabase
          .from('drum_sheets')
          .select('id, title, artist, price, thumbnail_url, youtube_url, category_id, created_at, popularity_rank, slug')
          .eq('is_active', true)
          .eq('category_id', selectedGenre)
          .not('popularity_rank', 'is', null)
          .gte('popularity_rank', 1)
          .lte('popularity_rank', 10)
          .order('popularity_rank', { ascending: true });

        if (sheetError) {
          console.warn('drum_sheets.popularity_rank 로드 실패:', sheetError);
        } else if (sheetRanks) {
          rankedSheets = sheetRanks;
        }
      }

      // 2. 순위가 지정된 악보가 10개 미만이면 나머지는 기존 방식으로 채움
      const rankedCount = rankedSheets?.length || 0;
      let remainingSheets: typeof rankedSheets = [];

      if (rankedCount < 10) {
        // 순위가 지정되지 않은 악보들 가져오기
        const { data: unrankedSheets, error: unrankedError } = await supabase
          .from('drum_sheets')
          .select('id, title, artist, price, thumbnail_url, youtube_url, category_id, created_at, slug')
          .eq('is_active', true)
          .eq('category_id', selectedGenre)
          .or('popularity_rank.is.null,popularity_rank.lt.1,popularity_rank.gt.10');

        if (unrankedError) throw unrankedError;

        if (unrankedSheets && unrankedSheets.length > 0) {
          // 기존 방식: 구매수/조회수 기반 정렬
          const sheetIds = unrankedSheets.map(sheet => sheet.id);

          // 날짜 계산 (최근 7일과 전체 기간)
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // 4. 전체 기간 구매수 가져오기 (모든 악보에 대해 한 번에)
      const { data: allOrderItems, error: orderItemsError } = await supabase
        .from('order_items')
        .select(`
          drum_sheet_id,
          order_id,
          created_at,
          orders!inner (
            id,
            status
          )
        `)
        .in('drum_sheet_id', sheetIds)
        .eq('orders.status', 'completed');

      // 5. 전체 기간 조회수 가져오기 (모든 악보에 대해 한 번에)
      // page_views에서 /drum-sheet/{slug} or /sheet-detail/{id} 패턴이 포함된 모든 레코드 가져오기
      const { data: allPageViews, error: pageViewsError} = await supabase
        .from('page_views')
        .select('page_url, created_at')
        .or('page_url.ilike.%/drum-sheet/%,page_url.ilike.%/sheet-detail/%');

      // 6. 클라이언트에서 그룹핑하여 각 악보의 구매수와 조회수 계산
      const purchaseCountMap = new Map<string, number>(); // 전체 기간 구매수
      const recentPurchaseCountMap = new Map<string, number>(); // 최근 7일 구매수
      const viewCountMap = new Map<string, number>(); // 전체 기간 조회수
      const recentViewCountMap = new Map<string, number>(); // 최근 7일 조회수

      // 구매수 집계 (전체 기간 + 최근 7일)
      if (allOrderItems && !orderItemsError) {
        allOrderItems.forEach(item => {
          if (item.drum_sheet_id) {
            // 전체 기간 구매수
            purchaseCountMap.set(
              item.drum_sheet_id,
              (purchaseCountMap.get(item.drum_sheet_id) || 0) + 1
            );

            // 최근 7일 구매수
            const itemDate = new Date(item.created_at);
            if (itemDate >= sevenDaysAgo) {
              recentPurchaseCountMap.set(
                item.drum_sheet_id,
                (recentPurchaseCountMap.get(item.drum_sheet_id) || 0) + 1
              );
            }
          }
        });
      }

      // 조회수 집계 (전체 기간 + 최근 7일)
      if (allPageViews && !pageViewsError) {
        allPageViews.forEach(view => {
          // URL에서 악보 ID 또는 slug 추출: /drum-sheet/{slug} or /sheet-detail/{id} 패턴
          const match = view.page_url.match(/\/(?:drum-)?sheet(?:-detail)?\/([^/?]+)/);
          if (match && match[1]) {
            const sheetId = match[1];
            if (sheetIds.includes(sheetId)) {
              // 전체 기간 조회수
              viewCountMap.set(
                sheetId,
                (viewCountMap.get(sheetId) || 0) + 1
              );

              // 최근 7일 조회수
              const viewDate = new Date(view.created_at);
              if (viewDate >= sevenDaysAgo) {
                recentViewCountMap.set(
                  sheetId,
                  (recentViewCountMap.get(sheetId) || 0) + 1
                );
              }
            }
          }
        });
      }

      // 7. 각 악보에 점수 계산
      // 가중치: 최근 7일 구매수 2.0, 전체 구매수 1.0, 최근 7일 조회수 0.2, 전체 조회수 0.1
      const recentPurchaseWeight = 2.0;
      const totalPurchaseWeight = 1.0;
      const recentViewWeight = 0.2;
      const totalViewWeight = 0.1;

      const sheetsWithScores = unrankedSheets.map(sheet => {
        const totalPurchaseCount = purchaseCountMap.get(sheet.id) || 0;
        const recentPurchaseCount = recentPurchaseCountMap.get(sheet.id) || 0;
        const totalViewCount = viewCountMap.get(sheet.id) || 0;
        const recentViewCount = recentViewCountMap.get(sheet.id) || 0;

        // 인기도 점수 계산: 최근 데이터에 더 높은 가중치 부여
        const score = 
          (recentPurchaseCount * recentPurchaseWeight) +
          (totalPurchaseCount * totalPurchaseWeight) +
          (recentViewCount * recentViewWeight) +
          (totalViewCount * totalViewWeight);

        return {
          ...sheet,
          totalPurchaseCount,
          recentPurchaseCount,
          totalViewCount,
          recentViewCount,
          score
        };
      });

      // 8. 점수 기준으로 정렬 (내림차순)
      // 동점일 경우: 최근 구매수 > 전체 구매수 > 최근 조회수 > 전체 조회수 > 최신순
      sheetsWithScores.sort((a, b) => {
        // 점수가 다르면 점수 기준으로 정렬
        if (Math.abs(b.score - a.score) > 0.001) {
          return b.score - a.score;
        }

        // 동점일 경우 보조 기준 사용
        // 1. 최근 구매수 비교
        if (b.recentPurchaseCount !== a.recentPurchaseCount) {
          return b.recentPurchaseCount - a.recentPurchaseCount;
        }
        // 2. 전체 구매수 비교
        if (b.totalPurchaseCount !== a.totalPurchaseCount) {
          return b.totalPurchaseCount - a.totalPurchaseCount;
        }
        // 3. 최근 조회수 비교
        if (b.recentViewCount !== a.recentViewCount) {
          return b.recentViewCount - a.recentViewCount;
        }
        // 4. 전체 조회수 비교
        if (b.totalViewCount !== a.totalViewCount) {
          return b.totalViewCount - a.totalViewCount;
        }
        // 5. 모든 지표가 같으면 최신순
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

          // 9. 상위 N개만 선택 (순위 지정된 곡이 10개 미만이면 나머지 자리 채움)
          const remainingCount = 10 - rankedCount;
          const topUnrankedSheets = sheetsWithScores.slice(0, remainingCount).map(({ 
            totalPurchaseCount, 
            recentPurchaseCount, 
            totalViewCount, 
            recentViewCount, 
            score, 
            ...sheet 
          }) => sheet);

          remainingSheets = topUnrankedSheets;
        }
      }

      // 3. 최종 순위: 순위 지정된 곡들 + 순위 미지정 곡들
      const finalSheets = [
        ...(rankedSheets || []).map(({ popularity_rank, ...sheet }) => sheet),
        ...remainingSheets
      ].slice(0, 10);

      setPopularSheets(finalSheets);
    } catch (error) {
      console.error(t('home.console.popularSheetsLoadError'), error);
      setPopularSheets([]);
    }
  }, [selectedGenre, t]);

  const loadFavorites = useCallback(async () => {
    if (!user) {
      setFavoriteIds(new Set());
      setFavoriteLoadingIds(new Set());
      return;
    }

    try {
      const favorites = await fetchUserFavorites(user.id);
      setFavoriteIds(new Set(favorites.map((favorite) => favorite.sheet_id)));
      setFavoriteLoadingIds(new Set());
    } catch (error) {
      console.error(t('home.console.favoritesLoadError'), error);
    }
  }, [user, t]);

  useEffect(() => {
    let isMounted = true;

    const initializeUser = async () => {
      try {
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        if (!isMounted) return;

        setUser(currentUser ?? null);
        setLoading(false);
      } catch (error) {
        console.error(t('home.console.userInfoLoadError'), error);
        if (isMounted) {
          setUser(null);
          setLoading(false);
        }
      }
    };

    initializeUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [t]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    // 카테고리가 로드된 후에 최신 악보 로드 (장르 필터링을 위해 카테고리 필요)
    if (categories.length > 0) {
      loadLatestSheets();
    }
  }, [loadLatestSheets, categories.length]);

  useEffect(() => {
    // Popular Sheets에서 첫 번째 장르를 자동 선택 (카테고리 로드 후, selectedGenre가 비어있을 때만)
    if (categories.length > 0 && !selectedGenre) {
      // 글로벌 사이트용 장르 순서 정의
      const globalGenreOrder = ['팝', '락', '가요', '재즈', 'J-POP', 'OST', 'CCM', '트로트/성인가요', '드럼솔로', '드럼커버'];
      
      // 한국 사이트는 기존 categories 순서 사용, 글로벌 사이트는 새로운 순서 사용
      const sortedCategories = isKoreanSite
        ? categories
        : [...categories].sort((a, b) => {
            const indexA = globalGenreOrder.indexOf(a.name);
            const indexB = globalGenreOrder.indexOf(b.name);
            // 순서에 없는 항목은 끝으로
            if (indexA === -1 && indexB === -1) return 0;
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
          });
      
      // 첫 번째 장르 자동 선택
      if (sortedCategories.length > 0) {
        setSelectedGenre(sortedCategories[0].id);
      }
    }
  }, [categories, isKoreanSite, selectedGenre]);


  useEffect(() => {
    // 장르가 선택된 경우에만 인기 악보 로드
    if (selectedGenre) {
      loadPopularSheets();
    }
  }, [loadPopularSheets, selectedGenre]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const getThumbnailUrl = (sheet: DrumSheet): string => {
    if (sheet.youtube_url) {
      const videoId = extractVideoId(sheet.youtube_url);
      if (videoId) {
        return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      }
    }
    if (sheet.thumbnail_url) {
      return sheet.thumbnail_url;
    }
    // 이미지가 없을 경우 기본 썸네일 생성
    return generateDefaultThumbnail(400, 400);
  };

  const extractVideoId = (url: string): string => {
    const regex = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([\w-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : '';
  };

  // 통화 로직 적용 (locale 기반)
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'copydrum.com';
  const currency = getSiteCurrency(hostname, i18n.language);

  const formatCurrency = useCallback(
    (value: number) => {
      const converted = convertFromKrw(value, currency, i18n.language);
      return formatCurrencyUtil(converted, currency);
    },
    [currency, i18n.language],
  );

  const handleToggleFavorite = async (sheetId: string) => {
    if (!user) {
      alert(t('home.loginRequired'));
      return;
    }

    const wasFavorite = favoriteIds.has(sheetId);

    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (wasFavorite) {
        next.delete(sheetId);
      } else {
        next.add(sheetId);
      }
      return next;
    });

    setFavoriteLoadingIds((prev) => {
      const next = new Set(prev);
      next.add(sheetId);
      return next;
    });

    try {
      const isNowFavorite = await toggleFavorite(sheetId, user.id);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isNowFavorite) {
          next.add(sheetId);
        } else {
          next.delete(sheetId);
        }
        return next;
      });
    } catch (error) {
      console.error(t('home.console.favoriteToggleError'), error);
      alert(t('home.favoriteError'));
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (wasFavorite) {
          next.add(sheetId);
        } else {
          next.delete(sheetId);
        }
        return next;
      });
    } finally {
      setFavoriteLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(sheetId);
        return next;
      });
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600" suppressHydrationWarning>{t('message.loading')}</p>
        </div>
      </div>
    );
  }

  // Build canonical URL
  const baseUrl = languageDomainMap[i18n.language as keyof typeof languageDomainMap] || (typeof window !== 'undefined' ? window.location.origin : '');
  const canonicalUrl = baseUrl ? `${baseUrl}/` : '/';

  return (
    <div className="min-h-screen bg-white">
      {/* SEO Meta Tags */}
      <Seo
        title={t('seo.homeTitle')}
        description={t('seo.homeDescription')}
        canonicalUrl={canonicalUrl}
        locale={i18n.language}
      />
      
      {/* Desktop Header */}
      <div className="hidden md:block">
        <MainHeader user={user} />
      </div>

      {/* Main Content */}
      <div className="px-4 pb-8 pt-6 sm:px-6 lg:px-8 ">
        {/* Latest Sheets - 최상단에 배치 */}
        <section className="py-6 md:py-12">
          <div className="max-w-7xl mx-auto space-y-8">
            <div className="md:hidden">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-2xl font-bold text-gray-900">{t('home.latestSheets')}</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {latestSheets.slice(0, 6).map((sheet) => {
                  const isFavorite = favoriteIds.has(sheet.id);
                  const isFavoriteLoading = favoriteLoadingIds.has(sheet.id);
                  return (
                    <div
                      key={sheet.id}
                      onClick={() => router.push(`/drum-sheet/${sheet.slug}`)}
                      className="relative flex cursor-pointer flex-col"
                    >
                      <div className="relative aspect-square overflow-hidden rounded-2xl">
                        <img
                          src={getThumbnailUrl(sheet)}
                          alt={sheet.title}
                          className="h-full w-full object-cover transition-transform duration-300"
                          onError={(e) => {
                            const img = e.target as HTMLImageElement;
                            img.src = generateDefaultThumbnail(400, 400);
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"></div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleToggleFavorite(sheet.id);
                          }}
                          disabled={isFavoriteLoading}
                          className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-sm transition-colors ${isFavorite
                            ? 'border-red-200 bg-red-50/90 text-red-500'
                            : 'border-white/60 bg-black/30 text-white'
                            } ${isFavoriteLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                          aria-label={isFavorite ? t('home.unfavorite') : t('home.favorite')}
                        >
                          <i className={`ri-heart-${isFavorite ? 'fill' : 'line'} text-base`} />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 px-2 pb-2 text-center text-white">
                          <h4 className="text-sm font-bold line-clamp-2 leading-tight">{sheet.title}</h4>
                          <p className="text-xs text-white/80 line-clamp-1 mt-0.5">{sheet.artist}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => router.push('/categories')}
                  className="inline-flex items-center justify-center px-6 py-2.5 rounded-full bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 transition-colors"
                >
                  {t('home.showMore')}
                </button>
              </div>
            </div>

            <div className="hidden md:block">
              <h3 className="mb-8 text-left text-3xl font-bold text-gray-900">{t('home.latestSheets')}</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {latestSheets.map((sheet) => {
                  const isFavorite = favoriteIds.has(sheet.id);
                  const isFavoriteLoading = favoriteLoadingIds.has(sheet.id);
                  return (
                    <div
                      key={sheet.id}
                      onClick={() => router.push(`/drum-sheet/${sheet.slug}`)}
                      className="relative aspect-square cursor-pointer group overflow-hidden rounded-lg"
                    >
                      <img
                        src={getThumbnailUrl(sheet)}
                        alt={sheet.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={(e) => {
                          const img = e.target as HTMLImageElement;
                          img.src = generateDefaultThumbnail(400, 400);
                        }}
                      />
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleToggleFavorite(sheet.id);
                        }}
                        disabled={isFavoriteLoading}
                        className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-sm transition-colors ${isFavorite
                          ? 'border-red-200 bg-red-50/90 text-red-500'
                          : 'border-white/60 bg-black/30 text-white hover:border-red-200 hover:text-red-500 hover:bg-red-50/80'
                          } ${isFavoriteLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                        aria-label={isFavorite ? t('home.unfavorite') : t('home.favorite')}
                      >
                        <i className={`ri-heart-${isFavorite ? 'fill' : 'line'} text-lg`} />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-3 py-3 text-center">
                        <h4 className="text-white font-bold text-sm mb-1 line-clamp-1">{sheet.title}</h4>
                        <p className="text-white text-xs line-clamp-1">{sheet.artist}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Popular Sheets */}
        <section className="py-12 md:py-16 bg-gray-50 rounded-3xl md:rounded-none -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto space-y-8">
            <div className="md:hidden">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-2xl font-bold text-gray-900">{t('home.popularSheets')}</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {popularSheets.slice(0, 6).map((sheet) => {
                  const isFavorite = favoriteIds.has(sheet.id);
                  const isFavoriteLoading = favoriteLoadingIds.has(sheet.id);
                  return (
                    <div
                      key={sheet.id}
                      onClick={() => router.push(`/drum-sheet/${sheet.slug}`)}
                      className="relative flex cursor-pointer flex-col"
                    >
                      <div className="relative aspect-square overflow-hidden rounded-2xl">
                        <img
                          src={getThumbnailUrl(sheet)}
                          alt={sheet.title}
                          className="h-full w-full object-cover transition-transform duration-300"
                          onError={(e) => {
                            const img = e.target as HTMLImageElement;
                            img.src = generateDefaultThumbnail(400, 400);
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleToggleFavorite(sheet.id);
                          }}
                          disabled={isFavoriteLoading}
                          className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-sm transition-colors ${isFavorite
                            ? 'border-red-200 bg-red-50 text-red-500'
                            : 'border-white/60 bg-black/30 text-white'
                            } ${isFavoriteLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                          aria-label={isFavorite ? t('home.unfavorite') : t('home.favorite')}
                        >
                          <i className={`ri-heart-${isFavorite ? 'fill' : 'line'} text-base`} />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 px-2 pb-2 text-center text-white">
                          <h4 className="text-sm font-bold line-clamp-2 leading-tight">{sheet.title}</h4>
                          <p className="text-xs text-white/80 line-clamp-1 mt-0.5">{sheet.artist}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => router.push('/categories')}
                  className="inline-flex items-center justify-center px-6 py-2.5 rounded-full bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 transition-colors"
                >
                  {t('home.showMore')}
                </button>
              </div>
            </div>

            <div className="hidden md:block">
              <div className="mb-8 flex items-center justify-between">
                <h3 className="text-3xl font-bold text-gray-900">{t('home.popularSheets')}</h3>
                <a href="/categories" className="text-sm text-gray-500 hover:text-gray-700">
                  {t('home.showMore')} &gt;
                </a>
              </div>

              {/* Genre filter */}
              <div className="mb-6 flex flex-wrap gap-2">
                {(() => {
                  // 글로벌 사이트용 장르 순서 정의
                  const globalGenreOrder = ['팝', '락', '가요', '재즈', 'J-POP', 'OST', 'CCM', '트로트/성인가요', '드럼솔로', '드럼커버'];
                  
                  // 한국 사이트는 기존 categories 순서 사용, 글로벌 사이트는 새로운 순서 사용
                  const sortedCategories = isKoreanSite
                    ? categories
                    : [...categories].sort((a, b) => {
                        const indexA = globalGenreOrder.indexOf(a.name);
                        const indexB = globalGenreOrder.indexOf(b.name);
                        // 순서에 없는 항목은 끝으로
                        if (indexA === -1 && indexB === -1) return 0;
                        if (indexA === -1) return 1;
                        if (indexB === -1) return -1;
                        return indexA - indexB;
                      });

                  return sortedCategories.map((category) => {
                    // ✅ 장르 이름을 번역하는 함수 (Sheet Detail Page와 동일한 로직)
                    const getGenreName = (categoryName: string | null | undefined): string => {
                      if (!categoryName) return '';

                      // ✅ 한국어 사이트: 원본 한국어 반환
                      if (i18n.language === 'ko') {
                        return categoryName;
                      }

                      // ✅ 영어 사이트: categoriesPage.categories.* 키 사용
                      if (i18n.language === 'en') {
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
                          '기타': t('categoriesPage.categories.other'),
                        };
                        return categoryMap[categoryName] || categoryName;
                      }

                      // ✅ 일본어 사이트: category.* 키 사용 (기존 로직 유지)
                      if (i18n.language === 'ja') {
                        const categoryMapJa: Record<string, string> = {
                          '가요': t('category.kpop'),
                          '팝': t('category.pop'),
                          '락': t('category.rock'),
                          'CCM': t('category.ccm'),
                          '트로트/성인가요': t('category.trot'),
                          '재즈': t('category.jazz'),
                          'J-POP': t('category.jpop'),
                          'OST': t('category.ost'),
                          '드럼솔로': t('category.drumSolo'),
                          '드럼커버': t('category.drumCover'),
                          '기타': t('category.other'),
                        };
                        return categoryMapJa[categoryName] || categoryName;
                      }

                      // ✅ 나머지 모든 언어: categoriesPage.categories.* 키 사용
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
                        '기타': t('categoriesPage.categories.other'),
                      };
                      
                      // 번역 키가 있으면 사용, 없으면 원본 반환
                      return categoryMap[categoryName] || categoryName;
                    };

                    return (
                      <button
                        key={category.id}
                        onClick={() => setSelectedGenre(category.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${selectedGenre === category.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-700 hover:bg-gray-100'
                          }`}
                      >
                        {getGenreName(category.name)}
                      </button>
                    );
                  });
                })()}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  {popularSheets.slice(0, 5).map((sheet, index) => {
                    const rank = index + 1;
                    const isTop3 = rank <= 3;
                    const isFavorite = favoriteIds.has(sheet.id);
                    const isFavoriteLoading = favoriteLoadingIds.has(sheet.id);
                    return (
                      <div
                        key={sheet.id}
                        onClick={() => router.push(`/drum-sheet/${sheet.slug}`)}
                        className="group flex items-center justify-between gap-4 rounded-lg p-3 transition-all duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-lg cursor-pointer"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-4">
                          <div className="relative flex-shrink-0">
                            {isTop3 && (
                              <div className="absolute -top-2 -left-2 rounded px-2 py-0.5 text-xs font-semibold text-white bg-blue-600 z-10">
                                {t('home.best')}
                              </div>
                            )}
                            <div className="flex h-12 w-12 items-center justify-center">
                              <span
                                className={`text-2xl font-bold transition-colors duration-300 ${isTop3 ? 'text-blue-600 group-hover:text-blue-700' : 'text-gray-600 group-hover:text-gray-800'
                                  }`}
                              >
                                {rank}
                              </span>
                            </div>
                          </div>
                          <img
                            src={getThumbnailUrl(sheet)}
                            alt={sheet.title}
                            className="h-16 w-16 flex-shrink-0 rounded object-cover transition-transform duration-300 group-hover:scale-110 group-hover:shadow-md"
                            onError={(e) => {
                              const img = e.target as HTMLImageElement;
                              img.src = generateDefaultThumbnail(400, 400);
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <h4 className="mb-1 truncate text-sm font-bold text-gray-900 transition-colors duration-300 group-hover:text-blue-600">
                              {sheet.title}
                            </h4>
                            <p className="truncate text-xs text-gray-600 transition-colors duration-300 group-hover:text-gray-800">
                              {sheet.artist}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleToggleFavorite(sheet.id);
                          }}
                          disabled={isFavoriteLoading}
                          className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${isFavorite
                            ? 'border-red-200 bg-red-50 text-red-500'
                            : 'border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500'
                            } ${isFavoriteLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                          aria-label={isFavorite ? t('home.unfavorite') : t('home.favorite')}
                        >
                          <i className={`ri-heart-${isFavorite ? 'fill' : 'line'} text-lg`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-4">
                  {popularSheets.slice(5, 10).map((sheet, index) => {
                    const rank = index + 6;
                    const isFavorite = favoriteIds.has(sheet.id);
                    const isFavoriteLoading = favoriteLoadingIds.has(sheet.id);
                    return (
                      <div
                        key={sheet.id}
                        onClick={() => router.push(`/drum-sheet/${sheet.slug}`)}
                        className="group flex items-center justify-between gap-4 rounded-lg p-3 transition-all duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-lg cursor-pointer"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-4">
                          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center">
                            <span className="text-2xl font-bold text-gray-600 transition-colors duration-300 group-hover:text-gray-800">
                              {rank}
                            </span>
                          </div>
                          <img
                            src={getThumbnailUrl(sheet)}
                            alt={sheet.title}
                            className="h-16 w-16 flex-shrink-0 rounded object-cover transition-transform duration-300 group-hover:scale-110 group-hover:shadow-md"
                            onError={(e) => {
                              const img = e.target as HTMLImageElement;
                              img.src = generateDefaultThumbnail(400, 400);
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <h4 className="mb-1 truncate text-sm font-bold text-gray-900 transition-colors duration-300 group-hover:text-blue-600">
                              {sheet.title}
                            </h4>
                            <p className="truncate text-xs text-gray-600 transition-colors duration-300 group-hover:text-gray-800">
                              {sheet.artist}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleToggleFavorite(sheet.id);
                          }}
                          disabled={isFavoriteLoading}
                          className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${isFavorite
                            ? 'border-red-200 bg-red-50 text-red-500'
                            : 'border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500'
                            } ${isFavoriteLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                          aria-label={isFavorite ? t('home.unfavorite') : t('home.favorite')}
                        >
                          <i className={`ri-heart-${isFavorite ? 'fill' : 'line'} text-lg`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>

      {/* Custom Order CTA */}
      <div className="">
        <section className="bg-blue-600 text-center text-white">
          <div className="px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
            <h3 className="text-2xl sm:text-3xl font-bold mb-4">{t('home.customOrderCTATitle')}</h3>
            {/* Mobile Version */}
            <div className="md:hidden text-lg sm:text-xl text-blue-100 mb-8 space-y-1">
              <p>{t('home.customOrderCTADescription')}</p>
              <p>{t('home.customOrderCTADescription2')}</p>
            </div>
            {/* PC Version */}
            <div className="hidden md:block text-xl text-blue-100 mb-8 space-y-1">
              <p>{t('home.customOrderCTADescription')}</p>
              <p>{t('home.customOrderCTADescription2')}</p>
            </div>
            <button
              onClick={() => router.push('/custom-order')}
              className="bg-white text-blue-600 px-8 py-4 rounded-lg hover:bg-gray-100 font-semibold text-lg whitespace-nowrap cursor-pointer transition-colors shadow-lg"
            >
              {t('home.customOrderCTAButton')}
            </button>
          </div>
        </section>
      </div>

      {/* Hero Section - 최하단으로 이동 */}
      <div>
        <section
          className="relative bg-cover bg-center bg-no-repeat h-[280px] sm:h-[320px] md:h-[380px] lg:h-[400px] bg-gray-900 overflow-hidden"
          style={{
            backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url('/banner1.jpg')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }}
        >
          <div className="absolute inset-0 flex items-center">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
              {/* Mobile Version */}
              <div className="max-w-xl md:hidden text-center space-y-3">
                <h2 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
                  {t('home.banner.title').split('\n').map((line, idx) => (
                    <span key={idx}>
                      {line}
                      {idx < t('home.banner.title').split('\n').length - 1 && <br />}
                    </span>
                  ))}
                </h2>
                <div className="text-white text-sm sm:text-base leading-relaxed space-y-1">
                  <p>{t('home.banner.subtitle1')}</p>
                  <p>{t('home.banner.subtitle2')}</p>
                  <p>{t('home.banner.subtitle3')}</p>
                </div>
                <button
                  onClick={() => window.location.href = '/categories'}
                  className="inline-flex items-center justify-center bg-gradient-to-r from-blue-600 to-purple-600 text-white px-5 py-2.5 sm:px-6 sm:py-3 rounded-full hover:from-blue-700 hover:to-purple-700 font-semibold whitespace-nowrap cursor-pointer transition-all duration-300 shadow-lg text-sm sm:text-base"
                >
                  {t('home.banner.browseButton')}
                </button>
              </div>
              {/* PC Version */}
              <div className="hidden md:block max-w-2xl text-left space-y-4">
                <h2 className="text-4xl font-bold text-white leading-tight">
                  {t('home.banner.title').split('\n').map((line, idx) => (
                    <span key={idx}>
                      {line}
                      {idx < t('home.banner.title').split('\n').length - 1 && <br />}
                    </span>
                  ))}
                </h2>
                <div className="text-white text-lg leading-relaxed space-y-1">
                  <p>{t('home.banner.subtitle1')}</p>
                  <p>{t('home.banner.subtitle2')}</p>
                  <p>{t('home.banner.subtitle3')}</p>
                </div>
                <button
                  onClick={() => window.location.href = '/categories'}
                  className="inline-flex items-center justify-center bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2.5 rounded-full hover:from-blue-700 hover:to-purple-700 font-semibold whitespace-nowrap cursor-pointer transition-all duration-300 shadow-lg"
                >
                  {t('home.banner.browseButton')}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Footer (PC) */}
      <div className="hidden md:block ">
        <Footer />
      </div>

      {/* Business info link (Mobile) */}
      <div className="md:hidden px-4 sm:px-6 lg:px-8 py-8 text-center space-y-2">
        <button
          type="button"
          onClick={() => router.push('/company/business-info')}
          className="text-sm font-semibold text-gray-700 underline underline-offset-4"
        >
          {t('home.businessInfo')} &gt;
        </button>
        <p className="text-xs text-gray-500">© {new Date().getFullYear()} COPYDRUM. All rights reserved.</p>
      </div>
    </div>
  );
}
