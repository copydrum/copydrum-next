'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Loader2, Search, Download, X, ChevronLeft, ChevronRight } from 'lucide-react';

import MainHeader from '../../components/common/MainHeader';
import Footer from '../../components/common/Footer';
import { supabase } from '../../lib/supabase';
import { fetchUserFavorites, toggleFavorite } from '../../lib/favorites';
import { generateDefaultThumbnail } from '../../lib/defaultThumbnail';
import { useTranslation } from 'react-i18next';
import Seo from '../../components/Seo';
import { languageDomainMap } from '../../config/languageDomainMap';
import { logFreeSheetDownload } from '../../lib/logFreeSheetDownload';

interface SupabaseDrumSheetRow {
  id: string;
  title: string;
  artist: string;
  difficulty: string | null;
  created_at: string;
  thumbnail_url: string | null;
  youtube_url: string | null;
  pdf_url: string;
  page_count: number | null;
  slug: string;
  categories?: {
    name: string;
  } | null;
}

interface DrumSheetCategoryRow {
  sheet_id: string;
  category?: {
    name: string;
  } | null;
}

interface DrumLessonRelationRow {
  sheet_id: string;
}

interface FreeSheet {
  id: string;
  title: string;
  artist: string;
  difficulty: string | null;
  createdAt: string;
  thumbnailUrl: string;
  youtubeUrl: string | null;
  pdfUrl: string;
  pageCount: number | null;
  slug: string;
  categories: string[];
}

const getSubCategoryOptions = (t: (key: string) => string) => [
  { key: 'all', label: t('freeSheets.categories.all') },
  { key: '드럼테크닉', label: t('freeSheets.categories.drumTechnique') },
  { key: '루디먼트', label: t('freeSheets.categories.rudiment') },
  { key: '드럼솔로', label: t('freeSheets.categories.drumSolo') },
  { key: '기초/입문', label: t('freeSheets.categories.beginnerBasics') },
  { key: '리듬패턴', label: t('freeSheets.categories.rhythmPattern') },
  { key: '필인', label: t('freeSheets.categories.fillIn') },
] as const;

const SHEET_SELECT_FIELDS = `
  id,
  title,
  artist,
  difficulty,
  created_at,
  thumbnail_url,
  youtube_url,
  pdf_url,
  page_count,
  slug,
  categories (
    name
  )
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

const extractYouTubeVideoId = (url: string | null): string | null => {
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

const buildThumbnailUrl = (sheet: SupabaseDrumSheetRow): string => {
  if (sheet.thumbnail_url) return sheet.thumbnail_url;
  const youtubeId = extractYouTubeVideoId(sheet.youtube_url);
  if (youtubeId) return `https://i.ytimg.com/vi/${youtubeId}/hq720.jpg`;
  return generateDefaultThumbnail(1280, 720);
};

const ITEMS_PER_PAGE = 12;

