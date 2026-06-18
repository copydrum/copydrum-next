'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

import { useState, useEffect, useCallback, useRef } from 'react';
import { preload } from 'react-dom';
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
import { COLLECTIONS_PUBLIC_ENABLED } from '@/config/featureFlags';
import {
  SHEET_BOOK_GENRE_I18N_KEYS,
  SHEET_BOOK_GENRE_NAMES,
  SHEET_BOOK_MAIN_CATEGORY_NAME,
} from '@/lib/sheetBookCategories';
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
  sales_type?: 'INSTANT' | 'PREORDER';
}

interface Category {
  id: string;
  name: string;
}

interface HomeCollection {
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

interface FreeLessonSheet {
  id: string;
  title: string;
  title_translations?: Record<string, string> | null;
  artist: string;
  difficulty: string | null;
  thumbnail_url: string | null;
  youtube_url: string | null;
  pdf_url: string;
  slug: string;
  created_at: string;
  price: number | null;
  page_count: number | null;
  categories?: { name: string } | null;
}

interface HomeSheetBook {
  id: string;
  title: string;
  title_translations?: Record<string, string> | null;
  artist: string;
  thumbnail_url: string | null;
  slug: string;
  price: number | null;
  page_count: number | null;
  genres: string[];
}


export default function Home() {
  // LCP 개선: 최상단 히어로 배너 이미지를 우선 프리로드
  preload('/banner1.jpg', { as: 'image', fetchPriority: 'high' });

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [latestSheets, setLatestSheets] = useState<DrumSheet[]>([]);
  const [latestGenreTab, setLatestGenreTab] = useState<string>('');
  const [youtubeLatestSheets, setYoutubeLatestSheets] = useState<DrumSheet[]>([]);
  const [popularSheets, setPopularSheets] = useState<DrumSheet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string>('');
  const [collections, setCollections] = useState<HomeCollection[]>([]);
  const [collectionSlideIndex, setCollectionSlideIndex] = useState(0);
  const collectionSliderRef = useRef<HTMLDivElement>(null);
  const [freeLessonSheets, setFreeLessonSheets] = useState<FreeLessonSheet[]>([]);
  const freeLessonSliderRef = useRef<HTMLDivElement>(null);
  // 드럼레슨 "개별 자료"(루디먼트/필인/리듬패턴/드럼테크닉/기초입문 카테고리) — 교재와 분리 노출
  const [lessonMaterials, setLessonMaterials] = useState<FreeLessonSheet[]>([]);
  const lessonMaterialSliderRef = useRef<HTMLDivElement>(null);
  const [sheetBooks, setSheetBooks] = useState<HomeSheetBook[]>([]);
  const sheetBookSliderRef = useRef<HTMLDivElement>(null);
  const router = useLocaleRouter();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoriteLoadingIds, setFavoriteLoadingIds] = useState<Set<string>>(new Set());
  const { i18n, t } = useTranslation();
  const { isKoreanSite } = useSiteLanguage();

  // 글로벌 사이트(비한국어)에서 메인 레일에 노출하지 않을 한국 장르
  const GLOBAL_HIDDEN_GENRES = ['가요', '트로트/성인가요', 'CCM', 'OST'];
  const latestGenreListBase = ['가요', '팝', '락', 'CCM', '트로트/성인가요', '재즈', 'J-POP', 'OST'];
  const latestGenreList = isKoreanSite
    ? latestGenreListBase
    : latestGenreListBase.filter((g) => !GLOBAL_HIDDEN_GENRES.includes(g));

