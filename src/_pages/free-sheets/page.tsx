'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Loader2, Search, ChevronLeft, ChevronRight, ShoppingCart, Zap } from 'lucide-react';

import MainHeader from '../../components/common/MainHeader';
import Footer from '../../components/common/Footer';
import { supabase } from '../../lib/supabase';
import { fetchUserFavorites, toggleFavorite } from '../../lib/favorites';
import { generateDefaultThumbnail } from '../../lib/defaultThumbnail';
import { useTranslation } from 'react-i18next';
import Seo from '../../components/Seo';
import { languageDomainMap } from '../../config/languageDomainMap';
import { useCart } from '../../hooks/useCart';
import { hasPurchasedSheet } from '../../lib/purchaseCheck';
import { getSiteCurrency, convertFromKrw, formatCurrency as formatCurrencyUtil } from '../../lib/currency';
import { logFreeSheetDownload } from '../../lib/logFreeSheetDownload';

interface SupabaseLessonBookRow {
  id: string;
  title: string;
  artist: string;
  difficulty: string | null;
  created_at: string;
  thumbnail_url: string | null;
  pdf_url: string;
  page_count: number | null;
  slug: string;
  price: number | null;
  sales_type?: string | null;
  youtube_url?: string | null;
  title_translations?: Record<string, string> | null;
}

interface LessonBook {
  id: string;
  title: string;
  titleTranslations?: Record<string, string> | null;
  artist: string;
  difficulty: string | null;
  createdAt: string;
  thumbnailUrl: string;
  pdfUrl: string;
  pageCount: number | null;
  slug: string;
  price: number;
  salesType: string | null;
  youtubeUrl: string | null;
  types: string[];
}

// 레슨 유형(서브카테고리). name = DB 카테고리명, key = freeSheets.categories.* i18n 키
const LESSON_TYPES: { name: string; key: string }[] = [
  { name: '루디먼트', key: 'rudiment' },
  { name: '필인', key: 'fillIn' },
  { name: '리듬패턴', key: 'rhythmPattern' },
  { name: '드럼테크닉', key: 'drumTechnique' },
  { name: '기초/입문', key: 'beginnerBasics' },
];

const SHEET_SELECT_FIELDS = `
  id,
  title,
  title_translations,
  artist,
  difficulty,
  created_at,
  thumbnail_url,
  pdf_url,
  page_count,
  slug,
  price,
  sales_type,
  youtube_url
`;

const DIFFICULTY_ORDER: Record<string, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
  '초급': 1,
  '중급': 2,
  '고급': 3,
  unknown: 4,
};

const normalizeDifficultyKey = (value: string | null | undefined): string => {
  if (!value) return 'unknown';
  const normalized = value.toLowerCase();
  if (normalized.includes('beginner') || normalized.includes('초급')) return 'beginner';
  if (normalized.includes('intermediate') || normalized.includes('중급')) return 'intermediate';
  if (normalized.includes('advanced') || normalized.includes('고급')) return 'advanced';
  return value;
};

const getDifficultyLabel = (value: string | null | undefined, t: (key: string) => string): string => {
  if (!value) return t('freeSheets.difficulty.notAvailable');
  const key = normalizeDifficultyKey(value);
  switch (key) {
    case 'beginner': case '초급': return t('freeSheets.difficulty.beginner');
    case 'intermediate': case '중급': return t('freeSheets.difficulty.intermediate');
    case 'advanced': case '고급': return t('freeSheets.difficulty.advanced');
    default: return value;
  }
};

const getDifficultyColor = (value: string | null | undefined): string => {
  const key = normalizeDifficultyKey(value);
  switch (key) {
    case 'beginner': case '초급': return 'bg-emerald-100 text-emerald-700';
    case 'intermediate': case '중급': return 'bg-amber-100 text-amber-700';
    case 'advanced': case '고급': return 'bg-rose-100 text-rose-700';
    default: return 'bg-gray-100 text-gray-600';
  }
};

const ITEMS_PER_PAGE = 12;

