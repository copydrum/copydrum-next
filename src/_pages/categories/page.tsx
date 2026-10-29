'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams} from 'next/navigation';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import React from 'react';
import { useCart } from '../../hooks/useCart';
import { generateDefaultThumbnail } from '../../lib/defaultThumbnail';
import { fetchUserFavorites, toggleFavorite } from '../../lib/favorites';
import MainHeader from '../../components/common/MainHeader';
import Footer from '../../components/common/Footer';
import { processCashPurchase } from '../../lib/cashPurchases';
import { hasPurchasedSheet } from '../../lib/purchaseCheck';
import StarRating from '../../components/reviews/StarRating';
import { fetchReviewStatsMap, type ReviewStatsMap } from '../../lib/reviews/reviewStats';
import { BankTransferInfoModal, PaymentMethodSelector, InsufficientCashModal, PayPalPaymentModal } from '../../components/payments';
import { VirtualAccountInfoModal } from '../../components/payments/VirtualAccountInfoModal';
import type { PaymentMethod } from '../../components/payments';
import { startSheetPurchase, buySheetNow } from '../../lib/payments';
import type { VirtualAccountInfo } from '../../lib/payments';
import { useTranslation } from 'react-i18next';

import { getSiteCurrency, convertFromKrw, formatCurrency as formatCurrencyUtil } from '../../lib/currency';
import { useSiteLanguage } from '../../hooks/useSiteLanguage';
import { useBuyNow } from '../../hooks/useBuyNow';
import { useEventSales } from '../../hooks/useEventSales';
import SalePrice from '../../components/event-sale/SalePrice';
import { useUserCredits } from '../../hooks/useUserCredits';
import Seo from '../../components/Seo';
import { buildCategorySeoStrings } from '../../lib/seo';
import { languageDomainMap } from '../../config/languageDomainMap';

interface Category {
  id: string;
  name: string;
  description: string;
  slug: string | null;
}

interface DrumSheet {
  id: string;
  title: string;
  artist: string;
  category_id: string;
  difficulty: string;
  price: number;
  tempo?: number;
  pdf_url: string;
  preview_image_url: string;
  is_featured: boolean;
  created_at: string;
  categories?: { name: string } | null;
  thumbnail_url?: string;
  album_name?: string;
  page_count?: number;
  sales_type?: 'INSTANT' | 'PREORDER';
  youtube_url?: string | null;
  category_ids?: string[]; // drum_sheet_categories에서 가져온 추가 카테고리 ID 목록
  slug: string;
}

/** DB에는 난이도가 한국어("초급/중급/고급")로 저장돼 있어 필터 값(beginner…)과 맞춘다 */
const DIFFICULTY_CODES: Record<string, string> = { 초급: 'beginner', 중급: 'intermediate', 고급: 'advanced' };
const normalizeDifficulty = (value: string | null | undefined) => (value ? DIFFICULTY_CODES[value.trim()] ?? value : '');

/** 인기 지표가 없어 '인기순'은 제공하지 않는다. 예전 링크의 sort=popular는 최신순으로 처리 */
const parseSortParam = (value: string | null | undefined) => (!value || value === 'popular' ? 'newest' : value);