  const loadLatestSheets = useCallback(async (genreId?: string) => {
    try {
      const selectFields = 'id, title, artist, price, thumbnail_url, youtube_url, category_id, slug, sales_type, created_at';

      let data: any[] | null = null;
      let error: any = null;

      const targetCategoryId = genreId || null;
      const allowedCatIds = categories
        .filter(c => latestGenreList.includes(c.name))
        .map(c => c.id);

      if (targetCategoryId) {
        const [primaryResult, junctionResult] = await Promise.all([
          supabase
            .from('drum_sheets')
            .select(selectFields)
            .eq('is_active', true)
            .eq('category_id', targetCategoryId)
            .order('created_at', { ascending: false })
            .limit(12),
          supabase
            .from('drum_sheet_categories')
            .select(`
              drum_sheets!inner (
                id, title, artist, price, thumbnail_url, youtube_url, category_id, slug, sales_type, created_at
              )
            `)
            .eq('category_id', targetCategoryId)
            .eq('drum_sheets.is_active', true)
        ]);

        const junctionSheets = (junctionResult.data || [])
          .map((row: any) => row.drum_sheets)
          .filter(Boolean);

        const sheetMap = new Map<string, any>();
        for (const sheet of [...(primaryResult.data || []), ...junctionSheets]) {
          if (sheet?.id && !sheetMap.has(sheet.id) && allowedCatIds.includes(sheet.category_id)) {
            sheetMap.set(sheet.id, sheet);
          }
        }

        data = Array.from(sheetMap.values())
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 12);
        error = primaryResult.error || junctionResult.error;
      } else {
        const result = await supabase
          .from('drum_sheets')
          .select(selectFields)
          .eq('is_active', true)
          .in('category_id', allowedCatIds)
          .order('created_at', { ascending: false })
          .limit(12);

        data = result.data;
        error = result.error;
      }

      if (error) throw error;
      setLatestSheets(data || []);
    } catch (error) {
      console.error(t('home.console.latestSheetsLoadError'), error);
    }
  }, [t, categories]);

  const loadYoutubeLatestSheets = useCallback(async () => {
    try {
      const selectFields = 'id, title, artist, price, thumbnail_url, youtube_url, category_id, slug, sales_type, created_at';
      const youtubeCatIds = categories
        .filter(c => c.name === '드럼솔로' || c.name === '드럼커버')
        .map(c => c.id);

      if (youtubeCatIds.length === 0) return;

      const results = await Promise.all(
        youtubeCatIds.map(catId =>
          Promise.all([
            supabase
              .from('drum_sheets')
              .select(selectFields)
              .eq('is_active', true)
              .eq('category_id', catId)
              .order('created_at', { ascending: false })
              .limit(6),
            supabase
              .from('drum_sheet_categories')
              .select(`drum_sheets!inner (${selectFields})`)
              .eq('category_id', catId)
              .eq('drum_sheets.is_active', true)
          ])
        )
      );

      const sheetMap = new Map<string, any>();
      for (const [primaryResult, junctionResult] of results) {
        for (const sheet of (primaryResult.data || [])) {
          if (sheet?.id && !sheetMap.has(sheet.id)) sheetMap.set(sheet.id, sheet);
        }
        for (const row of (junctionResult.data || [])) {
          const sheet = (row as any).drum_sheets;
          if (sheet?.id && !sheetMap.has(sheet.id)) sheetMap.set(sheet.id, sheet);
        }
      }

      const sorted = Array.from(sheetMap.values())
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 6);

      setYoutubeLatestSheets(sorted);
    } catch (error) {
      console.error('YouTube 최신 악보 로드 오류:', error);
    }
  }, [categories]);

  const loadCategories = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name');

      if (error) throw error;

      // Genre order matching category page
      const genreOrder = ['가요', '팝', '락', 'CCM', '트로트/성인가요', '재즈', 'J-POP', 'OST', '드럼솔로', '드럼커버'];

      // Filter out drum lesson category and non-genre categories
      const excludedCategories = ['드럼레슨', '악보집', '루디먼트', '드럼테크닉', '기초/입문', '리듬패턴', '필인'];
      const filteredCategories = (data || []).filter(cat => !excludedCategories.includes(cat.name));

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
      // 자동 인기 정렬: 선택된 장르의 활성 악보 전체를 구매수·조회수 점수로 정렬해 상위 10개를 노출.
      // 관리자가 수동으로 순위를 입력하지 않아도 데이터 기반으로 자동 갱신된다.
      const { data: genreSheets, error: genreError } = await supabase
        .from('drum_sheets')
        .select('id, title, artist, price, thumbnail_url, youtube_url, category_id, created_at, slug, view_count_total, view_count_7d')
        .eq('is_active', true)
        .eq('category_id', selectedGenre);

      if (genreError) throw genreError;

      if (!genreSheets || genreSheets.length === 0) {
        setPopularSheets([]);
        return;
      }

      const sheetIds = genreSheets.map((sheet) => sheet.id);

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // 구매수는 order_items(완료 주문)에서 집계, 조회수는 drum_sheets 사전 집계 컬럼 사용
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

      const purchaseCountMap = new Map<string, number>();
      const recentPurchaseCountMap = new Map<string, number>();

      if (allOrderItems && !orderItemsError) {
        allOrderItems.forEach((item) => {
          if (item.drum_sheet_id) {
            purchaseCountMap.set(
              item.drum_sheet_id,
              (purchaseCountMap.get(item.drum_sheet_id) || 0) + 1
            );

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

      // 인기도 점수: 최근 데이터에 더 높은 가중치
      const recentPurchaseWeight = 2.0;
      const totalPurchaseWeight = 1.0;
      const recentViewWeight = 0.2;
      const totalViewWeight = 0.1;

      const sheetsWithScores = genreSheets.map((sheet) => {
        const totalPurchaseCount = purchaseCountMap.get(sheet.id) || 0;
        const recentPurchaseCount = recentPurchaseCountMap.get(sheet.id) || 0;
        const totalViewCount = sheet.view_count_total ?? 0;
        const recentViewCount = sheet.view_count_7d ?? 0;

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
          score,
        };
      });

      // 점수 내림차순 정렬. 동점 시: 최근 구매수 > 전체 구매수 > 최근 조회수 > 전체 조회수 > 최신순
      sheetsWithScores.sort((a, b) => {
        if (Math.abs(b.score - a.score) > 0.001) {
          return b.score - a.score;
        }
        if (b.recentPurchaseCount !== a.recentPurchaseCount) {
          return b.recentPurchaseCount - a.recentPurchaseCount;
        }
        if (b.totalPurchaseCount !== a.totalPurchaseCount) {
          return b.totalPurchaseCount - a.totalPurchaseCount;
        }
        if (b.recentViewCount !== a.recentViewCount) {
          return b.recentViewCount - a.recentViewCount;
        }
        if (b.totalViewCount !== a.totalViewCount) {
          return b.totalViewCount - a.totalViewCount;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      // 상위 10개 선택 후 보조 계산 필드 제거
      const finalSheets = sheetsWithScores.slice(0, 10).map(({
        totalPurchaseCount,
        recentPurchaseCount,
        totalViewCount,
        recentViewCount,
        score,
        view_count_total,
        view_count_7d,
        ...sheet
      }) => sheet);

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
    if (categories.length > 0 && !latestGenreTab) {
      setLatestGenreTab('all');
    }
  }, [categories, latestGenreTab]);

  useEffect(() => {
    if (categories.length > 0 && latestGenreTab) {
      loadLatestSheets(latestGenreTab === 'all' ? undefined : latestGenreTab);
    }
  }, [loadLatestSheets, categories.length, latestGenreTab]);

  useEffect(() => {
    if (categories.length > 0) {
      loadYoutubeLatestSheets();
    }
  }, [loadYoutubeLatestSheets, categories.length]);

  useEffect(() => {
    // Popular Sheets에서 첫 번째 장르를 자동 선택 (카테고리 로드 후, selectedGenre가 비어있을 때만)
    if (categories.length > 0 && !selectedGenre) {
      // 글로벌 사이트용 장르 순서 정의
      const globalGenreOrder = ['팝', '락', '가요', '재즈', 'J-POP', 'OST', 'CCM', '트로트/성인가요', '드럼솔로', '드럼커버'];
      
      // 한국 사이트는 기존 categories 순서 사용, 글로벌 사이트는 새로운 순서 사용
      const sortedCategories = isKoreanSite
        ? categories
        : [...categories]
            .filter((c) => !GLOBAL_HIDDEN_GENRES.includes(c.name))
            .sort((a, b) => {
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

  const loadCollections = useCallback(async () => {
    if (!COLLECTIONS_PUBLIC_ENABLED) {
      setCollections([]);
      return;
    }
    try {
      const { data: collectionsData, error: collectionsError } = await supabase
        .from('collections')
        .select('id, title, description, title_translations, description_translations, thumbnail_url, original_price, sale_price, discount_percentage, slug, is_active')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (collectionsError) throw collectionsError;

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
      console.error(t('home.console.collectionLoadError'), error);
    }
  }, [t]);

  const loadFreeLessonSheets = useCallback(async () => {
    try {
      // 1. '드럼레슨' 카테고리 ID 찾기
      const { data: lessonCategory, error: catError } = await supabase
        .from('categories')
        .select('id')
        .eq('name', '드럼레슨')
        .maybeSingle();

      if (catError || !lessonCategory) return;

      // 2. 해당 카테고리의 활성 교재 6권 가져오기
      const { data: sheets, error: sheetsError } = await supabase
        .from('drum_sheets')
        .select('id, title, title_translations, artist, difficulty, thumbnail_url, youtube_url, pdf_url, slug, created_at, price, page_count, categories ( name )')
        .eq('category_id', lessonCategory.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(12);

      if (sheetsError) throw sheetsError;
      // 무료 자료를 먼저 노출(free-first), 같은 그룹 내에서는 최신순
      const sorted = (sheets || []).slice().sort((a: any, b: any) => {
        const aFree = (a.price ?? 0) <= 0 ? 0 : 1;
        const bFree = (b.price ?? 0) <= 0 ? 0 : 1;
        if (aFree !== bFree) return aFree - bFree;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setFreeLessonSheets(sorted);
    } catch (error) {
      console.error('Free lesson sheets load error:', error);
    }
  }, []);

  // 드럼레슨 개별 자료 로드: 유형 카테고리(루디먼트/필인/리듬패턴/드럼테크닉/기초입문)에 직접 속한 악보
  const loadLessonMaterials = useCallback(async () => {
    try {
      const MATERIAL_TYPE_NAMES = ['루디먼트', '필인', '리듬패턴', '드럼테크닉', '기초/입문'];
      const { data: typeCats, error: catError } = await supabase
        .from('categories')
        .select('id, name')
        .in('name', MATERIAL_TYPE_NAMES);

      if (catError || !typeCats || typeCats.length === 0) return;

      const typeIds = typeCats.map((c: any) => c.id);
      const { data: sheets, error: sheetsError } = await supabase
        .from('drum_sheets')
        .select('id, title, title_translations, artist, difficulty, thumbnail_url, youtube_url, pdf_url, slug, created_at, price, page_count, categories ( name )')
        .in('category_id', typeIds)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(12);

      if (sheetsError) throw sheetsError;
      // 무료 자료 먼저(free-first), 같은 그룹 내 최신순
      const sorted = (sheets || []).slice().sort((a: any, b: any) => {
        const aFree = (a.price ?? 0) <= 0 ? 0 : 1;
        const bFree = (b.price ?? 0) <= 0 ? 0 : 1;
        if (aFree !== bFree) return aFree - bFree;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setLessonMaterials(sorted);
    } catch (error) {
      console.error('Lesson materials load error:', error);
    }
  }, []);

  const loadSheetBooks = useCallback(async () => {
    try {
      const { data: mainCategory, error: catError } = await supabase
        .from('categories')
        .select('id')
        .eq('name', SHEET_BOOK_MAIN_CATEGORY_NAME)
        .maybeSingle();

      if (catError || !mainCategory) return;

      const { data: sheets, error: sheetsError } = await supabase
        .from('drum_sheets')
        .select('id, title, title_translations, artist, thumbnail_url, slug, created_at, price, page_count')
        .eq('category_id', mainCategory.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(12);

      if (sheetsError) throw sheetsError;

      const rows = sheets || [];
      const ids = rows.map((s: { id: string }) => s.id);
      const genreMap = new Map<string, string[]>();

      if (ids.length > 0) {
        const known = new Set<string>(SHEET_BOOK_GENRE_NAMES);
        const { data: typeRows } = await supabase
          .from('drum_sheet_categories')
          .select('sheet_id, categories ( name )')
          .in('sheet_id', ids);

        for (const row of typeRows ?? []) {
          const name = (row as { categories?: { name?: string } }).categories?.name;
          if (!name || !known.has(name)) continue;
          const arr = genreMap.get(row.sheet_id) ?? [];
          arr.push(name);
          genreMap.set(row.sheet_id, arr);
        }
      }

      setSheetBooks(
        rows.map((sheet: any) => ({
          id: sheet.id,
          title: sheet.title,
          title_translations: sheet.title_translations ?? null,
          artist: sheet.artist,
          thumbnail_url: sheet.thumbnail_url,
          slug: sheet.slug,
          price: sheet.price,
          page_count: sheet.page_count,
          genres: genreMap.get(sheet.id) ?? [],
        })),
      );
    } catch (error) {
      console.error('Sheet books load error:', error);
    }
  }, []);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  useEffect(() => {
    loadFreeLessonSheets();
  }, [loadFreeLessonSheets]);

  useEffect(() => {
    loadLessonMaterials();
  }, [loadLessonMaterials]);

  useEffect(() => {
    loadSheetBooks();
  }, [loadSheetBooks]);

  // Collections slider helpers
  const getCollectionLocalizedTitle = (collection: HomeCollection) => {
    if (i18n.language === 'ko') return collection.title;
    if (collection.title_translations && collection.title_translations['en']) {
      return collection.title_translations['en'];
    }
    return collection.title;
  };

  /** 드럼레슨 교재: 한국어 사이트는 한글 제목, 그 외는 영문 제목(없으면 한글) */
  const getFreeLessonSheetTitle = (sheet: FreeLessonSheet) => {
    if (i18n.language === 'ko') return sheet.title;
    const en = sheet.title_translations?.en?.trim();
    return en || sheet.title;
  };

  const getSheetBookTitle = (book: HomeSheetBook) => {
    if (i18n.language === 'ko') return book.title;
    const en = book.title_translations?.en?.trim();
    return en || book.title;
  };

  const getSheetBookGenreLabel = (genreName: string) => {
    if (i18n.language === 'ko') return genreName;
    const key = SHEET_BOOK_GENRE_I18N_KEYS[genreName as keyof typeof SHEET_BOOK_GENRE_I18N_KEYS];
    return key ? t(`categoriesPage.categories.${key}`) : genreName;
  };

  const getCollectionLocalizedDescription = (collection: HomeCollection) => {
    if (i18n.language === 'ko') return collection.description;
    if (collection.description_translations && collection.description_translations['en']) {
      return collection.description_translations['en'];
    }
    return collection.description;
  };

  const getGenreDisplayName = (categoryName: string | null | undefined): string => {
    if (!categoryName) return '';
    if (i18n.language === 'ko') return categoryName;
    if (i18n.language === 'ja') {
      const map: Record<string, string> = {
        '가요': t('category.kpop'), '팝': t('category.pop'), '락': t('category.rock'),
        'CCM': t('category.ccm'), '트로트/성인가요': t('category.trot'), '재즈': t('category.jazz'),
        'J-POP': t('category.jpop'), 'OST': t('category.ost'),
        '드럼솔로': t('category.drumSolo'), '드럼커버': t('category.drumCover'),
      };
      return map[categoryName] || categoryName;
    }
    const map: Record<string, string> = {
      '가요': t('categoriesPage.categories.kpop'), '팝': t('categoriesPage.categories.pop'),
      '락': t('categoriesPage.categories.rock'), 'CCM': t('categoriesPage.categories.ccm'),
      '트로트/성인가요': t('categoriesPage.categories.trot'), '재즈': t('categoriesPage.categories.jazz'),
      'J-POP': t('categoriesPage.categories.jpop'), 'OST': t('categoriesPage.categories.ost'),
      '드럼솔로': t('categoriesPage.categories.drumSolo'), '드럼커버': t('categoriesPage.categories.drumCover'),
    };
    return map[categoryName] || categoryName;
  };

  const getYouTubeThumbnailUrl = (sheet: DrumSheet): string => {
    if (sheet.thumbnail_url) return sheet.thumbnail_url;
    if (sheet.youtube_url) {
      const videoId = extractVideoId(sheet.youtube_url);
      if (videoId) return `https://i.ytimg.com/vi/${videoId}/hq720.jpg`;
    }
    return generateDefaultThumbnail(1280, 720);
  };

  // PC: 3 items per page, Mobile: 1 item per page
  const pcItemsPerSlide = 3;
  const totalPcSlides = Math.max(1, Math.ceil(collections.length / pcItemsPerSlide));

  const handleCollectionPrev = () => {
    setCollectionSlideIndex((prev) => (prev <= 0 ? totalPcSlides - 1 : prev - 1));
  };
  const handleCollectionNext = () => {
    setCollectionSlideIndex((prev) => (prev >= totalPcSlides - 1 ? 0 : prev + 1));
  };

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

  const getFreeLessonDifficultyLabel = (difficulty: string | null): string => {
    if (!difficulty) return '';
    const normalized = difficulty.toLowerCase();
    if (normalized.includes('beginner') || normalized.includes('초급')) return t('freeSheets.difficulty.beginner');
    if (normalized.includes('intermediate') || normalized.includes('중급')) return t('freeSheets.difficulty.intermediate');
    if (normalized.includes('advanced') || normalized.includes('고급')) return t('freeSheets.difficulty.advanced');
    return difficulty;
  };

  const getFreeLessonDifficultyColor = (difficulty: string | null): string => {
    if (!difficulty) return 'bg-gray-100 text-gray-500';
    const normalized = difficulty.toLowerCase();
    if (normalized.includes('beginner') || normalized.includes('초급')) return 'bg-emerald-100 text-emerald-700';
    if (normalized.includes('intermediate') || normalized.includes('중급')) return 'bg-amber-100 text-amber-700';
    if (normalized.includes('advanced') || normalized.includes('고급')) return 'bg-rose-100 text-rose-700';
    return 'bg-gray-100 text-gray-600';
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

      {/* Hero Section - 최상단 (가치 제안) */}
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
                  onClick={() => router.push('/categories')}
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
                  onClick={() => router.push('/categories')}
                  className="inline-flex items-center justify-center bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2.5 rounded-full hover:from-blue-700 hover:to-purple-700 font-semibold whitespace-nowrap cursor-pointer transition-all duration-300 shadow-lg"
                >
                  {t('home.banner.browseButton')}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Main Content */}
      <div className="px-4 pb-8 pt-6 sm:px-6 lg:px-8 ">
        {/* Latest Sheets - 최상단에 배치 */}
        <section className="py-6 md:py-12">
          <div className="max-w-7xl mx-auto space-y-8">
            {/* 모바일 최신 악보 */}
            <div className="md:hidden">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-2xl font-bold text-gray-900">{t('home.latestSheets')}</h3>
              </div>
              {/* 모바일 장르 탭 */}
              <div className="overflow-x-auto -mx-4 px-4 mb-4">
                <div className="flex gap-2 pb-1">
                  <button
                    type="button"
                    onClick={() => setLatestGenreTab('all')}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                      latestGenreTab === 'all'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {t('home.all')}
                  </button>
                  {latestGenreList.map((genreName) => {
                    const cat = categories.find(c => c.name === genreName);
                    if (!cat) return null;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setLatestGenreTab(cat.id)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                          latestGenreTab === cat.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {getGenreDisplayName(genreName)}
                      </button>
                    );
                  })}
                </div>
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
                          <div className="flex items-center justify-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold line-clamp-2 leading-tight">{sheet.title}</h4>
                          </div>
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

            {/* 데스크톱 최신 악보 */}
            <div className="hidden md:block">
              <h3 className="mb-4 text-left text-3xl font-bold text-gray-900">{t('home.latestSheets')}</h3>
              {/* 데스크톱 장르 탭 */}
              <div className="mb-6 flex flex-wrap gap-2">
                <button
                  onClick={() => setLatestGenreTab('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    latestGenreTab === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t('home.all')}
                </button>
                {latestGenreList.map((genreName) => {
                  const cat = categories.find(c => c.name === genreName);
                  if (!cat) return null;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setLatestGenreTab(cat.id)}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                        latestGenreTab === cat.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {getGenreDisplayName(genreName)}
                    </button>
                  );
                })}
              </div>
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

        {/* Drum Lesson Materials Section (개별 자료) — 교재와 분리 노출, 무료 유입 */}
        {lessonMaterials.length > 0 && (
          <section className="py-8 md:py-16">
            <div className="max-w-7xl mx-auto">
              <div className="mb-5 md:mb-8 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-2xl md:text-3xl font-bold text-gray-900">{t('home.lessonMaterialTitle')}</h3>
                    <span className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[10px] md:text-xs font-bold px-2 py-0.5 rounded-full">
                      {t('home.lessonMaterialBadge')}
                    </span>
                  </div>
                  <p className="hidden md:block text-gray-500 mt-1">{t('home.lessonMaterialDescription')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push('/free-sheets?tab=materials')}
                  className="text-sm text-gray-500 hover:text-gray-700 hidden md:inline-flex items-center gap-1 whitespace-nowrap"
                >
                  {t('home.lessonMaterialViewAll')} &gt;
                </button>
              </div>

              {/* Mobile: horizontal scroll */}
              <div className="md:hidden">
                <div
                  ref={lessonMaterialSliderRef}
                  className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-4 -mx-4 px-4"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {lessonMaterials.map((sheet) => {
                    const price = Math.max(0, sheet.price ?? 0);
                    const isFree = price === 0;
                    return (
                      <div key={sheet.id} className="flex-shrink-0 w-[44%] snap-start">
                        <button
                          type="button"
                          onClick={() => router.push(`/drum-sheet/${sheet.slug}`)}
                          className="block w-full text-left bg-white rounded-2xl shadow-md overflow-hidden hover:shadow-lg transition-shadow"
                        >
                          <div className="relative aspect-[3/4] bg-gradient-to-br from-emerald-50 to-teal-50 overflow-hidden">
                            <img
                              src={sheet.thumbnail_url || generateDefaultThumbnail(600, 800)}
                              alt={getFreeLessonSheetTitle(sheet)}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const img = e.target as HTMLImageElement;
                                img.src = generateDefaultThumbnail(600, 800);
                              }}
                            />
                            <span className="absolute top-2 left-2 bg-white/95 text-teal-700 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-md shadow-sm">
                              PDF
                            </span>
                            {isFree && (
                              <span className="absolute top-2 right-2 bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md shadow-sm">
                                {t('freeSheets.price.free')}
                              </span>
                            )}
                          </div>
                          <div className="p-3">
                            <h4 className="font-bold text-gray-900 text-sm line-clamp-2 leading-snug mb-1">
                              {getFreeLessonSheetTitle(sheet)}
                            </h4>
                            <p className="text-[11px] text-gray-500 line-clamp-1 mb-2">{sheet.categories?.name ?? sheet.artist}</p>
                            <div className="text-base font-extrabold text-gray-900">
                              {isFree ? t('freeSheets.price.free') : formatCurrency(price)}
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex justify-center">
                  <button
                    type="button"
                    onClick={() => router.push('/free-sheets?tab=materials')}
                    className="inline-flex items-center justify-center gap-1.5 px-6 py-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold shadow-sm hover:from-emerald-600 hover:to-teal-600 transition-all"
                  >
                    <i className="ri-music-2-line text-sm"></i>
                    {t('home.lessonMaterialViewAll')}
                  </button>
                </div>
              </div>

              {/* PC: 4-column grid */}
              <div className="hidden md:block">
                <div className="grid grid-cols-4 gap-6">
                  {lessonMaterials.slice(0, 8).map((sheet) => {
                    const price = Math.max(0, sheet.price ?? 0);
                    const isFree = price === 0;
                    return (
                      <button
                        key={sheet.id}
                        type="button"
                        onClick={() => router.push(`/drum-sheet/${sheet.slug}`)}
                        className="text-left bg-white rounded-2xl shadow-md overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
                      >
                        <div className="relative aspect-[3/4] bg-gradient-to-br from-emerald-50 to-teal-50 overflow-hidden">
                          <img
                            src={sheet.thumbnail_url || generateDefaultThumbnail(600, 800)}
                            alt={getFreeLessonSheetTitle(sheet)}
                            className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                            onError={(e) => {
                              const img = e.target as HTMLImageElement;
                              img.src = generateDefaultThumbnail(600, 800);
                            }}
                          />
                          <span className="absolute top-3 left-3 bg-white/95 text-teal-700 text-[11px] font-bold tracking-wider px-2 py-0.5 rounded-md shadow-sm">
                            PDF
                          </span>
                          {isFree && (
                            <span className="absolute top-10 left-3 bg-emerald-500 text-white text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md shadow-sm">
                              {t('freeSheets.price.free')}
                            </span>
                          )}
                          {sheet.difficulty && (
                            <span className={`absolute top-3 right-3 text-[11px] font-semibold px-2 py-0.5 rounded-full ${getFreeLessonDifficultyColor(sheet.difficulty)}`}>
                              {getFreeLessonDifficultyLabel(sheet.difficulty)}
                            </span>
                          )}
                        </div>
                        <div className="p-4">
                          <h4 className="font-bold text-gray-900 text-sm line-clamp-2 leading-snug mb-1 hover:text-teal-600 transition-colors">
                            {getFreeLessonSheetTitle(sheet)}
                          </h4>
                          <p className="text-xs text-gray-500 line-clamp-1 mb-3">{sheet.categories?.name ?? sheet.artist}</p>
                          <div className="text-lg font-extrabold text-gray-900">
                            {isFree ? t('freeSheets.price.free') : formatCurrency(price)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={() => router.push('/free-sheets?tab=materials')}
                    className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold shadow-md hover:from-emerald-600 hover:to-teal-600 transition-all cursor-pointer"
                  >
                    <i className="ri-music-2-line"></i>
                    {t('home.lessonMaterialViewAll')}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Drum Lesson Books Section (책표지형 카드) — 무료/레슨 상위 노출 */}
        {freeLessonSheets.length > 0 && (
          <section className="py-8 md:py-16">
            <div className="max-w-7xl mx-auto">
              {/* Section Header */}
              <div className="mb-5 md:mb-8 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-2xl md:text-3xl font-bold text-gray-900">{t('home.freeLessonTitle')}</h3>
                    <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] md:text-xs font-bold px-2 py-0.5 rounded-full">
                      {t('home.freeLessonBadge')}
                    </span>
                  </div>
                  <p className="hidden md:block text-gray-500 mt-1">{t('home.freeLessonDescription')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push('/free-sheets?tab=books')}
                  className="text-sm text-gray-500 hover:text-gray-700 hidden md:inline-flex items-center gap-1 whitespace-nowrap"
                >
                  {t('home.freeLessonViewAll')} &gt;
                </button>
              </div>

              {/* ===== Mobile: horizontal scroll book covers ===== */}
              <div className="md:hidden">
                <div
                  ref={freeLessonSliderRef}
                  className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-4 -mx-4 px-4"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {freeLessonSheets.map((sheet) => {
                    const price = Math.max(0, sheet.price ?? 0);
                    const isFree = price === 0;
                    return (
                      <div
                        key={sheet.id}
                        className="flex-shrink-0 w-[44%] snap-start"
                      >
                        <button
                          type="button"
                          onClick={() => router.push(`/drum-sheet/${sheet.slug}`)}
                          className="block w-full text-left bg-white rounded-2xl shadow-md overflow-hidden hover:shadow-lg transition-shadow"
                        >
                          {/* Book Cover (3:4 portrait) */}
                          <div className="relative aspect-[3/4] bg-gradient-to-br from-amber-50 to-orange-50 overflow-hidden">
                            <img
                              src={sheet.thumbnail_url || generateDefaultThumbnail(600, 800)}
                              alt={getFreeLessonSheetTitle(sheet)}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const img = e.target as HTMLImageElement;
                                img.src = generateDefaultThumbnail(600, 800);
                              }}
                            />
                            {/* PDF badge */}
                            <span className="absolute top-2 left-2 bg-white/95 text-orange-700 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-md shadow-sm">
                              PDF
                            </span>
                            {/* FREE badge */}
                            {isFree && (
                              <span className="absolute top-2 right-2 bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md shadow-sm">
                                {t('freeSheets.price.free')}
                              </span>
                            )}
                            {/* Page count */}
                            {sheet.page_count ? (
                              <span className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm">
                                {sheet.page_count}p
                              </span>
                            ) : null}
                          </div>
                          {/* Content */}
                          <div className="p-3">
                            <h4 className="font-bold text-gray-900 text-sm line-clamp-2 leading-snug mb-1">
                              {getFreeLessonSheetTitle(sheet)}
                            </h4>
                            <p className="text-[11px] text-gray-500 line-clamp-1 mb-2">{sheet.artist}</p>
                            <div className="text-base font-extrabold text-gray-900">
                              {isFree ? t('freeSheets.price.free') : formatCurrency(price)}
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
                {/* Mobile: View All button */}
                <div className="mt-3 flex justify-center">
                  <button
                    type="button"
                    onClick={() => router.push('/free-sheets?tab=books')}
                    className="inline-flex items-center justify-center gap-1.5 px-6 py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold shadow-sm hover:from-amber-600 hover:to-orange-600 transition-all"
                  >
                    <i className="ri-book-2-line text-sm"></i>
                    {t('home.freeLessonViewAll')}
                  </button>
                </div>
              </div>

              {/* ===== PC: 4-column book grid ===== */}
              <div className="hidden md:block">
                <div className="grid grid-cols-4 gap-6">
                  {freeLessonSheets.slice(0, 8).map((sheet) => {
                    const price = Math.max(0, sheet.price ?? 0);
                    const isFree = price === 0;
                    return (
                      <button
                        key={sheet.id}
                        type="button"
                        onClick={() => router.push(`/drum-sheet/${sheet.slug}`)}
                        className="text-left bg-white rounded-2xl shadow-md overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
                      >
                        {/* Book Cover (3:4 portrait) */}
                        <div className="relative aspect-[3/4] bg-gradient-to-br from-amber-50 to-orange-50 overflow-hidden">
                          <img
                            src={sheet.thumbnail_url || generateDefaultThumbnail(600, 800)}
                            alt={getFreeLessonSheetTitle(sheet)}
                            className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                            onError={(e) => {
                              const img = e.target as HTMLImageElement;
                              img.src = generateDefaultThumbnail(600, 800);
                            }}
                          />
                          <span className="absolute top-3 left-3 bg-white/95 text-orange-700 text-[11px] font-bold tracking-wider px-2 py-0.5 rounded-md shadow-sm">
                            PDF
                          </span>
                          {isFree && (
                            <span className="absolute top-10 left-3 bg-emerald-500 text-white text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md shadow-sm">
                              {t('freeSheets.price.free')}
                            </span>
                          )}
                          {sheet.page_count ? (
                            <span className="absolute bottom-3 left-3 bg-black/60 text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-full backdrop-blur-sm">
                              {sheet.page_count}p
                            </span>
                          ) : null}
                          {sheet.difficulty && (
                            <span className={`absolute top-3 right-3 text-[11px] font-semibold px-2 py-0.5 rounded-full ${getFreeLessonDifficultyColor(sheet.difficulty)}`}>
                              {getFreeLessonDifficultyLabel(sheet.difficulty)}
                            </span>
                          )}
                        </div>
                        {/* Content */}
                        <div className="p-4">
                          <h4 className="font-bold text-gray-900 text-sm line-clamp-2 leading-snug mb-1 hover:text-orange-600 transition-colors">
                            {getFreeLessonSheetTitle(sheet)}
                          </h4>
                          <p className="text-xs text-gray-500 line-clamp-1 mb-3">{sheet.artist}</p>
                          <div className="text-lg font-extrabold text-gray-900">
                            {isFree ? t('freeSheets.price.free') : formatCurrency(price)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {/* PC: View All Button */}
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={() => router.push('/free-sheets?tab=books')}
                    className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold shadow-md hover:from-amber-600 hover:to-orange-600 transition-all cursor-pointer"
                  >
                    <i className="ri-book-2-line"></i>
                    {t('home.freeLessonViewAll')}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Sheet Books Section — 드럼레슨 교재 바로 아래 */}
        {sheetBooks.length > 0 && (
          <section className="py-8 md:py-16">
            <div className="max-w-7xl mx-auto">
              <div className="mb-5 md:mb-8 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-2xl md:text-3xl font-bold text-gray-900">{t('sheetBooks.title')}</h3>
                    <span className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-[10px] md:text-xs font-bold px-2 py-0.5 rounded-full">
                      {t('sheetBooks.badge')}
                    </span>
                  </div>
                  <p className="hidden md:block text-gray-500 mt-1">{t('sheetBooks.description')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push('/sheet-books')}
                  className="text-sm text-gray-500 hover:text-gray-700 hidden md:inline-flex items-center gap-1 whitespace-nowrap"
                >
                  {t('sheetBooks.actions.viewAll')} &gt;
                </button>
              </div>

              <div className="md:hidden">
                <div
                  ref={sheetBookSliderRef}
                  className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-4 -mx-4 px-4"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {sheetBooks.map((book) => {
                    const price = Math.max(0, book.price ?? 0);
                    const isFree = price === 0;
                    const primaryGenre = book.genres[0];
                    return (
                      <div key={book.id} className="flex-shrink-0 w-[44%] snap-start">
                        <button
                          type="button"
                          onClick={() => router.push(`/drum-sheet/${book.slug}`)}
                          className="block w-full text-left bg-white rounded-2xl shadow-md overflow-hidden hover:shadow-lg transition-shadow"
                        >
                          <div className="relative aspect-[3/4] bg-gradient-to-br from-indigo-50 to-violet-50 overflow-hidden">
                            <img
                              src={book.thumbnail_url || generateDefaultThumbnail(600, 800)}
                              alt={getSheetBookTitle(book)}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const img = e.target as HTMLImageElement;
                                img.src = generateDefaultThumbnail(600, 800);
                              }}
                            />
                            <span className="absolute top-2 left-2 bg-white/95 text-indigo-700 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-md shadow-sm">
                              PDF
                            </span>
                            {primaryGenre && (
                              <span className="absolute top-2 right-2 bg-indigo-600/90 text-white text-[10px] font-semibold px-2 py-0.5 rounded-md shadow-sm">
                                {getSheetBookGenreLabel(primaryGenre)}
                              </span>
                            )}
                            {book.page_count ? (
                              <span className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm">
                                {book.page_count}p
                              </span>
                            ) : null}
                          </div>
                          <div className="p-3">
                            <h4 className="font-bold text-gray-900 text-sm line-clamp-2 leading-snug mb-1">
                              {getSheetBookTitle(book)}
                            </h4>
                            <p className="text-[11px] text-gray-500 line-clamp-1 mb-2">{book.artist}</p>
                            <div className="text-base font-extrabold text-gray-900">
                              {isFree ? t('sheetBooks.price.free') : formatCurrency(price)}
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex justify-center">
                  <button
                    type="button"
                    onClick={() => router.push('/sheet-books')}
                    className="inline-flex items-center justify-center gap-1.5 px-6 py-2.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-sm font-semibold shadow-sm hover:from-indigo-600 hover:to-violet-600 transition-all"
                  >
                    <i className="ri-book-mark-line text-sm"></i>
                    {t('sheetBooks.actions.viewAll')}
                  </button>
                </div>
              </div>

              <div className="hidden md:block">
                <div className="grid grid-cols-4 gap-6">
                  {sheetBooks.slice(0, 8).map((book) => {
                    const price = Math.max(0, book.price ?? 0);
                    const isFree = price === 0;
                    const primaryGenre = book.genres[0];
                    return (
                      <button
                        key={book.id}
                        type="button"
                        onClick={() => router.push(`/drum-sheet/${book.slug}`)}
                        className="text-left bg-white rounded-2xl shadow-md overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
                      >
                        <div className="relative aspect-[3/4] bg-gradient-to-br from-indigo-50 to-violet-50 overflow-hidden">
                          <img
                            src={book.thumbnail_url || generateDefaultThumbnail(600, 800)}
                            alt={getSheetBookTitle(book)}
                            className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                            onError={(e) => {
                              const img = e.target as HTMLImageElement;
                              img.src = generateDefaultThumbnail(600, 800);
                            }}
                          />
                          <span className="absolute top-3 left-3 bg-white/95 text-indigo-700 text-[11px] font-bold tracking-wider px-2 py-0.5 rounded-md shadow-sm">
                            PDF
                          </span>
                          {primaryGenre && (
                            <span className="absolute top-3 right-3 bg-indigo-600/90 text-white text-[11px] font-semibold px-2 py-0.5 rounded-md shadow-sm">
                              {getSheetBookGenreLabel(primaryGenre)}
                            </span>
                          )}
                          {book.page_count ? (
                            <span className="absolute bottom-3 left-3 bg-black/60 text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-full backdrop-blur-sm">
                              {book.page_count}p
                            </span>
                          ) : null}
                        </div>
                        <div className="p-4">
                          <h4 className="font-bold text-gray-900 text-sm line-clamp-2 leading-snug mb-1 hover:text-indigo-600 transition-colors">
                            {getSheetBookTitle(book)}
                          </h4>
                          <p className="text-xs text-gray-500 line-clamp-1 mb-3">{book.artist}</p>
                          <div className="text-lg font-extrabold text-gray-900">
                            {isFree ? t('sheetBooks.price.free') : formatCurrency(price)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={() => router.push('/sheet-books')}
                    className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-semibold shadow-md hover:from-indigo-600 hover:to-violet-600 transition-all cursor-pointer"
                  >
                    <i className="ri-book-mark-line"></i>
                    {t('sheetBooks.actions.viewAll')}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Latest YouTube Sheets - 최신 유튜브 영상악보 */}
        {youtubeLatestSheets.length > 0 && (
          <section className="py-6 md:py-12">
            <div className="max-w-7xl mx-auto space-y-6">
              {/* 모바일 */}
              <div className="md:hidden">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-gray-900">{t('home.latestYoutubeSheets')}</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {youtubeLatestSheets.slice(0, 4).map((sheet) => {
                    const isFavorite = favoriteIds.has(sheet.id);
                    const isFavoriteLoading = favoriteLoadingIds.has(sheet.id);
                    const videoId = sheet.youtube_url ? extractVideoId(sheet.youtube_url) : '';
                    return (
                      <div
                        key={sheet.id}
                        onClick={() => router.push(`/drum-sheet/${sheet.slug}`)}
                        className="group relative cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:shadow-lg"
                      >
                        <div className="relative">
                          <div
                            className="aspect-video w-full bg-gray-200 transition duration-300 group-hover:brightness-95"
                            style={{
                              backgroundImage: `url(${getYouTubeThumbnailUrl(sheet)})`,
                              backgroundPosition: 'center',
                              backgroundSize: 'cover',
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                          {videoId && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-red-600 shadow-lg">
                                <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleToggleFavorite(sheet.id);
                            }}
                            disabled={isFavoriteLoading}
                            className={`absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full shadow transition-colors ${
                              isFavorite
                                ? 'bg-red-50 text-red-500 border border-red-200'
                                : 'bg-white/90 text-gray-500 hover:text-red-500'
                            } ${isFavoriteLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            <i className={`ri-heart-${isFavorite ? 'fill' : 'line'} text-base`} />
                          </button>
                        </div>
                        <div className="p-3">
                          <h4 className="text-sm font-bold text-gray-900 line-clamp-2 leading-tight">{sheet.title}</h4>
                          <p className="text-xs font-medium text-blue-600 mt-0.5">{sheet.artist}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => router.push('/categories?category=drum-solo')}
                    className="inline-flex items-center justify-center px-6 py-2.5 rounded-full bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 transition-colors"
                  >
                    {t('home.showMore')}
                  </button>
                </div>
              </div>

              {/* 데스크톱 */}
              <div className="hidden md:block">
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-3xl font-bold text-gray-900">{t('home.latestYoutubeSheets')}</h3>
                </div>
                <div className="grid grid-cols-3 gap-5">
                  {youtubeLatestSheets.slice(0, 6).map((sheet) => {
                    const isFavorite = favoriteIds.has(sheet.id);
                    const isFavoriteLoading = favoriteLoadingIds.has(sheet.id);
                    const videoId = sheet.youtube_url ? extractVideoId(sheet.youtube_url) : '';
                    return (
                      <div
                        key={sheet.id}
                        onClick={() => router.push(`/drum-sheet/${sheet.slug}`)}
                        className="group relative cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:shadow-lg"
                      >
                        <div className="relative">
                          <div
                            className="aspect-video w-full bg-gray-200 transition duration-300 group-hover:brightness-95"
                            style={{
                              backgroundImage: `url(${getYouTubeThumbnailUrl(sheet)})`,
                              backgroundPosition: 'center',
                              backgroundSize: 'cover',
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                          {videoId && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-red-600 shadow-lg transition-transform group-hover:scale-110">
                                <svg className="w-7 h-7 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleToggleFavorite(sheet.id);
                            }}
                            disabled={isFavoriteLoading}
                            className={`absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full shadow transition-colors ${
                              isFavorite
                                ? 'bg-red-50 text-red-500 border border-red-200'
                                : 'bg-white/90 text-gray-500 hover:text-red-500 hover:bg-red-50/80'
                            } ${isFavoriteLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            <i className={`ri-heart-${isFavorite ? 'fill' : 'line'} text-lg`} />
                          </button>
                        </div>
                        <div className="p-4">
                          <h4 className="text-base font-bold text-gray-900 line-clamp-2 leading-tight">{sheet.title}</h4>
                          <p className="text-sm font-medium text-blue-600 mt-0.5">{sheet.artist}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

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
                    : [...categories]
                        .filter((c) => !GLOBAL_HIDDEN_GENRES.includes(c.name))
                        .sort((a, b) => {
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

        {/* Collections Section */}
        {COLLECTIONS_PUBLIC_ENABLED && collections.length > 0 && (
          <section className="py-6 md:py-16">
            <div className="max-w-7xl mx-auto">
              {/* Section Header */}
              <div className="mb-6 md:mb-8 flex items-center justify-between">
                <div>
                  <h3 className="text-2xl md:text-3xl font-bold text-gray-900">{t('home.collections')}</h3>
                  <p className="hidden md:block text-gray-500 mt-1">{t('home.collectionsDescription')}</p>
                </div>
                <a
                  href="/collections"
                  className="text-sm text-gray-500 hover:text-gray-700 hidden md:inline-flex items-center gap-1"
                >
                  {t('home.viewAllCollections')} &gt;
                </a>
              </div>

              {/* Mobile: 1 item per slide with scroll-snap */}
              <div className="md:hidden">
                <div
                  ref={collectionSliderRef}
                  className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-4"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {collections.map((collection) => (
                    <div
                      key={collection.id}
                      onClick={() => router.push(`/collections/${collection.slug || collection.id}`)}
                      className="flex-shrink-0 w-[85%] snap-center cursor-pointer"
                    >
                      <div className="bg-white rounded-2xl shadow-md overflow-hidden transition-transform hover:scale-[1.02]">
                        {/* Thumbnail */}
                        <div className="relative aspect-[4/3] bg-gray-200">
                          {collection.thumbnail_url ? (
                            <img
                              src={collection.thumbnail_url}
                              alt={getCollectionLocalizedTitle(collection)}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                              <i className="ri-image-line text-5xl"></i>
                            </div>
                          )}
                          {/* Collection Badge */}
                          <div className="absolute top-3 left-3">
                            <span className="bg-blue-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                              {t('collectionsPage.collection.badge')}
                            </span>
                          </div>
                          {/* Discount Badge */}
                          {collection.discount_percentage > 0 && (
                            <div className="absolute top-3 right-3">
                              <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                                {t('collectionsPage.collection.discount', { percentage: collection.discount_percentage })}
                              </span>
                            </div>
                          )}
                        </div>
                        {/* Content */}
                        <div className="p-4">
                          <h4 className="font-bold text-gray-900 text-base line-clamp-3 leading-snug mb-1">
                            {getCollectionLocalizedTitle(collection)}
                          </h4>
                          <div className="text-xs text-gray-400 mb-2">
                            {t('home.songsIncluded', { count: collection.sheet_count || 0 })}
                          </div>
                          <div className="flex items-center gap-2">
                            {collection.original_price > collection.sale_price && (
                              <span className="text-xs text-gray-400 line-through">
                                {formatCurrency(collection.original_price)}
                              </span>
                            )}
                            <span className="text-lg font-bold text-blue-600">
                              {collection.sale_price > 0
                                ? formatCurrency(collection.sale_price)
                                : t('collectionsPage.collection.free')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Mobile: View All button */}
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => router.push('/collections')}
                    className="inline-flex items-center justify-center px-6 py-2.5 rounded-full bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 transition-colors"
                  >
                    {t('home.viewAllCollections')}
                  </button>
                </div>
              </div>

              {/* PC: 3 items per slide with navigation arrows */}
              <div className="hidden md:block relative">
                <div className="overflow-hidden">
                  <div
                    className="flex transition-transform duration-500 ease-in-out"
                    style={{ transform: `translateX(-${collectionSlideIndex * 100}%)` }}
                  >
                    {Array.from({ length: totalPcSlides }).map((_, slideIdx) => (
                      <div key={slideIdx} className="w-full flex-shrink-0">
                        <div className="grid grid-cols-3 gap-6">
                          {collections.slice(slideIdx * pcItemsPerSlide, slideIdx * pcItemsPerSlide + pcItemsPerSlide).map((collection) => (
                            <div
                              key={collection.id}
                              onClick={() => router.push(`/collections/${collection.slug || collection.id}`)}
                              className="bg-white rounded-2xl shadow-md overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
                            >
                              {/* Thumbnail */}
                              <div className="relative aspect-[4/3] bg-gray-200">
                                {collection.thumbnail_url ? (
                                  <img
                                    src={collection.thumbnail_url}
                                    alt={getCollectionLocalizedTitle(collection)}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                                    <i className="ri-image-line text-6xl"></i>
                                  </div>
                                )}
                                {/* Collection Badge */}
                                <div className="absolute top-3 left-3">
                                  <span className="bg-blue-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                                    {t('collectionsPage.collection.badge')}
                                  </span>
                                </div>
                                {/* Discount Badge */}
                                {collection.discount_percentage > 0 && (
                                  <div className="absolute top-3 right-3">
                                    <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                                      {t('collectionsPage.collection.discount', { percentage: collection.discount_percentage })}
                                    </span>
                                  </div>
                                )}
                              </div>
                              {/* Content */}
                              <div className="p-5">
                                <h4 className="font-bold text-gray-900 text-lg line-clamp-3 leading-snug mb-1">
                                  {getCollectionLocalizedTitle(collection)}
                                </h4>
                                {getCollectionLocalizedDescription(collection) && (
                                  <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                                    {getCollectionLocalizedDescription(collection)}
                                  </p>
                                )}
                                <div className="text-sm text-gray-400 mb-3">
                                  {t('home.songsIncluded', { count: collection.sheet_count || 0 })}
                                </div>
                                <div className="flex items-center gap-2">
                                  {collection.original_price > collection.sale_price && (
                                    <span className="text-sm text-gray-400 line-through">
                                      {formatCurrency(collection.original_price)}
                                    </span>
                                  )}
                                  <span className="text-xl font-bold text-blue-600">
                                    {collection.sale_price > 0
                                      ? formatCurrency(collection.sale_price)
                                      : t('collectionsPage.collection.free')}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Navigation Arrows (only show if more than 1 slide) */}
                {totalPcSlides > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={handleCollectionPrev}
                      className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors z-10"
                      aria-label={t('home.prevSlide')}
                    >
                      <i className="ri-arrow-left-s-line text-xl"></i>
                    </button>
                    <button
                      type="button"
                      onClick={handleCollectionNext}
                      className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors z-10"
                      aria-label={t('home.nextSlide')}
                    >
                      <i className="ri-arrow-right-s-line text-xl"></i>
                    </button>
                  </>
                )}

                {/* Slide Indicators */}
                {totalPcSlides > 1 && (
                  <div className="flex justify-center gap-2 mt-6">
                    {Array.from({ length: totalPcSlides }).map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setCollectionSlideIndex(idx)}
                        className={`w-2.5 h-2.5 rounded-full transition-colors ${
                          idx === collectionSlideIndex
                            ? 'bg-blue-600'
                            : 'bg-gray-300 hover:bg-gray-400'
                        }`}
                        aria-label={t('home.slideNumber', { number: idx + 1 })}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

      </div>

      {/* Drum Lesson Books CTA — 교재 판매 컨셉 */}
      <section className="py-10 md:py-16 bg-gradient-to-br from-amber-600 via-orange-600 to-rose-600 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-5 left-10 w-24 h-24 border-2 border-white rounded-2xl rotate-12"></div>
          <div className="absolute bottom-5 right-10 w-36 h-36 border-2 border-white rounded-2xl -rotate-6"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center gap-6 md:gap-12">
            {/* Text */}
            <div className="flex-1 text-center md:text-left">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm px-4 py-1.5 text-sm font-semibold tracking-wide text-white border border-white/30 mb-4">
                <i className="ri-book-2-line text-yellow-200"></i>
                {t('home.freeLessonBadge')}
              </span>
              <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold leading-tight mb-3 whitespace-pre-line">
                {t('home.freeLessonCTATitle')}
              </h3>
              <p className="text-orange-50 text-sm sm:text-base md:text-lg leading-relaxed mb-6 max-w-xl">
                {t('home.freeLessonCTADescription')}
              </p>
              <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-6">
                <span className="rounded-full border border-white/40 bg-white/10 backdrop-blur-sm px-3 py-1.5 text-sm flex items-center gap-1.5">
                  <i className="ri-download-cloud-line text-yellow-200"></i>
                  {t('freeSheets.features.freeDownload')}
                </span>
                <span className="rounded-full border border-white/40 bg-white/10 backdrop-blur-sm px-3 py-1.5 text-sm flex items-center gap-1.5">
                  <i className="ri-graduation-cap-line text-yellow-200"></i>
                  {t('freeSheets.features.categoryLearning')}
                </span>
                <span className="rounded-full border border-white/40 bg-white/10 backdrop-blur-sm px-3 py-1.5 text-sm flex items-center gap-1.5">
                  <i className="ri-medal-line text-yellow-200"></i>
                  {t('freeSheets.features.youtubeLesson')}
                </span>
              </div>
              <button
                onClick={() => router.push('/free-sheets?tab=books')}
                className="inline-flex items-center gap-2 bg-white text-orange-600 px-6 py-3 sm:px-8 sm:py-3.5 rounded-full hover:bg-orange-50 font-bold text-base sm:text-lg whitespace-nowrap cursor-pointer transition-all duration-300 shadow-lg active:scale-95"
              >
                <i className="ri-book-2-line"></i>
                {t('home.freeLessonCTAButton')}
              </button>
            </div>
            {/* Visual */}
            <div className="flex-shrink-0 w-48 h-48 md:w-64 md:h-64 relative hidden md:flex items-center justify-center">
              <div className="absolute inset-0 rounded-3xl bg-white/10 animate-pulse"></div>
              <div className="relative w-32 h-44 md:w-44 md:h-56 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/30 shadow-2xl rotate-3">
                <i className="ri-book-2-line text-6xl md:text-7xl text-white/90"></i>
              </div>
            </div>
          </div>
        </div>
      </section>

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