const FreeSheetsPage = () => {
  const [user, setUser] = useState<User | null>(null);
  const [sheets, setSheets] = useState<FreeSheet[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState<'latest' | 'title' | 'difficulty'>('latest');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoriteLoadingIds, setFavoriteLoadingIds] = useState<Set<string>>(new Set());
  const [expandedVideoId, setExpandedVideoId] = useState<string | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const router = useLocaleRouter();
  const { t, i18n } = useTranslation();
  const contentRef = useRef<HTMLElement>(null);

  const getCategoryName = (categoryKo: string): string => {
    const categoryMap: Record<string, string> = {
      '드럼테크닉': t('freeSheets.categories.drumTechnique'),
      '루디먼트': t('freeSheets.categories.rudiment'),
      '드럼솔로': t('freeSheets.categories.drumSolo'),
      '기초/입문': t('freeSheets.categories.beginnerBasics'),
      '리듬패턴': t('freeSheets.categories.rhythmPattern'),
      '필인': t('freeSheets.categories.fillIn'),
      '드럼레슨': t('freeSheets.categories.drumLesson'),
      '카테고리 준비 중': t('freeSheets.categories.categoryPending'),
    };
    return categoryMap[categoryKo] || categoryKo;
  };

  const formatDate = (isoString: string): string => {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(i18n.language || 'ko', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  const loadSheets = useCallback(async () => {
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
        setSheets([]);
        return;
      }
      if (!lessonCategory) {
        setErrorMessage(t('freeSheets.errors.lessonCategoryNotFound'));
        setSheets([]);
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
        setSheets([]);
        return;
      }

      const primaryList = primarySheets ?? [];
      const primaryIdSet = new Set(primaryList.map((s) => s.id));

      const { data: lessonRelations, error: relationsError } = await supabase
        .from('drum_sheet_categories')
        .select('sheet_id')
        .eq('category_id', lessonCategoryId);

      if (relationsError) {
        console.error(t('freeSheets.console.relationsError'), relationsError);
      }

      const relationIdSet = new Set<string>();
      (lessonRelations ?? []).forEach((rel) => {
        const sheetId = (rel as DrumLessonRelationRow | null)?.sheet_id;
        if (sheetId) relationIdSet.add(sheetId);
      });

      const additionalIds = Array.from(relationIdSet).filter((id) => !primaryIdSet.has(id));
      let additionalList: SupabaseDrumSheetRow[] = [];

      if (additionalIds.length > 0) {
        const { data: additionalSheets, error: additionalError } = await supabase
          .from('drum_sheets')
          .select(SHEET_SELECT_FIELDS)
          .in('id', additionalIds)
          .eq('is_active', true);

        if (additionalError) {
          console.error(t('freeSheets.console.additionalSheetsError'), additionalError);
        } else {
          additionalList = additionalSheets ?? [];
        }
      }

      const sheetList = [...primaryList];
      additionalList.forEach((s) => {
        if (!primaryIdSet.has(s.id)) sheetList.push(s);
      });
      sheetList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const sheetIds = sheetList.map((s) => s.id);
      const extraCategoryMap = new Map<string, string[]>();

      if (sheetIds.length > 0) {
        const { data: extraCategories, error: extraError } = await supabase
          .from('drum_sheet_categories')
          .select(`sheet_id, category:categories ( name )`)
          .in('sheet_id', sheetIds);

        if (extraError) {
          console.error(t('freeSheets.console.extraCategoriesError'), extraError);
        } else {
          const typed = (extraCategories ?? []) as DrumSheetCategoryRow[];
          typed.forEach((rel) => {
            if (!rel?.sheet_id || !rel.category?.name) return;
            const list = extraCategoryMap.get(rel.sheet_id) ?? [];
            list.push(rel.category.name);
            extraCategoryMap.set(rel.sheet_id, list);
          });
        }
      }

      const mapped: FreeSheet[] = sheetList.map((sheet) => {
        const catSet = new Set<string>();
        catSet.add('드럼레슨');
        if (sheet.categories?.name) catSet.add(sheet.categories.name);
        (extraCategoryMap.get(sheet.id) ?? []).forEach((n) => catSet.add(n));

        const cats = Array.from(catSet).sort((a, b) => {
          if (a === '드럼레슨') return -1;
          if (b === '드럼레슨') return 1;
          return a.localeCompare(b, 'ko');
        });

        return {
          id: sheet.id,
          title: sheet.title,
          artist: sheet.artist,
          difficulty: sheet.difficulty,
          createdAt: sheet.created_at,
          thumbnailUrl: buildThumbnailUrl(sheet),
          youtubeUrl: sheet.youtube_url,
          pdfUrl: sheet.pdf_url,
          pageCount: sheet.page_count,
          slug: sheet.slug,
          categories: cats,
        };
      });

      setSheets(mapped);
    } catch (error) {
      console.error(t('freeSheets.console.generalError'), error);
      setErrorMessage(t('freeSheets.errors.generalError'));
      setSheets([]);
    } finally {
      setLoading(false);
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
    loadSheets();
  }, [loadSheets]);

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

  const handleDownloadPdf = async (sheet: FreeSheet) => {
    if (!sheet.pdfUrl) {
      alert(t('freeSheets.errors.pdfNotReady'));
      return;
    }
    setDownloadingIds((prev) => new Set(prev).add(sheet.id));
    try {
      // 다운로드 로그 기록 (비동기, 실패해도 다운로드는 진행)
      logFreeSheetDownload({
        sheetId: sheet.id,
        userId: user?.id,
        downloadSource: 'free-sheets-page',
      });
      const response = await fetch(sheet.pdfUrl);
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${sheet.title} - ${sheet.artist}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Download error:', error);
      alert(t('freeSheets.errors.pdfNotReady'));
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(sheet.id);
        return next;
      });
    }
  };

  const handleToggleVideo = (sheetId: string) => {
    setExpandedVideoId((prev) => (prev === sheetId ? null : sheetId));
  };

  const filteredSheets = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    let result = sheets.filter((sheet) => {
      if (!term) return true;

      const termNoSpaces = term.replace(/\s+/g, '');
      const termWords = term.split(/\s+/).filter((w) => w.length > 0);
      const stripParens = (s: string) => s.replace(/\([^)]*\)/g, '').replace(/\s+/g, '');

      const titleNoSpaces = (sheet.title || '').toLowerCase().replace(/\s+/g, '');
      const artistNoSpaces = (sheet.artist || '').toLowerCase().replace(/\s+/g, '');
      const categoriesStr = sheet.categories.join(' ').toLowerCase().replace(/\s+/g, '');
      const titleClean = stripParens((sheet.title || '').toLowerCase());
      const artistClean = stripParens((sheet.artist || '').toLowerCase());
      const combinedNoSpaces = artistNoSpaces + titleNoSpaces;
      const combinedClean = artistClean + titleClean;

      const haystack = `${sheet.title} ${sheet.artist} ${sheet.categories.join(' ')}`.toLowerCase();
      if (haystack.includes(term)) return true;
      if (titleNoSpaces.includes(termNoSpaces)) return true;
      if (artistNoSpaces.includes(termNoSpaces)) return true;
      if (categoriesStr.includes(termNoSpaces)) return true;
      if (titleClean.includes(termNoSpaces)) return true;
      if (artistClean.includes(termNoSpaces)) return true;
      if (combinedNoSpaces.includes(termNoSpaces)) return true;
      if (combinedClean.includes(termNoSpaces)) return true;

      if (termWords.length > 1) {
        return termWords.every((word) => {
          const wNoSpaces = word.replace(/\s+/g, '');
          return (
            titleNoSpaces.includes(wNoSpaces) ||
            artistNoSpaces.includes(wNoSpaces) ||
            categoriesStr.includes(wNoSpaces) ||
            artistClean.includes(wNoSpaces) ||
            titleClean.includes(wNoSpaces)
          );
        });
      }
      return false;
    });

    if (selectedCategory !== 'all') {
      result = result.filter((s) => s.categories.includes(selectedCategory));
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
      default:
        result = [...result].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
    }
    return result;
  }, [searchTerm, selectedCategory, sortOption, sheets]);

  // 필터/검색/정렬 변경 시 페이지 1로 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, sortOption]);

  // 페이지네이션 계산
  const totalPages = Math.max(1, Math.ceil(filteredSheets.length / ITEMS_PER_PAGE));
  const paginatedSheets = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredSheets.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredSheets, currentPage]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // 콘텐츠 영역으로 스크롤
    contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // SEO
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

      {/* Desktop Header */}
      <div className="hidden md:block">
        <MainHeader user={user} />
      </div>
      {/* Mobile Header */}
      <div className="md:hidden">
        <MainHeader user={user} />
      </div>

      {/* Hero Banner */}
      <section className="relative bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-500 text-white overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-32 h-32 border-2 border-white rounded-full"></div>
          <div className="absolute bottom-10 right-10 w-48 h-48 border-2 border-white rounded-full"></div>
          <div className="absolute top-1/2 left-1/3 w-20 h-20 border-2 border-white rounded-full"></div>
        </div>

        <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <div className="flex flex-col gap-5 max-w-3xl">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm px-4 py-1.5 text-sm font-semibold tracking-wide text-white border border-white/30">
                <i className="ri-gift-line text-yellow-300"></i>
                {t('freeSheets.badge')}
              </span>
            </div>
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
              {t('freeSheets.title')}
            </h1>
            <p className="text-sm text-blue-100 sm:text-base md:text-lg leading-relaxed max-w-2xl">
              {t('freeSheets.description')}
            </p>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm">
              <span className="rounded-full border border-white/40 bg-white/10 backdrop-blur-sm px-3 py-1.5 flex items-center gap-1.5">
                <i className="ri-download-line text-yellow-300"></i>
                {t('freeSheets.features.freeDownload')}
              </span>
              <span className="rounded-full border border-white/40 bg-white/10 backdrop-blur-sm px-3 py-1.5 flex items-center gap-1.5">
                <i className="ri-folder-music-line text-yellow-300"></i>
                {t('freeSheets.features.categoryLearning')}
              </span>
              <span className="rounded-full border border-white/40 bg-white/10 backdrop-blur-sm px-3 py-1.5 flex items-center gap-1.5">
                <i className="ri-youtube-line text-yellow-300"></i>
                {t('freeSheets.features.youtubeLesson')}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Filters & Content */}
      <section ref={contentRef} className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6">
          {/* Category Tabs */}
          <div className="-mx-4 overflow-x-auto px-4 pb-1">
            <div className="flex w-max gap-2">
              {getSubCategoryOptions(t).map((option) => {
                const isActive = selectedCategory === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setSelectedCategory(option.key)}
                    className={`whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-medium transition-all ${
                      isActive
                        ? 'border-transparent bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-blue-400 hover:text-blue-600'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search & Sort */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('freeSheets.search.placeholder')}
                className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-11 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-500" htmlFor="sort">
                {t('freeSheets.sort.label')}
              </label>
              <select
                id="sort"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as typeof sortOption)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="latest">{t('freeSheets.sort.latest')}</option>
                <option value="title">{t('freeSheets.sort.title')}</option>
                <option value="difficulty">{t('freeSheets.sort.difficulty')}</option>
              </select>
            </div>
          </div>

          {/* Results Info */}
          {!loading && (
            <div className="text-sm text-gray-500">
              {t('freeSheets.categories.all')} {filteredSheets.length}{i18n.language === 'ko' ? '개' : ' results'}
            </div>
          )}

          {/* Error */}
          {errorMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {errorMessage}
            </div>
          )}

          {/* Loading */}
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="flex items-center gap-3 text-blue-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm font-medium">{t('freeSheets.loading')}</span>
              </div>
            </div>
          ) : filteredSheets.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-center text-gray-500">
              <i className="ri-music-2-line text-5xl text-gray-300"></i>
              <span className="text-lg font-semibold text-gray-600">{t('freeSheets.empty.title')}</span>
              <p className="text-sm text-gray-500">{t('freeSheets.empty.description')}</p>
            </div>
          ) : (
            /* ====== Card Grid ====== */
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {paginatedSheets.map((sheet) => {
                const isFav = favoriteIds.has(sheet.id);
                const isFavLoading = favoriteLoadingIds.has(sheet.id);
                const isDownloading = downloadingIds.has(sheet.id);
                const isVideoExpanded = expandedVideoId === sheet.id;
                const videoId = extractYouTubeVideoId(sheet.youtubeUrl);
                const displayCategories = sheet.categories.filter((c) => c !== '드럼레슨');

                return (
                  <div
                    key={sheet.id}
                    className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:shadow-lg"
                  >
                    {/* Thumbnail / Video Area */}
                    <div className="relative">
                      {isVideoExpanded && videoId ? (
                        /* Inline YouTube Player */
                        <div className="relative">
                          <div className="aspect-video w-full bg-black">
                            <iframe
                              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
                              title={`${sheet.title} - ${sheet.artist}`}
                              className="w-full h-full"
                              frameBorder="0"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          </div>
                          {/* Close Video Button */}
                          <button
                            type="button"
                            onClick={() => handleToggleVideo(sheet.id)}
                            className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors z-10"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        /* Thumbnail with Play Button */
                        <div className="relative cursor-pointer" onClick={() => videoId && handleToggleVideo(sheet.id)}>
                          <div
                            className="aspect-video w-full bg-gray-200 transition duration-300 group-hover:brightness-95"
                            style={{
                              backgroundImage: `url(${sheet.thumbnailUrl})`,
                              backgroundPosition: 'center',
                              backgroundSize: 'cover',
                            }}
                          />
                          {/* Gradient Overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

                          {/* Play Button */}
                          {videoId && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-red-600 shadow-lg transition-transform group-hover:scale-110">
                                <svg className="w-7 h-7 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                            </div>
                          )}

                          {/* No Video Indicator */}
                          {!videoId && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-gray-400">
                                <i className="ri-music-2-line text-2xl"></i>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* FREE Badge */}
                      <span className="absolute left-3 top-3 z-10 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-md">
                        FREE
                      </span>

                      {/* Favorite Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleFavorite(sheet.id);
                        }}
                        className={`absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full shadow transition-colors ${
                          isFav
                            ? 'bg-red-50 text-red-500 border border-red-200'
                            : 'bg-white/90 text-gray-500 hover:text-red-500'
                        }`}
                        disabled={isFavLoading}
                      >
                        {isFavLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <i className={`ri-heart-${isFav ? 'fill' : 'line'} text-lg`} />
                        )}
                      </button>
                    </div>

                    {/* Card Content */}
                    <div className="flex flex-1 flex-col gap-3 p-4">
                      {/* Info Row */}
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>{formatDate(sheet.createdAt)}</span>
                        {sheet.pageCount ? <span>{sheet.pageCount}p</span> : null}
                      </div>

                      {/* Title & Artist */}
                      <div>
                        <h3 className="text-base font-bold text-gray-900 leading-tight line-clamp-2">
                          {sheet.title}
                        </h3>
                        <p className="text-sm font-medium text-blue-600 mt-0.5">{sheet.artist}</p>
                      </div>

                      {/* Tags */}
                      <div className="mt-auto flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${getDifficultyColor(sheet.difficulty)}`}>
                          {getDifficultyLabel(sheet.difficulty, t)}
                        </span>
                        {displayCategories.length > 0 ? (
                          displayCategories.map((cat) => (
                            <span key={cat} className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                              {getCategoryName(cat)}
                            </span>
                          ))
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                            {getCategoryName('카테고리 준비 중')}
                          </span>
                        )}
                        {videoId && (
                          <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600">
                            <i className="ri-youtube-fill mr-1"></i>YouTube
                          </span>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => handleDownloadPdf(sheet)}
                          disabled={isDownloading}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60"
                        >
                          {isDownloading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          <span>{isDownloading ? '...' : t('freeSheets.actions.viewFreeSheet')}</span>
                        </button>
                        {videoId && (
                          <button
                            type="button"
                            onClick={() => handleToggleVideo(sheet.id)}
                            className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                              isVideoExpanded
                                ? 'border-red-200 bg-red-50 text-red-600'
                                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <i className={`ri-${isVideoExpanded ? 'stop' : 'play'}-circle-line text-base`}></i>
                          </button>
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
              {/* 이전 버튼 */}
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

              {/* 페이지 번호 */}
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
                          ? 'bg-blue-600 text-white shadow-sm'
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

              {/* 다음 버튼 */}
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

      {/* Footer (PC) */}
      <div className="hidden md:block mt-8">
        <Footer />
      </div>

      {/* Mobile Footer Info */}
      <div className="md:hidden px-4 py-8 text-center space-y-2">
        <p className="text-xs text-gray-500">© {new Date().getFullYear()} COPYDRUM. All rights reserved.</p>
      </div>
    </div>
  );
};

export default FreeSheetsPage;