const CategoriesPage: React.FC = () => {
  // ... existing code ...

  const searchParams = useSearchParams();
  const router = useLocaleRouter();
  const [user, setUser] = useState<User | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [drumSheets, setDrumSheets] = useState<DrumSheet[]>([]);
  const [reviewStats, setReviewStats] = useState<ReviewStatsMap>({});
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>(() => searchParams.get('category') || '');
  const [searchTerm, setSearchTerm] = useState<string>(() => searchParams.get('search') || '');
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<string>(() => parseSortParam(searchParams.get('sort')));
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>(() => searchParams.get('difficulty') || '');
  const [priceRange, setPriceRange] = useState(() => ({
    min: searchParams.get('priceMin') || '',
    max: searchParams.get('priceMax') || '',
  }));
  const [selectedArtist, setSelectedArtist] = useState<string>(() => searchParams.get('artist') || '');
  const [selectedAlbum, setSelectedAlbum] = useState<string>(() => searchParams.get('album') || '');
  const [showInstantOnly, setShowInstantOnly] = useState<boolean>(false); // 즉시 다운로드 필터
  const [currentPage, setCurrentPage] = useState<number>(() => {
    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    return Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
  });
  const ITEMS_PER_PAGE = 20;
  const ITEMS_PER_PAGE_YOUTUBE = 21;
  const MAX_CATEGORY_PAGES = 10;
  const CATEGORY_FETCH_LIMIT = ITEMS_PER_PAGE_YOUTUBE * MAX_CATEGORY_PAGES * 2;
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoriteLoadingIds, setFavoriteLoadingIds] = useState<Set<string>>(new Set());
  const [buyingSheetId, setBuyingSheetId] = useState<string | null>(null);
  const [showInsufficientCashModal, setShowInsufficientCashModal] = useState(false);
  const [insufficientCashInfo, setInsufficientCashInfo] = useState<{ currentBalance: number; requiredAmount: number } | null>(null);
  const [showPayPalModal, setShowPayPalModal] = useState(false);
  const { i18n, t } = useTranslation();
  const { isKoreanSite } = useSiteLanguage();
  const fetchIdRef = useRef(0);
  const genreNavRef = useRef<HTMLElement>(null);
  const [mounted, setMounted] = useState(false);
  const listKey = [selectedCategory, searchTerm.trim(), selectedArtist, selectedAlbum].join('|');
  const [loadedListKey, setLoadedListKey] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 목록의 악보들에 대한 리뷰 통계(별점) 배치 조회
  useEffect(() => {
    if (drumSheets.length === 0) {
      setReviewStats({});
      return;
    }
    let active = true;
    fetchReviewStatsMap(drumSheets.map((s) => s.id)).then((stats) => {
      if (active) setReviewStats(stats);
    });
    return () => {
      active = false;
    };
  }, [drumSheets]);

  // 통합 통화 로직 적용 (locale 기반)
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'copydrum.com';
  const currency = getSiteCurrency(hostname, i18n.language);

  // 장르 목록 (순서대로) - 한글 원본 (한글 사이트용)
  const genreListKo = ['가요', '팝', '락', 'CCM', '트로트/성인가요', '재즈', 'J-POP', 'OST', '드럼솔로', '드럼커버'];

  // 영문 사이트용 장르 순서 (기준 순서)
  const genreListEn = ['팝', '락', '가요', '재즈', 'J-POP', 'OST', 'CCM', '트로트/성인가요', '드럼솔로', '드럼커버'];

  // 현재 언어에 맞는 장르 목록 가져오기
  // 한국어(ko)는 genreListKo, 영어(en)는 genreListEn, 나머지 모든 언어는 genreListEn(영어 순서) 사용
  const genreList = i18n.language === 'ko' ? genreListKo : genreListEn;

  // 카테고리 이름을 번역하는 함수
  const getCategoryName = (categoryName: string | null | undefined): string => {
    if (!categoryName) return t('categoriesPage.categories.other');
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
      '기타': t('categoriesPage.categories.other'),
    };

    return categoryMap[categoryName] || categoryName;
  };

  // 난이도 이름을 번역하는 함수
  const getDifficultyName = (difficulty: string | null | undefined): string => {
    const code = normalizeDifficulty(difficulty);
    if (!code) return t('categoriesPage.difficultyNotSet');
    if (code === 'beginner') return t('categoriesPage.beginner');
    if (code === 'intermediate') return t('categoriesPage.intermediate');
    if (code === 'advanced') return t('categoriesPage.advanced');
    return code;
  };

  const { addToCart, isInCart } = useCart();

  // Helper: UUID 체크
  const isUUID = (str: string) => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  };

  // Helper: slug 또는 UUID를 category ID로 변환
  const getCategoryId = useCallback((slugOrId: string): string | null => {
    if (!slugOrId) return null;

    // UUID면 그대로 반환
    if (isUUID(slugOrId)) {
      return slugOrId;
    }

    // slug로 카테고리 찾기
    const category = categories.find(cat => cat.slug === slugOrId);
    return category ? category.id : null;
  }, [categories]);

  const updateQueryParams = useCallback(
    (updates: Record<string, string | null | undefined>, options: { replace?: boolean } = {}) => {
      const newParams = new URLSearchParams(searchParams?.toString() ?? '');
      Object.entries(updates).forEach(([key, value]) => {
        if (
          value === undefined ||
          value === null ||
          value === '' ||
          (key === 'page' && value === '1')
        ) {
          newParams.delete(key);
        } else {
          newParams.set(key, value);
        }
      });
      const qs = newParams.toString();
      const url = qs ? `/categories?${qs}` : '/categories';
      if (options.replace) {
        router.replace(url);
      } else {
        router.push(url);
      }
    },
    [searchParams, router]
  );

  useEffect(() => {
    checkAuth();
    loadCategories();
  }, []);

  useEffect(() => {
    if (!searchTerm.trim() && !selectedCategory && !selectedArtist && !selectedAlbum) {
      return;
    }
    // categories가 로드된 후에만 실행 (slug 변환을 위해 필요)
    if (categories.length > 0 || !selectedCategory) {
      loadDrumSheets();
    }
  }, [selectedCategory, searchTerm, selectedArtist, selectedAlbum, categories]);

  useEffect(() => {
    const categoryParam = searchParams.get('category');
    const searchParam = searchParams.get('search') || '';
    const sortParam = parseSortParam(searchParams.get('sort'));
    const difficultyParamRaw = searchParams.get('difficulty');
    const difficultyParam = difficultyParamRaw && difficultyParamRaw !== 'all' ? difficultyParamRaw : '';
    const priceMinParam = searchParams.get('priceMin') || '';
    const priceMaxParam = searchParams.get('priceMax') || '';
    const artistParam = searchParams.get('artist') || '';
    const albumParam = searchParams.get('album') || '';
    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const normalizedPage = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;

    // 카테고리 파라미터가 없고 검색어가 없으면 첫 번째 장르로 자동 이동
    if (!categoryParam && !searchParam.trim() && categories.length > 0) {
      const firstGenre = genreList[0];
      const firstCategory = categories.find(cat => cat.name === firstGenre);
      if (firstCategory) {
        // slug 우선 사용, 없으면 ID
        const categoryParam = firstCategory.slug || firstCategory.id;
        setSelectedCategory(categoryParam);
        const newParams = new URLSearchParams(searchParams?.toString() ?? '');
        newParams.set('category', categoryParam);
        newParams.delete('page');
        const qs = newParams.toString();
        router.replace(qs ? `/categories?${qs}` : '/categories');
        return;
      }
    }

    const categoryValue = categoryParam || '';
    if (selectedCategory !== categoryValue) {
      setSelectedCategory(categoryValue);
    }
    if (searchTerm !== searchParam) {
      setSearchTerm(searchParam);
    }
    if (sortBy !== sortParam) {
      setSortBy(sortParam);
    }
    if (selectedDifficulty !== difficultyParam) {
      setSelectedDifficulty(difficultyParam);
    }
    if (priceRange.min !== priceMinParam || priceRange.max !== priceMaxParam) {
      setPriceRange({ min: priceMinParam, max: priceMaxParam });
    }
    if (selectedArtist !== artistParam) {
      setSelectedArtist(artistParam);
    }
    if (selectedAlbum !== albumParam) {
      setSelectedAlbum(albumParam);
    }
    if (currentPage !== normalizedPage) {
      setCurrentPage(normalizedPage);
    }
  }, [
    searchParams,
    categories,
    selectedCategory,
    searchTerm,
    sortBy,
    selectedDifficulty,
    priceRange,
    selectedArtist,
    selectedAlbum,
    currentPage,
  ]);


  const checkAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    } catch (err) {
      console.error('Auth check failed:', err);
    }
  };

  // ✅ Buy Now는 useBuyNow 훅을 사용


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
    } catch (err) {
      console.error('찜 목록 로드 오류:', err);
    }
  }, [user]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);


  const loadCategories = async () => {
    try {
      // slug 컬럼이 없을 수도 있으므로 먼저 기본 필드만 조회
      let { data, error } = await supabase
        .from('categories')
        .select('id, name, description')
        .order('name');

      if (error) throw error;

      // slug 컬럼 존재 여부 확인 후 재조회
      if (data && data.length > 0) {
        const { data: dataWithSlug, error: slugError } = await supabase
          .from('categories')
          .select('id, name, description, slug')
          .order('name');

        // slug 컬럼이 있으면 slug 포함 데이터 사용, 없으면 기본 데이터 사용
        if (!slugError && dataWithSlug) {
          setCategories(dataWithSlug);
        } else {
          // slug 없으면 null로 처리
          setCategories(data.map(cat => ({ ...cat, slug: null })));
        }
      } else {
        setCategories(data ?? []);
      }
    } catch (err) {
      console.error('Category loading error:', err);
      setLoading(false);
    }
  };

  const normalizeSheets = (data: any[]): DrumSheet[] => {
    const sheetMap = new Map<string, DrumSheet>();

    data.forEach((sheet: any) => {
      const normalizedCategory =
        Array.isArray(sheet?.categories) && sheet.categories.length > 0
          ? sheet.categories[0]
          : sheet?.categories ?? null;

      const relationCategoryIds = Array.isArray(sheet?.drum_sheet_categories)
        ? sheet.drum_sheet_categories
            .map((relation: any) => relation?.category_id)
            .filter((id: string | null | undefined): id is string => Boolean(id))
        : [];

      const existing = sheetMap.get(sheet.id);
      const mergedCategoryIds = new Set<string>([
        ...(existing?.category_ids || []),
        ...relationCategoryIds,
      ]);

      sheetMap.set(sheet.id, {
        ...existing,
        ...sheet,
        categories: normalizedCategory ? { name: normalizedCategory.name ?? '' } : null,
        category_ids: Array.from(mergedCategoryIds),
      } as DrumSheet);
    });

    return Array.from(sheetMap.values());
  };

  const loadDrumSheets = async () => {
    const trimmedSearch = searchTerm.trim();
    const requestKey = listKey;
    if (!trimmedSearch && !selectedCategory && !selectedArtist && !selectedAlbum) {
      setDrumSheets([]);
      setLoadedListKey(requestKey);
      setLoading(false);
      return;
    }

    const fetchId = ++fetchIdRef.current;
    setLoading(true);

    const baseSelect =
      'id, title, artist, difficulty, price, category_id, tempo, pdf_url, preview_image_url, youtube_url, is_featured, created_at, thumbnail_url, album_name, page_count, slug, sales_type, categories (name), drum_sheet_categories (category_id)';

    try {
      if (trimmedSearch) {
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 통합 검색 로직 (cross-field flexible search)
        //
        // 지원 케이스:
        //  1) "윤종신 지난날"        → artist=윤종신, title=지난날 매칭
        //  2) "윤종신 - 지난날"      → 구분자(-, ·, |, /, : 등) 무시
        //  3) "윤종신 - 지 난날"     → 띄어쓰기 오류 무시 (정규화 키)
        //  4) "지난날"               → 단일 단어 부분 매칭
        //  5) "Heize Even if"        → 영문 다중 단어
        //  6) "헤이즈 (Heize) Even"  → 괄호 안 별칭/영문병기 무시
        //
        // 전략:
        //   A) DB에서는 광범위(loose) OR 쿼리로 후보 행을 가져옴
        //      - 각 단어 개별 ilike (title/artist/album_name)
        //      - normalized_key.ilike (artist+title 결합 정규화 키)
        //   B) 클라이언트에서 정밀 채점 (cross-field AND, 결합 매칭, 정규화)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // PostgREST ilike 패턴에서만 % 와 _ 를 escape 한다
        const escapePattern = (s: string) => s.replace(/[%_]/g, (m) => `\\${m}`);

        // 단어 분리용 클린업: 구분자/특수문자를 공백으로 치환
        // (대시 - 는 반드시 포함해야 "윤종신 - 지난날"이 ["윤종신","지난날"]로 분리됨)
        const cleanQuery = trimmedSearch.replace(
          /[()[\]{},.!?;:'"\-_~`@#$^&*+=|<>/\\·•∙ㆍ]/g,
          ' ',
        );
        const searchWords = cleanQuery
          .split(/\s+/)
          .filter((w) => w.length > 0);

        // normalized_key 컬럼과 동일한 방식으로 검색어 정규화
        // (괄호/대괄호 내용 제거 + 모든 공백 제거 + 한/영/숫자만 유지)
        const normalize = (s: string) =>
          s
            .toLowerCase()
            .replace(/\([^)]*\)/g, '')
            .replace(/\[[^\]]*\]/g, '')
            .replace(/\s+/g, '')
            .replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ]/g, '');

        const normalizedSearchQuery = normalize(trimmedSearch);

        // ── A) DB 광범위 OR 조회 (후보군 확보) ──────────────────
        const orConditions: string[] = [];

        // 각 단어를 title/artist/album_name 어디서든 매칭 (cross-field 후보군)
        searchWords.forEach((word) => {
          const wordPattern = `%${escapePattern(word)}%`;
          orConditions.push(`title.ilike.${wordPattern}`);
          orConditions.push(`artist.ilike.${wordPattern}`);
          orConditions.push(`album_name.ilike.${wordPattern}`);
        });

        // 정규화된 전체 검색어 (artist+title 결합/공백 오류/괄호 무시 모두 처리)
        if (normalizedSearchQuery.length > 0) {
          const normalizedPattern = `%${escapePattern(normalizedSearchQuery)}%`;
          orConditions.push(`normalized_key.ilike.${normalizedPattern}`);
        }

        if (orConditions.length === 0) {
          if (fetchId !== fetchIdRef.current) return;
          setDrumSheets([]);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('drum_sheets')
          .select(baseSelect)
          .eq('is_active', true)
          .or(orConditions.join(','))
          .order('created_at', { ascending: false })
          .limit(500); // 안전 상한선

        if (error) {
          throw error;
        }

        if (fetchId !== fetchIdRef.current) return;

        // ── B) 클라이언트 정밀 채점 & 필터링 ─────────────────────
        const exactLower = trimmedSearch.toLowerCase();
        const noSpacesLower = trimmedSearch.replace(/\s+/g, '').toLowerCase();

        const scored = (data || [])
          .map((sheet: any) => {
            const title: string = sheet.title || '';
            const artist: string = sheet.artist || '';
            const album: string = sheet.album_name || '';

            const titleLower = title.toLowerCase();
            const artistLower = artist.toLowerCase();
            const albumLower = album.toLowerCase();

            // 정규화 (괄호 제거 + 공백 제거 + 한/영/숫자만)
            const titleN = normalize(title);
            const artistN = normalize(artist);
            const albumN = normalize(album);

            // artist+title / title+artist 결합 (cross-field 매칭용)
            const combinedAT = artistN + titleN;
            const combinedTA = titleN + artistN;

            let score = 0;

            // (1) 원본 그대로 단일 필드 포함 (가장 높은 점수)
            if (titleLower.includes(exactLower)) score = 100;
            else if (artistLower.includes(exactLower)) score = 95;
            else if (albumLower.includes(exactLower)) score = 90;
            // (2) 공백 제거 후 단일 필드 포함
            else if (noSpacesLower && titleLower.replace(/\s+/g, '').includes(noSpacesLower)) score = 85;
            else if (noSpacesLower && artistLower.replace(/\s+/g, '').includes(noSpacesLower)) score = 80;
            else if (noSpacesLower && albumLower.replace(/\s+/g, '').includes(noSpacesLower)) score = 75;
            // (3) 정규화 후 단일 필드 포함 (괄호/특수문자 제거 효과)
            else if (normalizedSearchQuery && titleN.includes(normalizedSearchQuery)) score = 78;
            else if (normalizedSearchQuery && artistN.includes(normalizedSearchQuery)) score = 73;
            else if (normalizedSearchQuery && albumN.includes(normalizedSearchQuery)) score = 68;
            // (4) artist+title / title+artist 결합 매칭
            //     예: 검색 "윤종신지난날" → artistN("윤종신")+titleN("지난날")="윤종신지난날" 매칭
            else if (normalizedSearchQuery && combinedAT.includes(normalizedSearchQuery)) score = 65;
            else if (normalizedSearchQuery && combinedTA.includes(normalizedSearchQuery)) score = 62;
            // (5) 다중 단어 cross-field AND
            //     각 단어가 title/artist/album/결합 어디서든 매칭되면 통과
            //     예: "윤종신 지난날" → "윤종신"은 artistN, "지난날"은 titleN
            else if (searchWords.length > 1) {
              const allWordsMatch = searchWords.every((word) => {
                const wn = normalize(word);
                if (!wn) return true;
                return (
                  titleN.includes(wn) ||
                  artistN.includes(wn) ||
                  albumN.includes(wn) ||
                  combinedAT.includes(wn) ||
                  combinedTA.includes(wn)
                );
              });
              if (allWordsMatch) score = 50;
            }
            // (6) 단일 단어 — DB ilike가 이미 매칭했으므로 통과
            else if (searchWords.length === 1) {
              const wn = normalize(searchWords[0]);
              if (
                titleN.includes(wn) ||
                artistN.includes(wn) ||
                albumN.includes(wn)
              ) {
                score = 30;
              }
            }

            return { sheet, score };
          })
          .filter((item) => item.score > 0)
          .sort(
            (a, b) =>
              b.score - a.score ||
              new Date(b.sheet.created_at).getTime() -
                new Date(a.sheet.created_at).getTime(),
          )
          .map((item) => item.sheet);

        setDrumSheets(normalizeSheets(scored));
      } else if (selectedArtist || selectedAlbum) {
        // 아티스트나 앨범 필터가 있을 때는 카테고리 제한 없이 모든 곡을 가져옴
        let query = supabase
          .from('drum_sheets')
          .select(baseSelect)
          .eq('is_active', true);

        if (selectedArtist) {
          query = query.eq('artist', selectedArtist);
        }
        if (selectedAlbum) {
          query = query.eq('album_name', selectedAlbum);
        }

        const { data, error } = await query
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        if (fetchId !== fetchIdRef.current) return;
        setDrumSheets(normalizeSheets(data || []));
      } else {
        // selectedCategory가 slug 또는 UUID일 수 있으므로 ID로 변환
        const categoryId = getCategoryId(selectedCategory);

        if (!categoryId) {
          // 유효하지 않은 카테고리면 빈 결과 반환
          console.error('❌ Category ID not found for:', selectedCategory);
          if (fetchId !== fetchIdRef.current) return;
          setDrumSheets([]);
          setLoading(false);
          return;
        }

        // 두 개의 쿼리를 병렬 실행하여 URL 길이 초과 문제 방지
        // (기존: id.in.(수백 개 UUID) → URL Too Long 400 에러 발생)
        const [primaryResult, junctionResult] = await Promise.all([
          // 1) drum_sheets.category_id가 직접 일치하는 악보
          supabase
            .from('drum_sheets')
            .select(baseSelect)
            .eq('is_active', true)
            .eq('category_id', categoryId)
            .order('created_at', { ascending: false })
            .limit(CATEGORY_FETCH_LIMIT),
          // 2) drum_sheet_categories 조인을 통해 연결된 악보 (다중 카테고리 지원)
          supabase
            .from('drum_sheet_categories')
            .select(`
              drum_sheets!inner (
                id, title, artist, difficulty, price, category_id, tempo, pdf_url,
                preview_image_url, youtube_url, is_featured, created_at, thumbnail_url,
                album_name, page_count, slug, sales_type,
                categories (name)
              )
            `)
            .eq('category_id', categoryId)
            .eq('drum_sheets.is_active', true)
        ]);

        if (primaryResult.error) {
          console.error('❌ Primary query error:', primaryResult.error);
        }
        if (junctionResult.error) {
          console.error('❌ Junction query error:', junctionResult.error);
        }
        if (primaryResult.error && junctionResult.error) {
          throw primaryResult.error;
        }

        // junction 결과에서 drum_sheets 데이터 추출
        const junctionSheets = (junctionResult.data || [])
          .map((row: any) => row.drum_sheets)
          .filter(Boolean);

        // ID 기준 중복 제거 후 병합 (primary 결과 우선)
        const sheetMap = new Map<string, any>();
        for (const sheet of [...(primaryResult.data || []), ...junctionSheets]) {
          if (sheet?.id && !sheetMap.has(sheet.id)) {
            sheetMap.set(sheet.id, sheet);
          }
        }

        const mergedData = Array.from(sheetMap.values())
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, CATEGORY_FETCH_LIMIT);

        if (fetchId !== fetchIdRef.current) return;
        const normalized = normalizeSheets(mergedData);
        setDrumSheets(normalized.slice(0, ITEMS_PER_PAGE_YOUTUBE * MAX_CATEGORY_PAGES));
      }
    } catch (err) {
      console.error('Drum sheets loading error:', err);
    } finally {
      if (fetchId === fetchIdRef.current) {
        setLoadedListKey(requestKey);
        setLoading(false);
      }
    }
  };


  const getThumbnailUrl = (sheet: DrumSheet): string => {
    if (sheet.thumbnail_url) {
      return sheet.thumbnail_url;
    }
    // Spotify에서 썸네일을 가져오지 못한 경우 기본 썸네일 생성
    return generateDefaultThumbnail(400, 400);
  };

  const extractYouTubeVideoId = (url: string | null | undefined): string | null => {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('youtu.be')) return parsed.pathname.replace('/', '');
      if (parsed.searchParams.has('v')) return parsed.searchParams.get('v');
      const pathMatch = parsed.pathname.match(/\/embed\/([^/?]+)/);
      if (pathMatch && pathMatch[1]) return pathMatch[1];
      const shortsMatch = parsed.pathname.match(/\/shorts\/([^/?]+)/);
      if (shortsMatch && shortsMatch[1]) return shortsMatch[1];
    } catch {
      // ignore
    }
    return null;
  };

  const getYouTubeThumbnailUrl = (sheet: DrumSheet): string => {
    if (sheet.thumbnail_url) return sheet.thumbnail_url;
    const videoId = extractYouTubeVideoId(sheet.youtube_url);
    if (videoId) return `https://i.ytimg.com/vi/${videoId}/hq720.jpg`;
    return generateDefaultThumbnail(1280, 720);
  };

  // hq720·업로드 썸네일이 없으면 hqdefault → 기본 썸네일 순으로 대체.
  // YouTube는 없는 썸네일에 오류 대신 120x90 회색 이미지를 주므로 로드 후 크기로도 판단한다.
  const applyVideoThumbnailFallback = (img: HTMLImageElement, videoId: string | null) => {
    const youtubeFallback = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
    if (youtubeFallback && img.dataset.fallback !== 'youtube') {
      img.dataset.fallback = 'youtube';
      img.src = youtubeFallback;
      return;
    }
    if (img.dataset.fallback === 'default') return;
    img.dataset.fallback = 'default';
    img.src = generateDefaultThumbnail(1280, 720);
  };

  // 모바일에서는 장르 탭이 가로 스크롤이라, 선택된 탭이 화면 밖이면 가운데로 옮긴다
  useEffect(() => {
    const nav = genreNavRef.current;
    const active = nav?.querySelector<HTMLElement>('button[aria-pressed="true"]');
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
    const navRect = nav.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const left = activeRect.left - navRect.left + nav.scrollLeft - (nav.clientWidth - activeRect.width) / 2;
    nav.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [selectedCategory, categories.length, searchTerm]);

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setSearchTerm('');
    setCurrentPage(1);
    updateQueryParams(
      {
        category: categoryId || null,
        search: null,
        page: null,
      }
    );
  };

  const handleAddToCart = async (sheetId: string) => {
    // 비회원은 로그인 없이 게스트 장바구니(localStorage)에 담는다.
    if (!user) {
      await addToCart(sheetId);
      return;
    }

    try {
      const alreadyPurchased = await hasPurchasedSheet(user.id, sheetId);
      if (alreadyPurchased) {
        const targetSheet = drumSheets.find((sheet) => sheet.id === sheetId);

        const title = targetSheet?.title || '';
        alert(t('categoriesPage.alreadyPurchased', { title }));
        return;
      }
    } catch (error) {
      console.error('장바구니 담기 전 구매 이력 확인 오류:', error);
      alert(t('categoriesPage.purchaseCheckError'));
      return;
    }

    await addToCart(sheetId);
  };

  const [buyingNowSheetId, setBuyingNowSheetId] = useState<string | null>(null);

  // ✅ 공유 useBuyNow 훅 사용
  const buyNow = useBuyNow(user);
  const eventSales = useEventSales();
  const handleBankTransferConfirm = buyNow.handleBankTransferConfirm;
  const { credits } = useUserCredits(user);

  const handleBuyNow = async (sheet: DrumSheet) => {
    await buyNow.handleBuyNow({
      id: sheet.id,
      title: sheet.title,
      price: Math.max(0, sheet.price ?? 0),
    });
  };



  const handleToggleFavorite = async (sheetId: string) => {
    if (!user) {
      alert(t('categoriesPage.loginRequired'));
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
      console.error('찜하기 처리 오류:', error);
      alert(t('categoriesPage.favoriteError'));
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

  // Helper function to remove spaces and convert to lowercase for fuzzy search
  // Helper function to remove spaces and convert to lowercase for fuzzy search
  const normalizeString = (str: string): string => {
    return str.replace(/\s+/g, '').toLowerCase();
  };

  const formatCurrency = (value: number) => {
    const convertedAmount = convertFromKrw(value, currency, i18n.language);
    return formatCurrencyUtil(convertedAmount, currency);
  };

  const getDisplayPrice = (sheet: DrumSheet) => {
    return sheet.price;
  };

  const isSearchMode = Boolean(searchTerm.trim());

  // Filtered sheets based on search, category, difficulty, price range, artist, album
  const filteredSheets = React.useMemo(() => {
    let filtered = [...drumSheets];

    // 검색 필터링은 loadDrumSheets()에서 이미 수행됨 (공백 무시, 괄호 제거, 다중 단어 AND 등)
    // 여기서 중복 필터링하면 loadDrumSheets의 유연한 매칭 결과가 무효화될 수 있으므로 스킵
    // (예: "헤이즈 Even if" 검색 시 artist "헤이즈 (Heize)"의 괄호 내용 때문에 매칭 실패)

    // Category filter는 제거 - loadDrumSheets에서 이미 category_id로 필터링됨
    // (slug를 UUID와 비교하는 문제 방지)

    // Artist filter
    if (selectedArtist) {
      filtered = filtered.filter(sheet => sheet.artist === selectedArtist);
    }

    // Album filter
    if (selectedAlbum) {
      filtered = filtered.filter(sheet => sheet.album_name === selectedAlbum);
    }

    // Difficulty filter
    if (selectedDifficulty && selectedDifficulty !== 'all') {
      filtered = filtered.filter(sheet => normalizeDifficulty(sheet.difficulty) === selectedDifficulty);
    }

    // Price range filter (입력값은 화면에 보이는 통화 기준이다)
    const shownPrice = (sheet: DrumSheet) => convertFromKrw(getDisplayPrice(sheet), currency, i18n.language);
    if (priceRange.min) {
      const minPrice = parseFloat(priceRange.min);
      if (!Number.isNaN(minPrice)) {
        filtered = filtered.filter(sheet => shownPrice(sheet) >= minPrice);
      }
    }
    if (priceRange.max) {
      const maxPrice = parseFloat(priceRange.max);
      if (!Number.isNaN(maxPrice)) {
        filtered = filtered.filter(sheet => shownPrice(sheet) <= maxPrice);
      }
    }

    // 즉시 다운로드 필터 (Pre-order 제외)
    if (showInstantOnly) {
      filtered = filtered.filter(sheet => sheet.sales_type !== 'PREORDER');
    }

    // Sort
    let sorted = [...filtered];
    switch (sortBy) {
      case 'newest':
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'oldest':
        sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'price-low':
        sorted.sort((a, b) => getDisplayPrice(a) - getDisplayPrice(b));
        break;
      case 'price-high':
        sorted.sort((a, b) => getDisplayPrice(b) - getDisplayPrice(a));
        break;
      default:
        break;
    }

    return sorted;
  }, [drumSheets, searchTerm, selectedCategory, selectedDifficulty, priceRange, sortBy, selectedArtist, selectedAlbum, showInstantOnly, currency, i18n.language]);

  const isYouTubeCategoryForLayout = (() => {
    if (!selectedCategory) return false;
    const cat = categories.find(c => c.id === selectedCategory || c.slug === selectedCategory);
    return cat?.name === '드럼솔로' || cat?.name === '드럼커버';
  })();
  const itemsPerPage = isYouTubeCategoryForLayout ? ITEMS_PER_PAGE_YOUTUBE : ITEMS_PER_PAGE;

  const rawTotalPages = Math.ceil(filteredSheets.length / itemsPerPage);
  const totalPages = isSearchMode ? rawTotalPages : Math.min(MAX_CATEGORY_PAGES, rawTotalPages);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedSheets = filteredSheets.slice(startIndex, endIndex);
  const showCategoryLimitNotice = !isSearchMode && totalPages >= MAX_CATEGORY_PAGES && currentPage === MAX_CATEGORY_PAGES;

  // 장르·검색 조건이 바뀐 직후에는 이전 목록이 남아 있으므로 새 목록이 올 때까지 로딩으로 취급
  const hasListCriteria = Boolean(selectedCategory || searchTerm.trim() || selectedArtist || selectedAlbum);
  const listLoading = loading || (hasListCriteria && loadedListKey !== null && loadedListKey !== listKey);

  useEffect(() => {
    if (listLoading || !totalPages || currentPage <= totalPages) return;
    const clampedPage = Math.max(1, totalPages);
    setCurrentPage(clampedPage);
    updateQueryParams(
      {
        page: clampedPage > 1 ? String(clampedPage) : null,
      },
      { replace: true }
    );
  }, [listLoading, totalPages, currentPage, updateQueryParams]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    updateQueryParams(
      {
        page: page > 1 ? String(page) : null,
      }
    );
  };

  // Build SEO strings
  const selectedCategoryObj = categories.find(cat => cat.id === selectedCategory || cat.slug === selectedCategory);
  const categoryName = selectedCategoryObj ? getCategoryName(selectedCategoryObj.name) : '';
  const isYouTubeCategory = selectedCategoryObj?.name === '드럼솔로' || selectedCategoryObj?.name === '드럼커버';
  const categorySeo = categoryName ? buildCategorySeoStrings(categoryName, t) : {
    title: `${t('categoriesPage.pageTitle')} | COPYDRUM`,
    description: t('categoriesPage.pageDescription'),
  };
  
  // Build canonical URL
  const baseUrl = languageDomainMap[i18n.language as keyof typeof languageDomainMap] || (typeof window !== 'undefined' ? window.location.origin : '');
  const canonicalUrl = baseUrl ? `${baseUrl}/categories${selectedCategory ? `?category=${selectedCategory}` : ''}` : '/categories';

  // 장르 화면은 최신 악보를 최대 10페이지 분량까지만 불러오므로, 꽉 찼으면 "이상"으로 표시한다
  const hasListFilters = Boolean(selectedDifficulty || priceRange.min || priceRange.max || showInstantOnly);
  const isResultCapped =
    !isSearchMode && !hasListFilters && drumSheets.length >= ITEMS_PER_PAGE_YOUTUBE * MAX_CATEGORY_PAGES;

  const genreCategories = genreList
    .map((name) => categories.find((cat) => cat.name === name))
    .filter((cat): cat is Category => Boolean(cat));

  const headingTitle = isSearchMode
    ? t('categoriesPage.searchResultsTitle', { query: searchTerm.trim() })
    : selectedArtist
      ? `${selectedArtist}${t('categoriesPage.artistSongs')}`
      : selectedAlbum
        ? `${selectedAlbum} ${t('categoriesPage.album')}`
        : categoryName || t('categoriesPage.pageTitle');

  const clearArtistAlbum = () => {
    setSelectedArtist('');
    setSelectedAlbum('');
    setCurrentPage(1);
    updateQueryParams({ artist: null, album: null, page: null });
  };

  const setDifficulty = (value: string) => {
    setSelectedDifficulty(value);
    setCurrentPage(1);
    updateQueryParams({ difficulty: value || null, page: null });
  };

  const setPrice = (key: 'min' | 'max', value: string) => {
    setPriceRange((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
    updateQueryParams({ [key === 'min' ? 'priceMin' : 'priceMax']: value || null, page: null });
  };

  const resetFilters = () => {
    setSelectedDifficulty('');
    setPriceRange({ min: '', max: '' });
    setShowInstantOnly(false);
    setCurrentPage(1);
    updateQueryParams({ difficulty: null, priceMin: null, priceMax: null, page: null });
  };

  const changeSort = (value: string) => {
    setSortBy(value);
    setCurrentPage(1);
    updateQueryParams({ sort: value === 'newest' ? null : value, page: null });
  };

  const activeFilters: { key: string; label: string; onRemove: () => void }[] = [
    ...(selectedDifficulty
      ? [{ key: 'difficulty', label: getDifficultyName(selectedDifficulty), onRemove: () => setDifficulty('') }]
      : []),
    ...(priceRange.min
      ? [{ key: 'min', label: t('categoriesPage.priceFrom', { value: priceRange.min }), onRemove: () => setPrice('min', '') }]
      : []),
    ...(priceRange.max
      ? [{ key: 'max', label: t('categoriesPage.priceTo', { value: priceRange.max }), onRemove: () => setPrice('max', '') }]
      : []),
    ...(showInstantOnly
      ? [{ key: 'instant', label: t('categoriesPage.instantOnly'), onRemove: () => setShowInstantOnly(false) }]
      : []),
  ];

  const goToSheet = (sheet: DrumSheet) => router.push(`/drum-sheet/${sheet.slug}`);

  const renderCartButton = (sheet: DrumSheet, variant: 'icon' | 'compact') => {
    const inCart = isInCart(sheet.id);
    const label = inCart ? t('categoriesPage.inCart') : t('categoriesPage.addToCart');
    if (variant === 'icon') {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void handleAddToCart(sheet.id);
          }}
          disabled={inCart}
          aria-label={label}
          title={label}
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
            inCart ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-700 active:bg-gray-100 hover:border-blue-200 hover:text-blue-700'
          }`}
        >
          <i className={`${inCart ? 'ri-check-line' : 'ri-shopping-cart-2-line'} text-lg`} />
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void handleAddToCart(sheet.id);
        }}
        disabled={inCart}
        className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
          inCart ? 'bg-blue-50 text-blue-600' : 'bg-ink text-white hover:bg-ink-light'
        }`}
      >
        <i className={inCart ? 'ri-check-line' : 'ri-shopping-cart-2-line'} />
        {label}
      </button>
    );
  };

  const renderFavoriteButton = (sheet: DrumSheet, className = '') => {
    const isFavorite = favoriteIds.has(sheet.id);
    const isFavoriteLoading = favoriteLoadingIds.has(sheet.id);
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void handleToggleFavorite(sheet.id);
        }}
        disabled={isFavoriteLoading}
        aria-label={isFavorite ? t('categoriesPage.favoriteRemove') : t('categoriesPage.favoriteAdd')}
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
          isFavorite ? 'bg-rose-50 text-rose-500' : 'text-gray-400 hover:bg-gray-100 hover:text-rose-500'
        } ${isFavoriteLoading ? 'cursor-not-allowed opacity-60' : ''} ${className}`}
      >
        <i className={`ri-heart-${isFavorite ? 'fill' : 'line'} text-lg`} />
      </button>
    );
  };

  const renderFilterControls = () => (
    <div className="space-y-5 md:flex md:flex-wrap md:items-end md:gap-6 md:space-y-0">
      <div>
        <p className="mb-2 text-sm font-semibold text-gray-800">{t('categoriesPage.difficultyLabelFilter')}</p>
        <div className="flex flex-wrap gap-2">
          {[
            { value: '', label: t('categoriesPage.allDifficulties') },
            { value: 'beginner', label: t('categoriesPage.beginner') },
            { value: 'intermediate', label: t('categoriesPage.intermediate') },
            { value: 'advanced', label: t('categoriesPage.advanced') },
          ].map((option) => (
            <button
              key={option.value || 'all'}
              type="button"
              onClick={() => setDifficulty(option.value)}
              aria-pressed={selectedDifficulty === option.value}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                selectedDifficulty === option.value ? 'bg-ink text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-800">
          {t('categoriesPage.priceRange')} <span className="font-normal text-gray-400">({currency})</span>
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder={t('categoriesPage.min')}
            value={priceRange.min}
            onChange={(e) => setPrice('min', e.target.value)}
            className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 md:w-28"
          />
          <span className="text-gray-400">~</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder={t('categoriesPage.max')}
            value={priceRange.max}
            onChange={(e) => setPrice('max', e.target.value)}
            className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 md:w-28"
          />
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 md:pb-2">
        <input
          type="checkbox"
          checked={showInstantOnly}
          onChange={(e) => {
            setShowInstantOnly(e.target.checked);
            setCurrentPage(1);
          }}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span>
          <span className="block text-sm font-semibold text-gray-800">{t('categoriesPage.instantOnly')}</span>
          <span className="block text-xs text-gray-500">{t('categoriesPage.instantOnlyHint')}</span>
        </span>
      </label>

      {activeFilters.length > 0 && (
        <button type="button" onClick={resetFilters} className="text-sm font-medium text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline md:pb-2">
          {t('categoriesPage.resetFilters')}
        </button>
      )}
    </div>
  );

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 2,
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* SEO Meta Tags */}
      <Seo
        title={categorySeo.title}
        description={categorySeo.description}
        canonicalUrl={canonicalUrl}
        locale={i18n.language}
      />

      <div className="hidden md:block">
        <MainHeader user={user} />
      </div>

      <main className="mx-auto max-w-7xl px-4 pb-14 pt-4 sm:px-6 md:pt-8 lg:px-8">
        {buyNow.bankTransferInfo ? (
          <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-blue-900">{t('categoriesPage.bankTransferInfo')}</h3>
              <button type="button" onClick={() => buyNow.closeBankTransferModal()} className="text-xs text-blue-600 hover:text-blue-800">
                {t('categoriesPage.close')}
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div>
                <span className="font-medium text-gray-900">{t('categoriesPage.bank')}</span> {buyNow.bankTransferInfo.bankName}
              </div>
              <div>
                <span className="font-medium text-gray-900">{t('categoriesPage.accountNumber')}</span> {buyNow.bankTransferInfo.accountNumber}
              </div>
              <div>
                <span className="font-medium text-gray-900">{t('categoriesPage.accountHolder')}</span> {buyNow.bankTransferInfo.depositor}
              </div>
              <div>
                <span className="font-medium text-gray-900">{t('categoriesPage.depositAmount')}</span>{' '}
                {formatCurrency(buyNow.bankTransferInfo.amount ?? 0)}
              </div>
              {buyNow.bankTransferInfo.expectedDepositor ? (
                <div className="sm:col-span-2">
                  <span className="font-medium text-gray-900">{t('categoriesPage.depositorName')}</span>{' '}
                  <span className="font-semibold text-blue-600">{buyNow.bankTransferInfo.expectedDepositor}</span>
                </div>
              ) : null}
            </div>
            {buyNow.bankTransferInfo.message ? <p className="mt-3 text-xs text-gray-600">{buyNow.bankTransferInfo.message}</p> : null}
          </div>
        ) : null}

        {/* 장르 */}
        <nav
          ref={genreNavRef}
          aria-label={t('categoriesPage.categoryLabel')}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {genreCategories.map((category) => {
            const isActive = !isSearchMode && (selectedCategory === category.id || selectedCategory === category.slug);
            const categoryParam = category.slug || category.id;
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => {
                  setSelectedArtist('');
                  setSelectedAlbum('');
                  setSelectedCategory(categoryParam);
                  setSearchTerm('');
                  setCurrentPage(1);
                  updateQueryParams({ category: categoryParam, search: null, artist: null, album: null, page: null });
                }}
                className={`flex-shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition-colors md:text-sm ${
                  isActive ? 'bg-ink text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {getCategoryName(category.name)}
              </button>
            );
          })}
        </nav>

        {/* 제목 · 결과 수 · 필터 · 정렬 */}
        <div className="mt-5 flex items-end justify-between gap-3 md:mt-6">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold text-gray-900 md:text-3xl">{headingTitle}</h1>
            <p className="mt-0.5 text-sm text-gray-500" suppressHydrationWarning>
              {listLoading
                ? '\u00a0'
                : t(isResultCapped ? 'categoriesPage.resultsCountMore' : 'categoriesPage.resultsCount', { count: filteredSheets.length })}
              {(selectedArtist || selectedAlbum) && (
                <button type="button" onClick={clearArtistAlbum} className="ml-3 font-medium text-blue-700 hover:underline">
                  {t('categoriesPage.backToAllSheets')}
                </button>
              )}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters((open) => !open)}
              aria-expanded={showFilters}
              className={`relative inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors ${
                showFilters || activeFilters.length > 0 ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <i className="ri-equalizer-line text-base" />
              {t('categoriesPage.filter')}
              {activeFilters.length > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-600 px-1 text-[11px] font-bold text-white">
                  {activeFilters.length}
                </span>
              )}
            </button>
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => changeSort(e.target.value)}
                aria-label={t('categoriesPage.sort')}
                className="h-10 appearance-none rounded-full border border-gray-200 bg-white pl-3.5 pr-8 text-sm font-semibold text-gray-700 outline-none hover:bg-gray-50 focus:ring-2 focus:ring-blue-100"
              >
                <option value="newest">{t('categoriesPage.sortNewest')}</option>
                <option value="price-low">{t('categoriesPage.sortPriceLow')}</option>
                <option value="price-high">{t('categoriesPage.sortPriceHigh')}</option>
              </select>
              <i className="ri-arrow-down-s-line pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            </div>
          </div>
        </div>

        {/* 적용된 필터 */}
        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {activeFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={filter.onRemove}
                aria-label={`${filter.label} ${t('categoriesPage.removeFilter')}`}
                className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-1 pl-3 pr-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
              >
                {filter.label}
                <i className="ri-close-line text-sm" />
              </button>
            ))}
            <button type="button" onClick={resetFilters} className="text-xs font-medium text-gray-500 hover:text-gray-800 hover:underline">
              {t('categoriesPage.resetFilters')}
            </button>
          </div>
        )}

        {/* PC 필터 바 */}
        {showFilters && (
          <div className="mt-3 hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:block">{renderFilterControls()}</div>
        )}

        {/* 목록 */}
        <div className="mt-4 md:mt-5">
          {listLoading ? (
            <div className="py-20 text-center text-gray-500">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600" />
              <p className="text-sm font-medium" suppressHydrationWarning>{t('categoriesPage.loadingSheetsMessage')}</p>
            </div>
          ) : paginatedSheets.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
              <i className="ri-file-music-line text-4xl text-gray-300" />
              <p className="mt-3 font-semibold text-gray-700">{isSearchMode ? t('categoriesPage.noSearchResults') : t('categoriesPage.noSheets')}</p>
              <p className="mt-1 text-sm text-gray-500">{t('categoriesPage.tryDifferentSearch')}</p>
              <p className="mt-5 text-sm text-gray-500">{t('categoriesPage.customOrderCta')}</p>
              <button
                type="button"
                onClick={() =>
                  router.push(searchTerm.trim() ? `/custom-order?title=${encodeURIComponent(searchTerm.trim())}` : '/custom-order')
                }
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <i className="ri-edit-line" />
                {t('categoriesPage.customOrderCtaButton')}
              </button>
            </div>
          ) : isYouTubeCategory ? (
            /* 드럼솔로·드럼커버: 영상 썸네일 카드 */
            <div className="grid grid-cols-2 gap-3 md:gap-5 lg:grid-cols-3">
              {paginatedSheets.map((sheet) => {
                const videoId = extractYouTubeVideoId(sheet.youtube_url);
                return (
                  <div key={sheet.id} className="group flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md">
                    <button type="button" onClick={() => goToSheet(sheet)} className="relative block text-left" aria-label={sheet.title}>
                      <img
                        src={getYouTubeThumbnailUrl(sheet)}
                        alt=""
                        loading="lazy"
                        className="aspect-video w-full bg-gray-200 object-cover transition duration-300 group-hover:brightness-95"
                        onError={(event) => applyVideoThumbnailFallback(event.currentTarget, videoId)}
                        onLoad={(event) => {
                          if (event.currentTarget.naturalWidth <= 120) applyVideoThumbnailFallback(event.currentTarget, videoId);
                        }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-rose-600 shadow md:h-12 md:w-12">
                          <i className={`${videoId ? 'ri-play-fill' : 'ri-music-2-line'} text-xl md:text-2xl`} />
                        </span>
                      </span>
                    </button>
                    <div className="flex flex-1 flex-col p-3 md:p-4">
                      <button type="button" onClick={() => goToSheet(sheet)} className="text-left">
                        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-gray-900 group-hover:text-blue-700 md:text-base">{sheet.title}</h3>
                        <p className="mt-0.5 truncate text-xs text-gray-500 md:text-sm">{sheet.artist}</p>
                      </button>
                      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                        <SalePrice
                          price={getDisplayPrice(sheet)}
                          event={eventSales.getActiveEvent(sheet.id)}
                          size="sm"
                          stacked
                          regularClassName="text-sm font-bold text-gray-900"
                        />
                        <div className="flex items-center gap-1">
                          <span className="hidden md:block">{renderFavoriteButton(sheet)}</span>
                          {renderCartButton(sheet, 'icon')}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              {/* 모바일: 한 줄 목록 + 바로 담기 */}
              <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white px-3 shadow-sm md:hidden">
                {paginatedSheets.map((sheet) => (
                  <li key={sheet.id} className="flex items-center gap-3 py-2.5">
                    <button type="button" onClick={() => goToSheet(sheet)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <img
                        src={getThumbnailUrl(sheet)}
                        alt=""
                        loading="lazy"
                        className="h-14 w-14 flex-shrink-0 rounded-lg border border-gray-100 object-cover"
                        onError={(event) => {
                          (event.target as HTMLImageElement).src = generateDefaultThumbnail(200, 200);
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold text-gray-900">{sheet.title}</span>
                        <span className="block truncate text-xs text-gray-500">{sheet.artist}</span>
                        <span className="mt-0.5 flex items-center gap-2">
                          <SalePrice
                            price={getDisplayPrice(sheet)}
                            event={eventSales.getActiveEvent(sheet.id)}
                            size="sm"
                            regularClassName="text-sm font-bold text-gray-900"
                          />
                          <StarRating rating={reviewStats[sheet.id]?.avgRating ?? 0} count={reviewStats[sheet.id]?.reviewCount ?? 0} />
                        </span>
                      </span>
                    </button>
                    {renderCartButton(sheet, 'icon')}
                  </li>
                ))}
              </ul>

              {/* PC: 표 */}
              <div className="hidden overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm md:block">
                <table className="w-full table-fixed">
                  <thead className="border-b border-gray-100 bg-gray-50/80">
                    <tr className="text-left text-xs font-semibold text-gray-500">
                      <th className="w-[46%] px-5 py-3">{t('categoriesPage.colSheet')}</th>
                      <th className="w-[22%] px-4 py-3">{t('categoriesPage.tableAlbum')}</th>
                      <th className="w-[12%] px-4 py-3">{t('categoriesPage.colPrice')}</th>
                      <th className="w-[20%] px-5 py-3 text-right">{t('categoriesPage.colActions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedSheets.map((sheet) => (
                      <tr key={sheet.id} className="group transition-colors hover:bg-gray-50/70">
                        <td className="px-5 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <button type="button" onClick={() => goToSheet(sheet)} className="flex-shrink-0" aria-label={sheet.title}>
                              <img
                                src={getThumbnailUrl(sheet)}
                                alt=""
                                loading="lazy"
                                className="h-12 w-12 rounded-lg border border-gray-100 object-cover"
                                onError={(event) => {
                                  (event.target as HTMLImageElement).src = generateDefaultThumbnail(200, 200);
                                }}
                              />
                            </button>
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => goToSheet(sheet)}
                                title={sheet.title}
                                className="block max-w-full truncate text-left text-[15px] font-semibold text-gray-900 hover:text-blue-700"
                              >
                                {sheet.title}
                              </button>
                              <div className="flex min-w-0 items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedArtist(sheet.artist);
                                    setCurrentPage(1);
                                    updateQueryParams({ artist: sheet.artist, page: null });
                                  }}
                                  className="truncate text-left text-sm text-gray-500 hover:text-blue-700"
                                >
                                  {sheet.artist}
                                </button>
                                <StarRating rating={reviewStats[sheet.id]?.avgRating ?? 0} count={reviewStats[sheet.id]?.reviewCount ?? 0} />
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {sheet.album_name ? (
                            <button
                              type="button"
                              title={sheet.album_name}
                              onClick={() => {
                                setSelectedAlbum(sheet.album_name || '');
                                setCurrentPage(1);
                                updateQueryParams({ album: sheet.album_name, page: null });
                              }}
                              className="block max-w-full truncate text-left text-sm text-gray-600 hover:text-blue-700"
                            >
                              {sheet.album_name}
                            </button>
                          ) : (
                            <span className="text-sm text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <SalePrice
                            price={getDisplayPrice(sheet)}
                            event={eventSales.getActiveEvent(sheet.id)}
                            size="sm"
                            stacked
                            regularClassName="text-sm font-bold text-gray-900"
                          />
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {renderFavoriteButton(sheet)}
                            {renderCartButton(sheet, 'compact')}
                            {/* 평소엔 연한 테두리로 두고, 줄에 마우스를 올리면 진하게 바꿔 표를 가볍게 한다 */}
                            <button
                              type="button"
                              onClick={() => void handleBuyNow(sheet)}
                              disabled={buyingNowSheetId === sheet.id}
                              className="inline-flex items-center rounded-lg border border-blue-200 bg-white px-3 py-[7px] text-xs font-semibold text-blue-600 transition hover:!bg-blue-700 group-hover:border-blue-600 group-hover:bg-blue-600 group-hover:text-white focus-visible:border-blue-600 focus-visible:bg-blue-600 focus-visible:text-white disabled:opacity-60"
                            >
                              {buyingNowSheetId === sheet.id ? t('sheet.buyNowProcessing') || '처리 중...' : t('sheet.buyNow')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* 페이지 나누기 */}
        {!listLoading && totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-1.5">
            <button
              type="button"
              onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              aria-label="Previous page"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              <i className="ri-arrow-left-s-line text-lg" />
            </button>
            <span className="px-3 text-sm text-gray-600 md:hidden">
              {currentPage} / {totalPages}
            </span>
            <div className="hidden items-center gap-1.5 md:flex">
              {pageNumbers.map((page, index) => (
                <React.Fragment key={page}>
                  {index > 0 && page - pageNumbers[index - 1] > 1 && <span className="px-1 text-gray-400">…</span>}
                  <button
                    type="button"
                    onClick={() => handlePageChange(page)}
                    aria-current={currentPage === page ? 'page' : undefined}
                    className={`h-10 min-w-[40px] rounded-full px-3 text-sm font-semibold transition-colors ${
                      currentPage === page ? 'bg-ink text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {page}
                  </button>
                </React.Fragment>
              ))}
            </div>
            <button
              type="button"
              onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              aria-label="Next page"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              <i className="ri-arrow-right-s-line text-lg" />
            </button>
          </div>
        )}
        {showCategoryLimitNotice && (
          <p className="mt-3 break-keep text-center text-xs leading-relaxed text-gray-500 md:text-sm">
            {t('categoriesPage.paginationLimitTitle')}
            <br />
            {t('categoriesPage.paginationLimitDescription')}
          </p>
        )}
      </main>

      <Footer />

      {/* 모바일 필터 창 */}
      {showFilters && (
        // 떠 있는 채팅 버튼(z-[9999])보다 위에 띄워 [결과 보기]를 가리지 않게 한다
        <div className="fixed inset-0 z-[10000] flex items-end bg-black/50 md:hidden" onClick={() => setShowFilters(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('categoriesPage.filter')}
            className="w-full rounded-t-3xl bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" />
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{t('categoriesPage.filter')}</h2>
              <button type="button" onClick={() => setShowFilters(false)} aria-label={t('categoriesPage.close')} className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
                <i className="ri-close-line text-xl" />
              </button>
            </div>
            {renderFilterControls()}
            <button
              type="button"
              onClick={() => setShowFilters(false)}
              className="mt-6 w-full rounded-xl bg-blue-600 py-3.5 text-base font-bold text-white hover:bg-blue-700"
            >
              {t('categoriesPage.applyFilters')} · {t('categoriesPage.resultsCount', { count: filteredSheets.length })}
            </button>
          </div>
        </div>
      )}

      {/* ✅ 공유 useBuyNow 훅의 모달들 */}
      <PaymentMethodSelector
        open={buyNow.showPaymentSelector}
        amount={buyNow.pendingSheet ? buyNow.pendingSheet.price : 0}
        onSelect={buyNow.handlePaymentMethodSelect}
        onClose={buyNow.closePaymentSelector}
        context="buyNow"
        userCredits={credits}
      />

      <BankTransferInfoModal
        open={buyNow.showBankTransferModal}
        amount={buyNow.pendingSheet ? buyNow.pendingSheet.price : 0}
        userName={(user?.user_metadata?.name as string | undefined) ?? user?.email ?? undefined}
        onConfirm={buyNow.handleBankTransferConfirm}
        onClose={buyNow.closeBankTransferModal}
        processing={buyNow.paymentProcessing}
        orderCreated={!!buyNow.bankTransferInfo}
        successMessage={t('categoriesPage.bankTransferCreated') || '무통장입금 계좌가 생성되었습니다. 입금을 완료해주세요.'}
      />

      {buyNow.showPayPalModal && buyNow.pendingSheet && (
        <PayPalPaymentModal
          open={buyNow.showPayPalModal}
          amount={buyNow.pendingSheet.price}
          orderTitle={buyNow.pendingSheet.title}
          onClose={buyNow.closePayPalModal}
          onSuccess={(response) => {
            buyNow.closePayPalModal();
            // PayPal은 리다이렉트되므로 여기서 추가 처리 불필요할 수 있음
          }}
          onError={(error) => {
            console.error('PayPal 결제 오류:', error);
            alert(t('categoriesPage.purchaseError'));
          }}
          initiatePayment={buyNow.handlePayPalInitiate}
        />
      )}


      <VirtualAccountInfoModal
        open={buyNow.showVirtualAccountModal}
        amount={buyNow.pendingSheet ? buyNow.pendingSheet.price : 0}
        virtualAccountInfo={buyNow.virtualAccountInfo}
        onClose={buyNow.closeVirtualAccountModal}
      />

      {
        insufficientCashInfo && (
          <InsufficientCashModal
            open={showInsufficientCashModal}
            currentBalance={insufficientCashInfo.currentBalance}
            requiredAmount={insufficientCashInfo.requiredAmount}
            onClose={() => {
              setShowInsufficientCashModal(false);
              setInsufficientCashInfo(null);
            }}
          />
        )
      }
    </div >
  );
};

export default CategoriesPage;
