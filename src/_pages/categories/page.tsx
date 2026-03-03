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
import { processCashPurchase } from '../../lib/cashPurchases';
import { hasPurchasedSheet } from '../../lib/purchaseCheck';
import { BankTransferInfoModal, PaymentMethodSelector, InsufficientCashModal, PayPalPaymentModal } from '../../components/payments';
import { VirtualAccountInfoModal } from '../../components/payments/VirtualAccountInfoModal';
import type { PaymentMethod } from '../../components/payments';
import { startSheetPurchase, buySheetNow } from '../../lib/payments';
import type { VirtualAccountInfo } from '../../lib/payments';
import { useTranslation } from 'react-i18next';

import { getSiteCurrency, convertFromKrw, formatCurrency as formatCurrencyUtil } from '../../lib/currency';
import { useSiteLanguage } from '../../hooks/useSiteLanguage';
import { useBuyNow } from '../../hooks/useBuyNow';
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

const CategoriesPage: React.FC = () => {
  // ... existing code ...

  const searchParams = useSearchParams();
  const router = useLocaleRouter();
  const [user, setUser] = useState<User | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [drumSheets, setDrumSheets] = useState<DrumSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>(() => searchParams.get('category') || '');
  const [selectedSheet, setSelectedSheet] = useState<DrumSheet | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>(() => searchParams.get('search') || '');
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [showSortFilter, setShowSortFilter] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<string>(() => searchParams.get('sort') || 'newest');
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
  const MAX_CATEGORY_PAGES = 10;
  const CATEGORY_FETCH_LIMIT = ITEMS_PER_PAGE * MAX_CATEGORY_PAGES * 2;
  const itemsPerPage = ITEMS_PER_PAGE;
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoriteLoadingIds, setFavoriteLoadingIds] = useState<Set<string>>(new Set());
  const [buyingSheetId, setBuyingSheetId] = useState<string | null>(null);
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);
  const [showInsufficientCashModal, setShowInsufficientCashModal] = useState(false);
  const [insufficientCashInfo, setInsufficientCashInfo] = useState<{ currentBalance: number; requiredAmount: number } | null>(null);
  const [showPayPalModal, setShowPayPalModal] = useState(false);
  const { i18n, t } = useTranslation();
  const { isKoreanSite } = useSiteLanguage();
  const fetchIdRef = useRef(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    if (!difficulty) return t('categoriesPage.difficultyNotSet');
    if (difficulty === 'beginner') return t('categoriesPage.beginner');
    if (difficulty === 'intermediate') return t('categoriesPage.intermediate');
    if (difficulty === 'advanced') return t('categoriesPage.advanced');
    return difficulty;
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
      console.log('✅ UUID detected:', slugOrId);
      return slugOrId;
    }

    // slug로 카테고리 찾기
    console.log('🔍 Looking for slug:', slugOrId, 'in', categories.length, 'categories');
    const category = categories.find(cat => cat.slug === slugOrId);

    if (category) {
      console.log('✅ Found category:', category.name, '→ ID:', category.id);
      return category.id;
    } else {
      console.warn('⚠️ Category not found for slug:', slugOrId);
      console.log('Available slugs:', categories.map(c => c.slug));
      return null;
    }
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
    const sortParam = searchParams.get('sort') || 'newest';
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
    if (!trimmedSearch && !selectedCategory && !selectedArtist && !selectedAlbum) {
      setDrumSheets([]);
      setLoading(false);
      return;
    }

    const fetchId = ++fetchIdRef.current;
    setLoading(true);

    const baseSelect =
      'id, title, artist, difficulty, price, category_id, tempo, pdf_url, preview_image_url, youtube_url, is_featured, created_at, thumbnail_url, album_name, page_count, slug, sales_type, categories (name), drum_sheet_categories (category_id)';

    try {
      if (trimmedSearch) {
        // ━━━ 공백 무시 유연 검색 (Space-agnostic flexible search) ━━━
        // 1단계: 검색어 분석
        const escapePattern = (s: string) => s.replace(/[%_]/g, (m) => `\\${m}`);
        const searchNoSpaces = trimmedSearch.replace(/\s+/g, '');
        const searchWords = trimmedSearch.split(/\s+/).filter((w) => w.length > 0);

        // 2단계: 넓은 범위 DB 검색을 위한 키워드 추출
        // - 각 단어 전체 + 첫 2글자(한글 2음절)로 넓게 후보를 가져옴
        const broadKeywords = new Set<string>();
        searchWords.forEach((word) => {
          broadKeywords.add(word);
          if (word.length >= 2) {
            broadKeywords.add(word.substring(0, 2));
          }
        });
        // 공백 제거 검색어의 첫 2글자도 추가 (예: "그대발길이" → "그대")
        if (searchNoSpaces.length >= 2) {
          broadKeywords.add(searchNoSpaces.substring(0, 2));
        }

        // 3단계: 넓은 OR 패턴으로 DB 검색 (후보군 확보)
        const orParts: string[] = [];
        broadKeywords.forEach((keyword) => {
          const pattern = `%${escapePattern(keyword)}%`;
          orParts.push(`title.ilike.${pattern}`);
          orParts.push(`artist.ilike.${pattern}`);
          orParts.push(`album_name.ilike.${pattern}`);
        });

        const { data, error } = await supabase
          .from('drum_sheets')
          .select(baseSelect)
          .eq('is_active', true)
          .or(orParts.join(','))
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        if (fetchId !== fetchIdRef.current) return;

        // 4단계: 클라이언트 측 공백 무시 정밀 필터링 + 관련도 점수 계산
        const searchLower = searchNoSpaces.toLowerCase();
        const exactPattern = trimmedSearch.toLowerCase();

        // 괄호와 그 내용을 제거하는 헬퍼 (예: "헤이즈 (Heize)" → "헤이즈")
        // 아티스트명에 한글명(영문명) 또는 영문명(한글명) 형태가 흔함
        const stripParens = (s: string) => s.replace(/\([^)]*\)/g, '').replace(/\s+/g, '');

        const scored = (data || [])
          .map((sheet) => {
            const title = sheet.title || '';
            const artist = sheet.artist || '';
            const album = sheet.album_name || '';
            const titleLower = title.toLowerCase();
            const artistLower = artist.toLowerCase();
            const albumLower = album.toLowerCase();

            // 공백만 제거한 버전
            const titleNoSpaces = titleLower.replace(/\s+/g, '');
            const artistNoSpaces = artistLower.replace(/\s+/g, '');
            const albumNoSpaces = albumLower.replace(/\s+/g, '');

            // 괄호 내용 + 공백 모두 제거한 버전 (핵심 개선)
            // "헤이즈 (Heize)" → "헤이즈", "BTS (방탄소년단)" → "bts"
            const titleClean = stripParens(titleLower);
            const artistClean = stripParens(artistLower);
            const albumClean = stripParens(albumLower);

            // 결합 매칭용 (아티스트+제목, 제목+아티스트)
            const combinedNoSpaces = artistNoSpaces + titleNoSpaces;
            const combinedClean = artistClean + titleClean;
            const reverseCombinedClean = titleClean + artistClean;

            let score = 0;

            // (가) 정확 매칭 (공백 포함 원본 그대로 일치) → 최고 점수
            if (titleLower.includes(exactPattern)) score = 100;
            else if (artistLower.includes(exactPattern)) score = 95;
            else if (albumLower.includes(exactPattern)) score = 90;
            // (나) 공백 제거 후 전체 검색어 매칭
            else if (titleNoSpaces.includes(searchLower)) score = 80;
            else if (artistNoSpaces.includes(searchLower)) score = 75;
            else if (albumNoSpaces.includes(searchLower)) score = 70;
            // (나-2) 괄호 제거 후 매칭 (예: "헤이즈" in "헤이즈(Heize)" → 괄호 제거 시 "헤이즈")
            else if (titleClean.includes(searchLower)) score = 78;
            else if (artistClean.includes(searchLower)) score = 73;
            else if (albumClean.includes(searchLower)) score = 68;
            // (다) 아티스트+제목 결합 매칭 (괄호 제거 버전 포함)
            // "헤이즈evenif" in "헤이즈(heize)evenif" → 실패
            // "헤이즈evenif" in "헤이즈evenif" (괄호 제거) → 성공!
            else if (combinedNoSpaces.includes(searchLower)) score = 65;
            else if (combinedClean.includes(searchLower)) score = 63;
            else if (reverseCombinedClean.includes(searchLower)) score = 60;
            // (라) 다중 단어 AND 매칭 (모든 단어가 각각 포함)
            // "헤이즈 Even if" → ["헤이즈", "Even", "if"] 각각 매칭
            else if (searchWords.length > 1) {
              const allWordsMatch = searchWords.every((word) => {
                const wordLower = word.toLowerCase().replace(/\s+/g, '');
                return (
                  titleNoSpaces.includes(wordLower) ||
                  artistNoSpaces.includes(wordLower) ||
                  albumNoSpaces.includes(wordLower) ||
                  artistClean.includes(wordLower) ||
                  titleClean.includes(wordLower)
                );
              });
              if (allWordsMatch) score = 50;
            }

            return { sheet, score };
          })
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score || new Date(b.sheet.created_at).getTime() - new Date(a.sheet.created_at).getTime())
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
        console.log('📂 Loading sheets for category:', selectedCategory);
        const categoryId = getCategoryId(selectedCategory);

        if (!categoryId) {
          // 유효하지 않은 카테고리면 빈 결과 반환
          console.error('❌ Category ID not found for:', selectedCategory);
          if (fetchId !== fetchIdRef.current) return;
          setDrumSheets([]);
          setLoading(false);
          return;
        }

        console.log('✅ Querying sheets with category_id:', categoryId);
        const { data, error } = await supabase
          .from('drum_sheets')
          .select(baseSelect)
          .eq('is_active', true)
          .eq('category_id', categoryId)
          .order('created_at', { ascending: false })
          .limit(CATEGORY_FETCH_LIMIT);

        if (error) {
          console.error('❌ Query error:', error);
          throw error;
        }

        console.log('📊 Fetched sheets:', data?.length || 0);
        if (fetchId !== fetchIdRef.current) return;
        const normalized = normalizeSheets(data || []);
        setDrumSheets(normalized.slice(0, itemsPerPage * MAX_CATEGORY_PAGES));
      }
    } catch (err) {
      console.error('Drum sheets loading error:', err);
    } finally {
      if (fetchId === fetchIdRef.current) {
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
    if (!user) {
      const redirectPath = window.location.pathname + window.location.search;
      router.push(`/auth/login?redirect=${encodeURIComponent(redirectPath)}`);
      return;
    }

    try {
      const alreadyPurchased = await hasPurchasedSheet(user.id, sheetId);
      if (alreadyPurchased) {
        const targetSheet =
          drumSheets.find((sheet) => sheet.id === sheetId) ||
          selectedSheet;

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
      filtered = filtered.filter(sheet => sheet.difficulty === selectedDifficulty);
    }

    // Price range filter
    if (priceRange.min) {
      const minPrice = parseInt(priceRange.min, 10);
      if (!Number.isNaN(minPrice)) {
        filtered = filtered.filter(sheet => getDisplayPrice(sheet) >= minPrice);
      }
    }
    if (priceRange.max) {
      const maxPrice = parseInt(priceRange.max, 10);
      if (!Number.isNaN(maxPrice)) {
        filtered = filtered.filter(sheet => getDisplayPrice(sheet) <= maxPrice);
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
      case 'popular':
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); // 최신순 정렬
        break;
      default:
        break;
    }

    return sorted;
  }, [drumSheets, searchTerm, selectedCategory, selectedDifficulty, priceRange, sortBy, selectedArtist, selectedAlbum, showInstantOnly]);

  const rawTotalPages = Math.ceil(filteredSheets.length / itemsPerPage);
  const totalPages = isSearchMode ? rawTotalPages : Math.min(MAX_CATEGORY_PAGES, rawTotalPages);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedSheets = filteredSheets.slice(startIndex, endIndex);
  const showCategoryLimitNotice = !isSearchMode && totalPages >= MAX_CATEGORY_PAGES && currentPage === MAX_CATEGORY_PAGES;

  useEffect(() => {
    if (!totalPages || currentPage <= totalPages) return;
    const clampedPage = Math.max(1, totalPages);
    setCurrentPage(clampedPage);
    updateQueryParams(
      {
        page: clampedPage > 1 ? String(clampedPage) : null,
      },
      { replace: true }
    );
  }, [totalPages, currentPage, updateQueryParams]);

  const selectedDisplayPrice = selectedSheet ? getDisplayPrice(selectedSheet) : 0;
  const selectedSheetIsFavorite = selectedSheet ? favoriteIds.has(selectedSheet.id) : false;
  const selectedSheetFavoriteLoading = selectedSheet ? favoriteLoadingIds.has(selectedSheet.id) : false;

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    updateQueryParams(
      {
        page: page > 1 ? String(page) : null,
      }
    );
  };

  const handleMobileSheetSelect = (sheet: DrumSheet) => {
    // 모바일: 상세페이지로 이동
    router.push(`/drum-sheet/${sheet.slug}`);
  };

  const closeMobileDetail = () => {
    setIsMobileDetailOpen(false);
    setSelectedSheet(null);
  };

  const handlePreviewOpen = (sheet: DrumSheet) => {
    const previewUrl = sheet.preview_image_url || sheet.pdf_url;
    if (!previewUrl) {
      alert(t('categoriesPage.noPreview'));
      return;
    }
    window.open(previewUrl, '_blank', 'noopener,noreferrer');
  };

  const handleYoutubeOpen = (sheet: DrumSheet) => {
    if (!sheet.youtube_url) {
      alert(t('categoriesPage.noYoutubeVideo'));
      return;
    }
    const href = sheet.youtube_url.startsWith('http')
      ? sheet.youtube_url
      : `https://www.youtube.com/watch?v=${sheet.youtube_url}`;
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  // Build SEO strings
  const selectedCategoryObj = categories.find(cat => cat.id === selectedCategory);
  const categoryName = selectedCategoryObj ? getCategoryName(selectedCategoryObj.name) : '';
  const categorySeo = categoryName ? buildCategorySeoStrings(categoryName, t) : {
    title: t('categoriesPage.title') || 'Categories | COPYDRUM',
    description: t('categoriesPage.description') || 'Browse all drum sheet music categories',
  };
  
  // Build canonical URL
  const baseUrl = languageDomainMap[i18n.language as keyof typeof languageDomainMap] || (typeof window !== 'undefined' ? window.location.origin : '');
  const canonicalUrl = baseUrl ? `${baseUrl}/categories${selectedCategory ? `?category=${selectedCategory}` : ''}` : '/categories';

  return (
    <div className="min-h-screen bg-white">
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


      {/* Mobile Layout */}
      <div className="md:hidden">
        <div className="pt-4 pb-[96px] px-4 space-y-4">
          {/* 모바일 장르 필터 - 인라인 (퀵네비와 겹치지 않도록 여유 확보) */}
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="flex gap-2 pb-1">
              {genreList.map((genreKo) => {
                const category = categories.find((cat) => cat.name === genreKo);
                if (!category) return null;
                
                const isActive = selectedCategory === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(category.id);
                      setCurrentPage(1);
                      updateQueryParams({
                        category: category.id,
                        page: null,
                      });
                    }}
                    className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {getCategoryName(genreKo)}
                  </button>
                );
              })}
            </div>
          </div>
          {buyNow.bankTransferInfo ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-gray-700 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-blue-900">{t('categoriesPage.bankTransferInfo')}</h3>
                <button
                  type="button"
                  onClick={() => buyNow.closeBankTransferModal()}
                  className="text-blue-600 hover:text-blue-800 text-xs"
                >
                  {t('categoriesPage.close')}
                </button>
              </div>
              <div className="mt-3 space-y-2">
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
                  <div>
                    <span className="font-medium text-gray-900">{t('categoriesPage.depositorName')}</span>{' '}
                    <span className="text-blue-600 font-semibold">{buyNow.bankTransferInfo.expectedDepositor}</span>
                  </div>
                ) : null}
                {buyNow.bankTransferInfo.message ? (
                  <p className="text-xs text-gray-600">{buyNow.bankTransferInfo.message}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* 현재 선택된 카테고리 표시 (모바일) */}
          {!loading && selectedCategory && (
            <div className="mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                {(() => {
                  const category = categories.find(cat => cat.id === selectedCategory);
                  return category ? getCategoryName(category.name) : '';
                })()}
              </h2>
            </div>
          )}

          {/* Mobile Sheets List */}
          <div className="space-y-4">
            {loading && (
              <div className="py-16 text-center text-gray-500" suppressHydrationWarning>
                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-b-2 border-blue-500" />
                {t('categoriesPage.loadingSheets')}
              </div>
            )}

            {!loading && paginatedSheets.length === 0 && (
              <div className="py-16 text-center text-gray-500">
                <i className="ri-file-music-line mb-4 text-4xl text-gray-300" />
                <p className="font-semibold text-gray-600">{t('categoriesPage.noSearchResults')}</p>
              </div>
            )}

            {!loading &&
              paginatedSheets.map((sheet) => {
                const displayPrice = getDisplayPrice(sheet);
                return (
                  <button
                    key={sheet.id}
                    type="button"
                    onClick={() => handleMobileSheetSelect(sheet)}
                    className="flex w-full items-start gap-4 rounded-3xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:bg-gray-50"
                  >
                    <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl border border-gray-200">
                      <img
                        src={getThumbnailUrl(sheet)}
                        alt={sheet.title}
                        className="h-full w-full object-cover"
                        onError={(event) => {
                          const img = event.target as HTMLImageElement;
                          img.src = generateDefaultThumbnail(400, 400);
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="truncate text-sm font-bold text-gray-900">{sheet.title}</p>
                      </div>
                      <p className="truncate text-xs text-gray-500">{sheet.artist}</p>
                      <p className="truncate text-xs text-gray-400">{sheet.album_name || t('categoriesPage.albumInfoNotFound')}</p>
                      <div className="pt-1 text-sm font-semibold text-blue-600">
                        {formatCurrency(displayPrice)}
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>

          {/* Mobile Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-500 disabled:opacity-50"
                disabled={currentPage === 1}
              >
                <i className="ri-arrow-left-s-line text-lg" />
              </button>
              <span className="text-sm text-gray-600">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-500 disabled:opacity-50"
                disabled={currentPage === totalPages}
              >
                <i className="ri-arrow-right-s-line text-lg" />
              </button>
            </div>
          )}
          {showCategoryLimitNotice && (
            <p className="mt-3 text-center text-xs text-gray-500 leading-relaxed">
              {t('categoriesPage.paginationLimitTitle')}
              <br />
              {t('categoriesPage.paginationLimitDescription')}
            </p>
          )}
        </div>
      </div>

      {/* Mobile Detail Bottom Sheet */}
      {
        selectedSheet && isMobileDetailOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm">
            <div className="w-full rounded-t-3xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">{selectedSheet.title}</h3>
                <button
                  type="button"
                  onClick={closeMobileDetail}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-fill text-2xl" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="overflow-hidden rounded-2xl">
                  <img
                    src={getThumbnailUrl(selectedSheet)}
                    alt={selectedSheet.title}
                    className="w-full object-cover"
                    onError={(event) => {
                      const img = event.target as HTMLImageElement;
                      img.src = generateDefaultThumbnail(640, 480);
                    }}
                  />
                </div>
                <div className="space-y-2 text-sm text-gray-600">
                  <p className="font-semibold text-gray-900">{selectedSheet.artist}</p>
                  {selectedSheet.album_name && <p>{t('categoriesPage.albumLabel')}: {selectedSheet.album_name}</p>}
                  {selectedSheet.difficulty && <p>{t('categoriesPage.difficultyLabel')}: {getDifficultyName(selectedSheet.difficulty)}</p>}
                  {selectedSheet.page_count ? <p>{t('categoriesPage.pageLabel')}: {selectedSheet.page_count}{t('categoriesPage.pageUnit')}</p> : null}
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-1 text-right">
                    <span className="text-2xl font-extrabold text-blue-600">
                      {formatCurrency(selectedDisplayPrice)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleFavorite(selectedSheet.id)}
                    disabled={selectedSheetFavoriteLoading}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${selectedSheetIsFavorite
                      ? 'border-red-200 bg-red-50 text-red-500'
                      : 'border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500'
                      } ${selectedSheetFavoriteLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <i className={`ri-heart-${selectedSheetIsFavorite ? 'fill' : 'line'} text-xl`} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(selectedSheet.preview_image_url || selectedSheet.pdf_url) && (
                    <button
                      type="button"
                      onClick={() => handlePreviewOpen(selectedSheet)}
                      className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                    >
                      {t('categoriesPage.previewSheet')}
                    </button>
                  )}
                  {selectedSheet.youtube_url && (
                    <button
                      type="button"
                      onClick={() => handleYoutubeOpen(selectedSheet)}
                      className="flex-1 rounded-xl bg-red-500 px-4 py-3 text-sm font-semibold text-white shadow transition hover:bg-red-600"
                    >
                      {t('categoriesPage.playYoutube')}
                    </button>
                  )}
                </div>
                {buyNow.bankTransferInfo ? (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-gray-700">
                    <h4 className="font-semibold text-blue-900 mb-2">{t('categoriesPage.bankTransferInfo')}</h4>
                    <div className="space-y-1">
                      <p>{t('categoriesPage.bank')}: {buyNow.bankTransferInfo.bankName}</p>
                      <p>{t('categoriesPage.accountNumber')}: {buyNow.bankTransferInfo.accountNumber}</p>
                      <p>{t('categoriesPage.accountHolder')}: {buyNow.bankTransferInfo.depositor}</p>
                      <p>{t('categoriesPage.depositAmount')}: {formatCurrency(buyNow.bankTransferInfo.amount ?? 0)}</p>
                    </div>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleAddToCart(selectedSheet.id);
                      closeMobileDetail();
                    }}
                    disabled={selectedSheet && isInCart(selectedSheet.id)}
                    className={`flex-1 sheet-action-btn btn-cart ${selectedSheet && isInCart(selectedSheet.id) ? 'opacity-60' : ''}`}
                  >
                    {t('categoriesPage.addToCart')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedSheet) {
                        handleBuyNow(selectedSheet);
                      }
                      closeMobileDetail();
                    }}
                    disabled={selectedSheet && buyingNowSheetId === selectedSheet.id}
                    className="flex-1 sheet-action-btn btn-buy"
                  >
                    {selectedSheet && buyingNowSheetId === selectedSheet.id
                      ? t('sheet.buyNowProcessing') || '처리 중...'
                      : t('sheet.buyNow')}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/drum-sheet/${selectedSheet.slug}`)}
                  className="w-full rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  {t('categoriesPage.goToDetail')}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Desktop Layout */}
      <div className="hidden md:block ">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {buyNow.bankTransferInfo ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-gray-700 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-blue-900">{t('categoriesPage.bankTransferInfo')}</h3>
                <button
                  type="button"
                  onClick={() => buyNow.closeBankTransferModal()}
                  className="text-blue-600 hover:text-blue-800 text-xs"
                >
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
                    <span className="text-blue-600 font-semibold">{buyNow.bankTransferInfo.expectedDepositor}</span>
                  </div>
                ) : null}
              </div>
              {buyNow.bankTransferInfo.message ? (
                <p className="mt-3 text-xs text-gray-600">{buyNow.bankTransferInfo.message}</p>
              ) : null}
            </div>
          ) : null}

          {/* 페이지 제목 */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {selectedArtist ? `${selectedArtist}${t('categoriesPage.artistSongs')}` : selectedAlbum ? `${selectedAlbum} ${t('categoriesPage.album')}` : t('categoriesPage.pageTitle')}
            </h1>
            {selectedArtist && (
              <button
                onClick={() => {
                  setSelectedArtist('');
                  setCurrentPage(1);
                  updateQueryParams(
                    {
                      artist: null,
                      page: null,
                    }
                  );
                }}
                className="text-sm text-blue-600 hover:text-blue-800 mt-2"
              >
                {t('categoriesPage.backToAllSheets')}
              </button>
            )}
            {selectedAlbum && (
              <button
                onClick={() => {
                  setSelectedAlbum('');
                  setCurrentPage(1);
                  updateQueryParams(
                    {
                      album: null,
                      page: null,
                    }
                  );
                }}
                className="text-sm text-blue-600 hover:text-blue-800 mt-2"
              >
                {t('categoriesPage.backToAllSheets')}
              </button>
            )}
            {!selectedArtist && !selectedAlbum && (
              <p className="text-gray-600">{t('categoriesPage.pageDescription')}</p>
            )}
          </div>

          {/* 현재 선택된 카테고리 표시 */}
          {!loading && selectedCategory && (
            <div className="mb-4">
              <h2 className="text-2xl font-bold text-gray-900">
                {(() => {
                  const category = categories.find(cat => cat.id === selectedCategory);
                  return category ? getCategoryName(category.name) : '';
                })()}
              </h2>
            </div>
          )}

          {/* 필터 및 정렬 - 기본적으로 숨김 */}
          {!loading && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
              <div className="flex flex-wrap items-center justify-end gap-2 mt-2">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <i className="ri-filter-line text-sm"></i>
                  <span>{t('categoriesPage.filter')}</span>
                  <i className={`ri-arrow-${showFilters ? 'up' : 'down'}-s-line text-sm`}></i>
                </button>

                <button
                  onClick={() => setShowSortFilter(!showSortFilter)}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <i className="ri-sort-desc text-sm"></i>
                  <span>{t('categoriesPage.sort')}</span>
                  <i className={`ri-arrow-${showSortFilter ? 'up' : 'down'}-s-line text-sm`}></i>
                </button>
              </div>

              {/* 정렬 옵션 - 클릭시 표시 */}
              {showSortFilter && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center space-x-4">
                    <label className="text-sm font-medium text-gray-700">{t('categoriesPage.sortLabel')}</label>
                    <select
                      value={sortBy}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSortBy(value);
                        setCurrentPage(1);
                        updateQueryParams(
                          {
                            sort: value === 'newest' ? null : value,
                            page: null,
                          }
                        );
                      }}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm pr-8"
                    >
                      <option value="newest">{t('categoriesPage.sortNewest')}</option>
                      <option value="popular">{t('categoriesPage.sortPopular')}</option>
                      <option value="price-low">{t('categoriesPage.sortPriceLow')}</option>
                      <option value="price-high">{t('categoriesPage.sortPriceHigh')}</option>
                    </select>
                  </div>
                </div>
              )}

              {/* 확장 필터 */}
              {showFilters && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">{t('categoriesPage.categoryLabel')}</label>
                      <select
                        value={selectedCategory}
                        onChange={(e) => handleCategorySelect(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm pr-8"
                      >
                        <option value="">{t('categoriesPage.allCategories')}</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">{t('categoriesPage.difficultyLabelFilter')}</label>
                      <select
                        value={selectedDifficulty}
                        onChange={(e) => {
                          const value = e.target.value;
                          setSelectedDifficulty(value);
                          setCurrentPage(1);
                          updateQueryParams(
                            {
                              difficulty: value || null,
                              page: null,
                            }
                          );
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm pr-8"
                      >
                        <option value="">{t('categoriesPage.allDifficulties')}</option>
                        <option value="beginner">{t('categoriesPage.beginner')}</option>
                        <option value="intermediate">{t('categoriesPage.intermediate')}</option>
                        <option value="advanced">{t('categoriesPage.advanced')}</option>
                      </select>
                    </div>

                    {/* 즉시 다운로드 필터 */}
                    <div>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showInstantOnly}
                          onChange={(e) => {
                            setShowInstantOnly(e.target.checked);
                            setCurrentPage(1);
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-700">
                          즉시 다운로드 가능한 악보만 보기
                        </span>
                      </label>
                      <p className="text-xs text-gray-500 mt-1 ml-6">
                        선주문 상품은 제외됩니다
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">{t('categoriesPage.priceRange')}</label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          placeholder={t('categoriesPage.min')}
                          value={priceRange.min}
                          onChange={(e) => {
                            const value = e.target.value;
                            setPriceRange((prev) => ({ ...prev, min: value }));
                            setCurrentPage(1);
                            updateQueryParams(
                              {
                                priceMin: value,
                                page: null,
                              }
                            );
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                        <span className="text-gray-500">~</span>
                        <input
                          type="number"
                          placeholder={t('categoriesPage.max')}
                          value={priceRange.max}
                          onChange={(e) => {
                            const value = e.target.value;
                            setPriceRange((prev) => ({ ...prev, max: value }));
                            setCurrentPage(1);
                            updateQueryParams(
                              {
                                priceMax: value,
                                page: null,
                              }
                            );
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => {
                        handleCategorySelect('');
                        setSelectedDifficulty('');
                        setPriceRange({ min: '', max: '' });
                        updateQueryParams(
                          {
                            difficulty: null,
                            priceMin: null,
                            priceMax: null,
                            page: null,
                          }
                        );
                      }}
                      className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      {t('categoriesPage.resetFilters')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 악보 목록 - 리스트 형식 */}
          {!loading && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full table-fixed">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="w-[34%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('categoriesPage.tableTitle')}</th>
                    <th className="w-[18%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('categoriesPage.tableArtist')}</th>
                    <th className="w-[24%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('categoriesPage.tableAlbum')}</th>
                    <th className="w-[24%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('categoriesPage.tablePurchase')}</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedSheets.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                        {t('categoriesPage.noSheets')}
                      </td>
                    </tr>
                  ) : (
                    paginatedSheets.map((sheet) => {
                      const displayPrice = getDisplayPrice(sheet);
                      const isFavorite = favoriteIds.has(sheet.id);
                      const isFavoriteLoading = favoriteLoadingIds.has(sheet.id);
                      return (
                        <tr key={sheet.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 align-top">
                            <div className="flex items-center space-x-3 overflow-hidden">
                              <div className="flex-shrink-0">
                                <img
                                  src={getThumbnailUrl(sheet)}
                                  alt={sheet.title}
                                  className="w-12 h-12 object-cover rounded border border-gray-200 cursor-pointer"
                                  onClick={() => router.push(`/drum-sheet/${sheet.slug}`)}
                                />
                              </div>
                              <div className="flex flex-col space-y-1 min-w-0 flex-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <i className="ri-file-music-line text-gray-400 flex-shrink-0"></i>
                                  <span
                                    className="block truncate text-sm font-bold text-gray-900 cursor-pointer hover:text-blue-600"
                                    title={sheet.title}
                                    onClick={() => router.push(`/drum-sheet/${sheet.slug}`)}
                                  >
                                    {sheet.title}
                                  </span>
                                </div>
                                <div className="flex items-center space-x-2 text-xs flex-shrink-0">
                                  <span className="font-semibold text-gray-700">
                                    {formatCurrency(displayPrice)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 align-top">
                            <span
                              className="block truncate text-sm text-gray-600 cursor-pointer hover:text-blue-600"
                              onClick={() => {
                                setSelectedArtist(sheet.artist);
                                setCurrentPage(1);
                                updateQueryParams(
                                  {
                                    artist: sheet.artist,
                                    page: null,
                                  }
                                );
                              }}
                            >
                              {sheet.artist}
                            </span>
                          </td>
                          <td className="px-6 py-4 align-top">
                            <span
                              className="block truncate text-sm text-gray-600 cursor-pointer hover:text-blue-600"
                              title={sheet.album_name || '-'}
                              onClick={() => {
                                if (sheet.album_name) {
                                  setSelectedAlbum(sheet.album_name);
                                  setCurrentPage(1);
                                  updateQueryParams(
                                    {
                                      album: sheet.album_name,
                                      page: null,
                                    }
                                  );
                                }
                              }}
                            >
                              {sheet.album_name || '-'}
                            </span>
                          </td>
                          <td className="px-6 py-4 align-top">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleFavorite(sheet.id);
                                }}
                                disabled={isFavoriteLoading}
                                className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${isFavorite
                                  ? 'border-red-200 bg-red-50 text-red-500'
                                  : 'border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500'
                                  } ${isFavoriteLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                                aria-label={isFavorite ? t('categoriesPage.favoriteRemove') : t('categoriesPage.favoriteAdd')}
                              >
                                <i className={`ri-heart-${isFavorite ? 'fill' : 'line'} text-lg`} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddToCart(sheet.id);
                                }}
                                disabled={isInCart(sheet.id)}
                                className={`sheet-action-btn btn-cart ${isInCart(sheet.id) ? 'opacity-60' : ''}`}
                              >
                                {t('categoriesPage.addToCart')}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleBuyNow(sheet);
                                }}
                                disabled={buyingNowSheetId === sheet.id}
                                className="sheet-action-btn btn-buy"
                              >
                                {buyingNowSheetId === sheet.id ? t('sheet.buyNowProcessing') || '처리 중...' : t('sheet.buyNow')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 페이지네이션 */}
          {!loading && totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center space-x-2">
              <button
                onClick={() => {
                  const previousPage = Math.max(1, currentPage - 1);
                  setCurrentPage(previousPage);
                  updateQueryParams(
                    {
                      page: previousPage > 1 ? String(previousPage) : null,
                    }
                  );
                }}
                disabled={currentPage === 1}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${currentPage === 1
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  }`}
              >
                <i className="ri-arrow-left-s-line"></i>
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                // 현재 페이지 주변 2페이지씩만 표시
                if (
                  page === 1 ||
                  page === totalPages ||
                  (page >= currentPage - 2 && page <= currentPage + 2)
                ) {
                  return (
                    <button
                      key={page}
                      onClick={() => {
                        setCurrentPage(page);
                        updateQueryParams(
                          {
                            page: page > 1 ? String(page) : null,
                          }
                        );
                      }}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${currentPage === page
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
                onClick={() => {
                  const nextPage = Math.min(totalPages, currentPage + 1);
                  setCurrentPage(nextPage);
                  updateQueryParams(
                    {
                      page: nextPage > 1 ? String(nextPage) : null,
                    }
                  );
                }}
                disabled={currentPage === totalPages}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${currentPage === totalPages
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  }`}
              >
                <i className="ri-arrow-right-s-line"></i>
              </button>
            </div>
          )}
          {showCategoryLimitNotice && (
            <p className="mt-3 text-center text-sm text-gray-600 leading-relaxed">
              {t('categoriesPage.paginationLimitTitle')}
              <br />
              {t('categoriesPage.paginationLimitDescription')}
            </p>
          )}

          {/* 로딩 중 */}
          {loading && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <h3 className="text-lg font-medium text-gray-900 mb-2" suppressHydrationWarning>{t('categoriesPage.loadingSheetsMessage')}</h3>
            </div>
          )}

          {/* 빈 상태 - 로딩이 완료되었고 결과가 없을 때만 표시 */}
          {!loading && paginatedSheets.length === 0 && (
            <div className="text-center py-12">
              <i className="ri-file-music-line text-gray-300 w-16 h-16 mx-auto mb-4"></i>
              <h3 className="text-lg font-medium text-gray-900 mb-2">{t('categoriesPage.noSearchResults')}</h3>
              <p className="text-gray-600">{t('categoriesPage.tryDifferentSearch')}</p>
            </div>
          )}
        </div>
      </div>


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