const LessonBooksPage = () => {
  const [user, setUser] = useState<User | null>(null);
  const [books, setBooks] = useState<LessonBook[]>([]);
  const [materials, setMaterials] = useState<LessonBook[]>([]);
  const [activeTab, setActiveTab] = useState<'materials' | 'books'>('books');
  const tabResolvedRef = useRef(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState<'latest' | 'title' | 'difficulty' | 'priceLow' | 'priceHigh'>('latest');
  const [freeOnly, setFreeOnly] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoriteLoadingIds, setFavoriteLoadingIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const router = useLocaleRouter();
  const searchParams = useSearchParams();
  const { t, i18n } = useTranslation();
  const contentRef = useRef<HTMLElement>(null);

  // URL ?tab=materials|books 로 초기 탭 결정 (명시되면 자동전환 비활성)
  useEffect(() => {
    const tabParam = searchParams?.get('tab');
    if (tabParam === 'materials' || tabParam === 'books') {
      setActiveTab(tabParam);
      tabResolvedRef.current = true;
    }
  }, [searchParams]);

  const getLessonBookListTitle = useCallback(
    (book: LessonBook) => {
      if (i18n.language === 'ko') return book.title;
      const en = book.titleTranslations?.en?.trim();
      return en || book.title;
    },
    [i18n.language],
  );

  const { addToCart, isInCart } = useCart();

  const formatPrice = useCallback((price: number) => {
    if (!price || price <= 0) return t('freeSheets.price.free');
    try {
      const hostname = typeof window !== 'undefined' ? window.location.hostname : undefined;
      const currency = getSiteCurrency(hostname, i18n.language);
      const converted = convertFromKrw(price, currency, i18n.language);
      return formatCurrencyUtil(converted, currency);
    } catch {
      return `${price.toLocaleString()}원`;
    }
  }, [i18n.language, t]);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const { data: lessonCategory, error: lessonCategoryError } = await supabase
        .from('categories')
        .select('id')
        .eq('name', '드럼레슨')
        .maybeSingle();

      if (lessonCategoryError) {
        console.error(t('freeSheets.console.lessonCategoryError'), lessonCategoryError);
        setErrorMessage(t('freeSheets.errors.lessonCategoryLoadError'));
        setBooks([]);
        return;
      }
      if (!lessonCategory) {
        setErrorMessage(t('freeSheets.errors.lessonCategoryNotFound'));
        setBooks([]);
        return;
      }

      const lessonCategoryId = lessonCategory.id;

      const { data: primarySheets, error: primaryError } = await supabase
        .from('drum_sheets')
        .select(SHEET_SELECT_FIELDS)
        .eq('category_id', lessonCategoryId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (primaryError) {
        console.error(t('freeSheets.console.primarySheetsError'), primaryError);
        setErrorMessage(t('freeSheets.errors.sheetsLoadError'));
        setBooks([]);
        return;
      }

      const primaryList = (primarySheets ?? []) as SupabaseLessonBookRow[];
      const primaryIdSet = new Set(primaryList.map((s) => s.id));

      const { data: junctionRows, error: relationsError } = await supabase
        .from('drum_sheet_categories')
        .select(`
          drum_sheets!inner (
            id, title, title_translations, artist, difficulty, created_at, thumbnail_url,
            pdf_url, page_count, slug, price, sales_type, youtube_url
          )
        `)
        .eq('category_id', lessonCategoryId)
        .eq('drum_sheets.is_active', true);

      if (relationsError) {
        console.error(t('freeSheets.console.relationsError'), relationsError);
      }

      const additionalList = (junctionRows ?? [])
        .map((row: any) => row.drum_sheets as SupabaseLessonBookRow)
        .filter((s): s is SupabaseLessonBookRow => Boolean(s) && !primaryIdSet.has(s.id));

      const sheetList = [...primaryList, ...additionalList];
      sheetList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const mapped: LessonBook[] = sheetList.map((sheet) => ({
        id: sheet.id,
        title: sheet.title,
        titleTranslations: sheet.title_translations ?? null,
        artist: sheet.artist,
        difficulty: sheet.difficulty,
        createdAt: sheet.created_at,
        thumbnailUrl: sheet.thumbnail_url || generateDefaultThumbnail(800, 1067),
        pdfUrl: sheet.pdf_url,
        pageCount: sheet.page_count,
        slug: sheet.slug,
        price: Math.max(0, sheet.price ?? 0),
        salesType: sheet.sales_type ?? 'INSTANT',
        youtubeUrl: sheet.youtube_url ?? null,
        types: [],
      }));

      // 각 교재의 유형(서브카테고리) 태그를 junction에서 조회해 부착
      const ids = mapped.map((b) => b.id);
      if (ids.length > 0) {
        const knownTypeNames = new Set(LESSON_TYPES.map((tp) => tp.name));
        const { data: typeRows } = await supabase
          .from('drum_sheet_categories')
          .select('sheet_id, categories ( name )')
          .in('sheet_id', ids);

        if (typeRows) {
          const typeMap = new Map<string, string[]>();
          for (const row of typeRows as any[]) {
            const name = row?.categories?.name as string | undefined;
            if (!name || !knownTypeNames.has(name)) continue;
            const arr = typeMap.get(row.sheet_id) ?? [];
            arr.push(name);
            typeMap.set(row.sheet_id, arr);
          }
          for (const book of mapped) {
            book.types = typeMap.get(book.id) ?? [];
          }
        }
      }

      setBooks(mapped);
    } catch (error) {
      console.error(t('freeSheets.console.generalError'), error);
      setErrorMessage(t('freeSheets.errors.generalError'));
      setBooks([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  // 드럼레슨 "개별 자료": 유형 카테고리(루디먼트/필인/리듬패턴/드럼테크닉/기초입문)에 직접 속한 악보
  const loadMaterials = useCallback(async () => {
    try {
      const typeNames = LESSON_TYPES.map((tp) => tp.name);
      const { data: typeCats, error: typeCatError } = await supabase
        .from('categories')
        .select('id, name')
        .in('name', typeNames);

      if (typeCatError || !typeCats || typeCats.length === 0) {
        setMaterials([]);
        return;
      }

      const idToName = new Map<string, string>(typeCats.map((c: any) => [c.id, c.name]));
      const typeIds = typeCats.map((c: any) => c.id);

      const { data: rows, error: rowsError } = await supabase
        .from('drum_sheets')
        .select(SHEET_SELECT_FIELDS + ', category_id')
        .in('category_id', typeIds)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (rowsError) {
        console.error(t('freeSheets.console.primarySheetsError'), rowsError);
        setMaterials([]);
        return;
      }

      const mapped: LessonBook[] = ((rows ?? []) as Array<SupabaseLessonBookRow & { category_id: string }>).map((sheet) => ({
        id: sheet.id,
        title: sheet.title,
        titleTranslations: sheet.title_translations ?? null,
        artist: sheet.artist,
        difficulty: sheet.difficulty,
        createdAt: sheet.created_at,
        thumbnailUrl: sheet.thumbnail_url || generateDefaultThumbnail(800, 1067),
        pdfUrl: sheet.pdf_url,
        pageCount: sheet.page_count,
        slug: sheet.slug,
        price: Math.max(0, sheet.price ?? 0),
        salesType: sheet.sales_type ?? 'INSTANT',
        youtubeUrl: sheet.youtube_url ?? null,
        // 자료는 자신이 속한 유형 카테고리명을 type으로 부여 → 유형 필터 탭과 호환
        types: idToName.has(sheet.category_id) ? [idToName.get(sheet.category_id) as string] : [],
      }));

      setMaterials(mapped);
    } catch (error) {
      console.error(t('freeSheets.console.generalError'), error);
      setMaterials([]);
    }
  }, [t]);

  const loadFavorites = useCallback(async () => {
    if (!user) {
      setFavoriteIds(new Set());
      return;
    }
    try {
      const favs = await fetchUserFavorites(user.id);
      setFavoriteIds(new Set(favs.map((f) => f.sheet_id)));
    } catch (error) {
      console.error(t('freeSheets.console.favoritesLoadError'), error);
    }
  }, [user, t]);

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user ?? null);
      } catch (error) {
        console.error(t('freeSheets.console.userLoadError'), error);
        setUser(null);
      }
    };
    init();
    loadBooks();
    loadMaterials();
  }, [loadBooks, loadMaterials]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const handleToggleFavorite = async (sheetId: string) => {
    if (!user) {
      alert(t('freeSheets.errors.loginRequired'));
      return;
    }
    setFavoriteLoadingIds((prev) => new Set(prev).add(sheetId));
    try {
      const isFav = await toggleFavorite(sheetId, user.id);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        isFav ? next.add(sheetId) : next.delete(sheetId);
        return next;
      });
    } catch (error) {
      console.error(t('freeSheets.console.favoriteToggleError'), error);
      alert(t('freeSheets.errors.favoriteError'));
    } finally {
      setFavoriteLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(sheetId);
        return next;
      });
    }
  };

  const handleAddToCart = async (book: LessonBook) => {
    // 비회원은 로그인 없이 게스트 장바구니(localStorage)에 담는다.
    if (!user) {
      await addToCart(book.id);
      return;
    }
    try {
      const purchased = await hasPurchasedSheet(user.id, book.id);
      if (purchased) {
        alert(t('sheetDetail.alreadyPurchased'));
        return;
      }
    } catch (error) {
      console.error('purchase check error', error);
    }
    await addToCart(book.id);
  };

  const handleBuyNow = (book: LessonBook) => {
    // 결제 모달 흐름은 상세 페이지에 통합되어 있으므로 상세 페이지로 이동
    router.push(`/drum-sheet/${book.slug}`);
  };

  // 무료 자료: 로그인·결제 없이 즉시 다운로드 (목록 카드에서 원클릭)
  const handleFreeDownload = async (book: LessonBook) => {
    if (!book.pdfUrl) {
      alert(t('freeSheets.errors.pdfNotReady'));
      return;
    }
    setDownloadingId(book.id);
    try {
      logFreeSheetDownload({ sheetId: book.id, userId: user?.id, downloadSource: 'free-sheets-page' });
      const response = await fetch(book.pdfUrl);
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${book.title} - ${book.artist}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Free download error:', error);
      alert(t('freeSheets.errors.pdfNotReady'));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleViewDetail = (book: LessonBook) => {
    router.push(`/drum-sheet/${book.slug}`);
  };

  // 현재 탭에 해당하는 목록 (자료 또는 교재)
  const activeList = activeTab === 'materials' ? materials : books;
  const showTabs = materials.length > 0 && books.length > 0;

  // 명시적 tab 파라미터가 없을 때, 로드 결과에 따라 기본 탭 1회 자동 결정
  useEffect(() => {
    if (tabResolvedRef.current) return;
    if (loading) return;
    if (materials.length > 0 && books.length === 0) {
      setActiveTab('materials');
    } else {
      setActiveTab('books');
    }
    tabResolvedRef.current = true;
  }, [loading, materials.length, books.length]);

  // 탭 전환 시 유형 하위필터/페이지 초기화
  useEffect(() => {
    setSelectedType('');
    setCurrentPage(1);
  }, [activeTab]);

  const filteredBooks = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    let result = activeList.filter((book) => {
      if (!term) return true;
      const enTitle = (book.titleTranslations?.en || '').toLowerCase();
      const haystack = `${book.title} ${enTitle} ${book.artist}`.toLowerCase();
      if (haystack.includes(term)) return true;
      const titleNoSpace = (book.title || '').toLowerCase().replace(/\s+/g, '');
      const artistNoSpace = (book.artist || '').toLowerCase().replace(/\s+/g, '');
      const termNoSpace = term.replace(/\s+/g, '');
      return titleNoSpace.includes(termNoSpace) || artistNoSpace.includes(termNoSpace);
    });

    if (freeOnly) {
      result = result.filter((book) => !book.price || book.price <= 0);
    }

    if (selectedType) {
      result = result.filter((book) => book.types.includes(selectedType));
    }

    switch (sortOption) {
      case 'title':
        result = [...result].sort((a, b) => a.title.localeCompare(b.title, 'ko'));
        break;
      case 'difficulty':
        result = [...result].sort((a, b) => {
          const aO = DIFFICULTY_ORDER[normalizeDifficultyKey(a.difficulty)] ?? DIFFICULTY_ORDER.unknown;
          const bO = DIFFICULTY_ORDER[normalizeDifficultyKey(b.difficulty)] ?? DIFFICULTY_ORDER.unknown;
          return aO - bO;
        });
        break;
      case 'priceLow':
        result = [...result].sort((a, b) => a.price - b.price);
        break;
      case 'priceHigh':
        result = [...result].sort((a, b) => b.price - a.price);
        break;
      default:
        result = [...result].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
    }
    return result;
  }, [searchTerm, sortOption, freeOnly, selectedType, activeList]);

  // 자료가 1개 이상 있는 유형만 탭으로 노출 (빈 탭 자동 숨김)
  const availableTypes = useMemo(
    () => LESSON_TYPES.filter((tp) => activeList.some((b) => b.types.includes(tp.name))),
    [activeList],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortOption, freeOnly, selectedType]);

  const totalPages = Math.max(1, Math.ceil(filteredBooks.length / ITEMS_PER_PAGE));
  const paginatedBooks = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredBooks.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredBooks, currentPage]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const baseUrl = languageDomainMap[i18n.language as keyof typeof languageDomainMap] || (typeof window !== 'undefined' ? window.location.origin : '');
  const canonicalUrl = baseUrl ? `${baseUrl}/free-sheets` : '/free-sheets';

  return (
    <div className="min-h-screen bg-gray-50">
      <Seo
        title={t('freeSheets.title') + ' | COPYDRUM'}
        description={t('freeSheets.description')}
        canonicalUrl={canonicalUrl}
        locale={i18n.language}
      />

      <div className="hidden md:block">
        <MainHeader user={user} />
      </div>
      <div className="md:hidden">
        <MainHeader user={user} />
      </div>

      {/* Hero Banner — 교재 판매 컨셉 */}
      <section className="relative bg-gradient-to-br from-amber-600 via-orange-600 to-rose-600 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-32 h-32 border-2 border-white rounded-2xl rotate-12"></div>
          <div className="absolute bottom-10 right-10 w-48 h-48 border-2 border-white rounded-2xl -rotate-6"></div>
          <div className="absolute top-1/2 left-1/3 w-20 h-20 border-2 border-white rounded-2xl rotate-45"></div>
        </div>

        <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <div className="flex flex-col gap-5 max-w-3xl">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm px-4 py-1.5 text-sm font-semibold tracking-wide text-white border border-white/30">
                <i className="ri-book-2-line text-yellow-200"></i>
                {t('freeSheets.badge')}
              </span>
            </div>
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
              {t('freeSheets.title')}
            </h1>
            <p className="text-sm text-orange-50 sm:text-base md:text-lg leading-relaxed max-w-2xl">
              {t('freeSheets.description')}
            </p>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm">
              <span className="rounded-full border border-white/40 bg-white/10 backdrop-blur-sm px-3 py-1.5 flex items-center gap-1.5">
                <i className="ri-download-cloud-line text-yellow-200"></i>
                {t('freeSheets.features.freeDownload')}
              </span>
              <span className="rounded-full border border-white/40 bg-white/10 backdrop-blur-sm px-3 py-1.5 flex items-center gap-1.5">
                <i className="ri-graduation-cap-line text-yellow-200"></i>
                {t('freeSheets.features.categoryLearning')}
              </span>
              <span className="rounded-full border border-white/40 bg-white/10 backdrop-blur-sm px-3 py-1.5 flex items-center gap-1.5">
                <i className="ri-medal-line text-yellow-200"></i>
                {t('freeSheets.features.youtubeLesson')}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Filters & Content */}
      <section ref={contentRef} className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6">
          {/* 상위 탭: 자료 / 교재 (둘 다 데이터가 있을 때만 노출) */}
          {!loading && showTabs && (
            <div className="flex w-full gap-2 rounded-2xl bg-gray-100 p-1.5 sm:w-auto sm:self-start">
              <button
                type="button"
                onClick={() => setActiveTab('materials')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-colors sm:flex-none ${
                  activeTab === 'materials'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <i className="ri-music-2-line text-base" />
                {t('freeSheets.tabs.materials')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('books')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-colors sm:flex-none ${
                  activeTab === 'books'
                    ? 'bg-white text-orange-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <i className="ri-book-2-line text-base" />
                {t('freeSheets.tabs.books')}
              </button>
            </div>
          )}

          {/* Search & Sort */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('freeSheets.search.placeholder')}
                className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-11 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-100"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFreeOnly((prev) => !prev)}
                aria-pressed={freeOnly}
                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                  freeOnly
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <i className={`ri-price-tag-3-${freeOnly ? 'fill' : 'line'} text-base`} />
                {t('freeSheets.price.free')}
              </button>
              <label className="text-sm font-medium text-gray-500" htmlFor="sort">
                {t('freeSheets.sort.label')}
              </label>
              <select
                id="sort"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as typeof sortOption)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-100"
              >
                <option value="latest">{t('freeSheets.sort.latest')}</option>
                <option value="title">{t('freeSheets.sort.title')}</option>
                <option value="difficulty">{t('freeSheets.sort.difficulty')}</option>
                <option value="priceLow">{t('freeSheets.sort.priceLow')}</option>
                <option value="priceHigh">{t('freeSheets.sort.priceHigh')}</option>
              </select>
            </div>
          </div>

          {/* Type Filter Tabs (자료가 있는 유형만 노출) */}
          {!loading && availableTypes.length > 0 && (
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" style={{ scrollbarWidth: 'none' }}>
              <div className="flex gap-2 pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedType('')}
                  className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                    selectedType === ''
                      ? 'bg-orange-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {t('freeSheets.categories.all')}
                </button>
                {availableTypes.map((tp) => (
                  <button
                    key={tp.name}
                    type="button"
                    onClick={() => setSelectedType(tp.name)}
                    className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                      selectedType === tp.name
                        ? 'bg-orange-600 text-white'
                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {t(`freeSheets.categories.${tp.key}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Results Info */}
          {!loading && (
            <div className="text-sm text-gray-500">
              {filteredBooks.length}{i18n.language === 'ko' ? (activeTab === 'books' ? '권' : '개') : ' results'}
            </div>
          )}

          {errorMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {errorMessage}
            </div>
          )}

          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="flex items-center gap-3 text-orange-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm font-medium">{t('freeSheets.loading')}</span>
              </div>
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-center text-gray-500">
              <i className="ri-book-2-line text-5xl text-gray-300"></i>
              <span className="text-lg font-semibold text-gray-600">{t('freeSheets.empty.title')}</span>
              <p className="text-sm text-gray-500">{t('freeSheets.empty.description')}</p>
            </div>
          ) : (
            /* ====== Book Card Grid ====== */
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {paginatedBooks.map((book) => {
                const isFav = favoriteIds.has(book.id);
                const isFavLoading = favoriteLoadingIds.has(book.id);
                const inCart = isInCart(book.id);
                const isFree = !book.price || book.price <= 0;
                const isDownloading = downloadingId === book.id;

                return (
                  <div
                    key={book.id}
                    className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:shadow-xl hover:-translate-y-0.5"
                  >
                    {/* Book Cover (Portrait 3:4) */}
                    <button
                      type="button"
                      onClick={() => handleViewDetail(book)}
                      className="relative aspect-[3/4] w-full overflow-hidden bg-gradient-to-br from-amber-50 to-orange-50"
                      aria-label={t('freeSheets.actions.goToDetail')}
                    >
                      <img
                        src={book.thumbnailUrl}
                        alt={getLessonBookListTitle(book)}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      {/* Subtle gradient overlay (for legibility) */}
                      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/30 to-transparent" />

                      {/* Page Count Pill */}
                      {book.pageCount ? (
                        <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
                          {book.pageCount}p
                        </span>
                      ) : null}

                      {/* PDF Badge */}
                      <span className="absolute left-3 top-3 z-10 rounded-md bg-white/95 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-700 shadow-sm">
                        PDF
                      </span>

                      {/* FREE Badge */}
                      {isFree && (
                        <span className="absolute left-3 top-9 z-10 rounded-md bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
                          {t('freeSheets.price.free')}
                        </span>
                      )}
                    </button>

                    {/* Favorite Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFavorite(book.id);
                      }}
                      className={`absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full shadow transition-colors ${
                        isFav
                          ? 'bg-red-50 text-red-500 border border-red-200'
                          : 'bg-white/95 text-gray-500 hover:text-red-500'
                      }`}
                      disabled={isFavLoading}
                      aria-label={isFav ? t('freeSheets.mobile.unfavorite') : t('freeSheets.mobile.favorite')}
                    >
                      {isFavLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <i className={`ri-heart-${isFav ? 'fill' : 'line'} text-lg`} />
                      )}
                    </button>

                    {/* Card Body */}
                    <div className="flex flex-1 flex-col gap-2 p-4">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${getDifficultyColor(book.difficulty)}`}>
                          {getDifficultyLabel(book.difficulty, t)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleViewDetail(book)}
                        className="text-left"
                      >
                        <h3 className="text-sm font-bold text-gray-900 leading-snug line-clamp-2 hover:text-orange-600 transition-colors">
                          {getLessonBookListTitle(book)}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{book.artist}</p>
                      </button>

                      {/* Price */}
                      <div className="mt-1">
                        <div className="text-lg font-extrabold text-gray-900">
                          {formatPrice(book.price)}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="mt-auto flex gap-2 pt-2">
                        {isFree ? (
                          /* 무료: 로그인·결제 없이 원클릭 다운로드 */
                          <button
                            type="button"
                            onClick={() => handleFreeDownload(book)}
                            disabled={isDownloading}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:from-emerald-700 hover:to-teal-700 active:from-emerald-800 active:to-teal-800 disabled:opacity-60"
                            aria-label={t('freeSheets.mobile.freeDownload')}
                          >
                            {isDownloading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <i className="ri-download-2-line text-base" />
                            )}
                            <span>{t('freeSheets.mobile.freeDownload')}</span>
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleAddToCart(book)}
                              disabled={inCart}
                              className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                                inCart
                                  ? 'border-gray-200 bg-gray-100 text-gray-500 cursor-default'
                                  : 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 active:bg-orange-200'
                              }`}
                              aria-label={t('freeSheets.actions.addToCart')}
                            >
                              <ShoppingCart className="h-4 w-4" />
                              <span className="hidden sm:inline">{t('freeSheets.actions.addToCart')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBuyNow(book)}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-600 to-rose-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:from-orange-700 hover:to-rose-700 active:from-orange-800 active:to-rose-800"
                              aria-label={t('freeSheets.actions.buyNow')}
                            >
                              <Zap className="h-4 w-4" />
                              <span className="hidden sm:inline">{t('freeSheets.actions.buyNow')}</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 페이지네이션 */}
          {!loading && totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-1.5">
              <button
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className={`flex items-center justify-center w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                  currentPage === 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                }`}
              >
                <ChevronLeft className="h-4 w-4" />
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
                      className={`flex items-center justify-center min-w-[36px] h-9 px-2.5 rounded-lg text-sm font-medium transition-colors ${
                        currentPage === page
                          ? 'bg-orange-600 text-white shadow-sm'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                      }`}
                    >
                      {page}
                    </button>
                  );
                }
                if (page === currentPage - 3 || page === currentPage + 3) {
                  return (
                    <span key={page} className="px-1.5 text-gray-400">
                      ...
                    </span>
                  );
                }
                return null;
              })}

              <button
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className={`flex items-center justify-center w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                  currentPage === totalPages
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                }`}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="hidden md:block mt-8">
        <Footer />
      </div>

      <div className="md:hidden px-4 py-8 text-center space-y-2">
        <p className="text-xs text-gray-500">© {new Date().getFullYear()} COPYDRUM. All rights reserved.</p>
      </div>
    </div>
  );
};

export default LessonBooksPage;
