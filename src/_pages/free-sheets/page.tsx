'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { Heart, Loader2, Play, Search } from 'lucide-react';

import MainHeader from '../../components/common/MainHeader';
import { supabase } from '../../lib/supabase';
import { fetchUserFavorites, toggleFavorite } from '../../lib/favorites';
import { generateDefaultThumbnail } from '../../lib/defaultThumbnail';
import { useTranslation } from 'react-i18next';

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
  if (!value) {
    return 'unknown';
  }

  const normalized = value.toLowerCase();

  if (normalized.includes('beginner') || normalized.includes('초급')) {
    return 'beginner';
  }
  if (normalized.includes('intermediate') || normalized.includes('중급')) {
    return 'intermediate';
  }
  if (normalized.includes('advanced') || normalized.includes('고급')) {
    return 'advanced';
  }

  return value;
};

const getDifficultyLabel = (value: string | null | undefined, t: (key: string) => string): string => {
  if (!value) {
    return t('freeSheets.difficulty.notAvailable');
  }

  const key = normalizeDifficultyKey(value);

  switch (key) {
    case 'beginner':
    case '초급':
      return t('freeSheets.difficulty.beginner');
    case 'intermediate':
    case '중급':
      return t('freeSheets.difficulty.intermediate');
    case 'advanced':
    case '고급':
      return t('freeSheets.difficulty.advanced');
    default:
      return value;
  }
};

const extractYouTubeVideoId = (url: string | null, t: (key: string) => string): string | null => {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace('/', '');
    }

    if (parsed.searchParams.has('v')) {
      return parsed.searchParams.get('v');
    }

    const pathMatch = parsed.pathname.match(/\/embed\/([^/?]+)/);
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1];
    }
  } catch (error) {
    console.warn(t('freeSheets.console.youtubeUrlParseError'), error);
  }

  return null;
};

const buildThumbnailUrl = (sheet: SupabaseDrumSheetRow, t: (key: string) => string): string => {
  if (sheet.thumbnail_url) {
    return sheet.thumbnail_url;
  }

  const youtubeId = extractYouTubeVideoId(sheet.youtube_url, t);
  if (youtubeId) {
    return `https://i.ytimg.com/vi/${youtubeId}/hq720.jpg`;
  }

  return generateDefaultThumbnail(1280, 720);
};

const formatRelativeDate = (isoString: string): string => {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('ko', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
};

const FreeSheetsPage = () => {
  const [user, setUser] = useState<User | null>(null);
  const [sheets, setSheets] = useState<FreeSheet[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<'all' | '드럼테크닉' | '루디먼트' | '드럼솔로' | '기초/입문' | '리듬패턴' | '필인'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState<'latest' | 'title' | 'difficulty'>('latest');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoriteLoadingIds, setFavoriteLoadingIds] = useState<Set<string>>(new Set());
  const [selectedSheet, setSelectedSheet] = useState<FreeSheet | null>(null);
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);
  const router = useLocaleRouter();
  const { t } = useTranslation();

  // 카테고리 이름을 번역하는 함수
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

  const loadSheets = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const {
        data: lessonCategory,
        error: lessonCategoryError,
      } = await supabase
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

      const {
        data: primarySheets,
        error: primaryError,
      } = await supabase
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
      const primaryIdSet = new Set(primaryList.map((sheet) => sheet.id));

      const {
        data: lessonRelations,
        error: relationsError,
      } = await supabase
        .from('drum_sheet_categories')
        .select('sheet_id')
        .eq('category_id', lessonCategoryId);

      if (relationsError) {
        console.error(t('freeSheets.console.relationsError'), relationsError);
      }

      const relationIdSet = new Set<string>();
      (lessonRelations ?? []).forEach((relation) => {
        const sheetId = (relation as DrumLessonRelationRow | null)?.sheet_id;
        if (sheetId) {
          relationIdSet.add(sheetId);
        }
      });

      const additionalIds = Array.from(relationIdSet).filter((id) => !primaryIdSet.has(id));

      let additionalList: SupabaseDrumSheetRow[] = [];

      if (additionalIds.length > 0) {
        const {
          data: additionalSheets,
          error: additionalError,
        } = await supabase
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
      additionalList.forEach((sheet) => {
        if (!primaryIdSet.has(sheet.id)) {
          sheetList.push(sheet);
        }
      });

      sheetList.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      const sheetIds = sheetList.map((sheet) => sheet.id);
      const extraCategoryMap = new Map<string, string[]>();

      if (sheetIds.length > 0) {
        const {
          data: extraCategories,
          error: extraError,
        } = await supabase
          .from('drum_sheet_categories')
          .select(`
            sheet_id,
            category:categories (
              name
            )
          `)
          .in('sheet_id', sheetIds);

        if (extraError) {
          console.error(t('freeSheets.console.extraCategoriesError'), extraError);
        } else {
          const typedExtraCategories = (extraCategories ?? []) as DrumSheetCategoryRow[];
          typedExtraCategories.forEach((relation) => {
            if (!relation?.sheet_id) {
              return;
            }

            const categoryName = relation.category?.name;
            if (!categoryName) {
              return;
            }

            const list = extraCategoryMap.get(relation.sheet_id) ?? [];
            list.push(categoryName);
            extraCategoryMap.set(relation.sheet_id, list);
          });
        }
      }

      const mappedSheets: FreeSheet[] = sheetList.map((sheet: SupabaseDrumSheetRow) => {
        const categorySet = new Set<string>();
        categorySet.add('드럼레슨');

        if (sheet.categories?.name) {
          categorySet.add(sheet.categories.name);
        }

        const extraCategories = extraCategoryMap.get(sheet.id) ?? [];
        extraCategories.forEach((name) => categorySet.add(name));

        const categories = Array.from(categorySet).sort((a, b) => {
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
          thumbnailUrl: buildThumbnailUrl(sheet, t),
          youtubeUrl: sheet.youtube_url,
          pdfUrl: sheet.pdf_url,
          pageCount: sheet.page_count,
          slug: sheet.slug,
          categories,
        };
      });

      setSheets(mappedSheets);
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
      const favorites = await fetchUserFavorites(user.id);
      setFavoriteIds(new Set(favorites.map((favorite) => favorite.sheet_id)));
    } catch (error) {
      console.error(t('freeSheets.console.favoritesLoadError'), error);
    }
  }, [user, t]);

  useEffect(() => {
    const init = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
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
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const handleToggleFavorite = async (sheetId: string) => {
    if (!user) {
      alert(t('freeSheets.errors.loginRequired'));
      return;
    }

    setFavoriteLoadingIds((prev) => {
      const next = new Set(prev);
      next.add(sheetId);
      return next;
    });

    try {
      const isFavoriteNow = await toggleFavorite(sheetId, user.id);

      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFavoriteNow) {
          next.add(sheetId);
        } else {
          next.delete(sheetId);
        }
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

  const handleMobileSheetSelect = useCallback((sheet: FreeSheet) => {
    setSelectedSheet(sheet);
    setIsMobileDetailOpen(true);
  }, []);

  const closeMobileDetail = useCallback(() => {
    setIsMobileDetailOpen(false);
    setSelectedSheet(null);
  }, []);

  const handleSheetLinkClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, sheet: FreeSheet) => {
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        event.preventDefault();
        handleMobileSheetSelect(sheet);
      }
    },
    [handleMobileSheetSelect],
  );

  const handleOpenPdf = useCallback((sheet: FreeSheet) => {
    if (!sheet.pdfUrl) {
      alert(t('freeSheets.errors.pdfNotReady'));
      return;
    }
    window.open(sheet.pdfUrl, '_blank', 'noopener,noreferrer');
  }, [t]);

  const handleOpenYoutube = useCallback((sheet: FreeSheet) => {
    if (!sheet.youtubeUrl) {
      alert(t('freeSheets.errors.youtubeNotAvailable'));
      return;
    }
    window.open(sheet.youtubeUrl, '_blank', 'noopener,noreferrer');
  }, [t]);

  const handleNavigateToDetail = useCallback(
    (sheet: FreeSheet) => {
      closeMobileDetail();
      router.push(`/drum-sheet/${sheet.slug}`);
    },
    [closeMobileDetail, router],
  );

  const filteredSheets = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    let result = sheets.filter((sheet) => {
      if (!term) {
        return true;
      }

      // 공백 무시 유연 검색 (Space-agnostic flexible search)
      const termNoSpaces = term.replace(/\s+/g, '');
      const termWords = term.split(/\s+/).filter((w) => w.length > 0);

      // 괄호와 그 내용을 제거 (예: "헤이즈 (Heize)" → "헤이즈")
      const stripParens = (s: string) => s.replace(/\([^)]*\)/g, '').replace(/\s+/g, '');

      const titleNoSpaces = (sheet.title || '').toLowerCase().replace(/\s+/g, '');
      const artistNoSpaces = (sheet.artist || '').toLowerCase().replace(/\s+/g, '');
      const categoriesStr = sheet.categories.join(' ').toLowerCase().replace(/\s+/g, '');
      const titleClean = stripParens((sheet.title || '').toLowerCase());
      const artistClean = stripParens((sheet.artist || '').toLowerCase());
      const combinedNoSpaces = artistNoSpaces + titleNoSpaces;
      const combinedClean = artistClean + titleClean;

      // (1) 공백 포함 원본 매칭
      const haystack = `${sheet.title} ${sheet.artist} ${sheet.categories.join(' ')}`.toLowerCase();
      if (haystack.includes(term)) return true;

      // (2) 공백 제거 후 매칭
      if (titleNoSpaces.includes(termNoSpaces)) return true;
      if (artistNoSpaces.includes(termNoSpaces)) return true;
      if (categoriesStr.includes(termNoSpaces)) return true;

      // (2-1) 괄호 제거 후 매칭
      if (titleClean.includes(termNoSpaces)) return true;
      if (artistClean.includes(termNoSpaces)) return true;

      // (3) 아티스트+제목 결합 매칭 (괄호 제거 버전 포함)
      if (combinedNoSpaces.includes(termNoSpaces)) return true;
      if (combinedClean.includes(termNoSpaces)) return true;

      // (4) 다중 단어 AND 매칭 (모든 단어가 각각 포함)
      if (termWords.length > 1) {
        return termWords.every((word) => {
          const wordNoSpaces = word.replace(/\s+/g, '');
          return (
            titleNoSpaces.includes(wordNoSpaces) ||
            artistNoSpaces.includes(wordNoSpaces) ||
            categoriesStr.includes(wordNoSpaces) ||
            artistClean.includes(wordNoSpaces) ||
            titleClean.includes(wordNoSpaces)
          );
        });
      }

      return false;
    });

    if (selectedCategory !== 'all') {
      result = result.filter((sheet) => sheet.categories.includes(selectedCategory));
    }

    switch (sortOption) {
      case 'title':
        result = [...result].sort((a, b) => a.title.localeCompare(b.title, 'ko'));
        break;
      case 'difficulty':
        result = [...result].sort((a, b) => {
          const aOrder = DIFFICULTY_ORDER[normalizeDifficultyKey(a.difficulty)] ?? DIFFICULTY_ORDER.unknown;
          const bOrder = DIFFICULTY_ORDER[normalizeDifficultyKey(b.difficulty)] ?? DIFFICULTY_ORDER.unknown;
          return aOrder - bOrder;
        });
        break;
      case 'latest':
      default: {
        result = [...result].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        break;
      }
    }

    return result;
  }, [searchTerm, selectedCategory, sortOption, sheets]);

  return (
    <div className="min-h-screen bg-gray-50">
      <MainHeader />

      <section className="bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1 text-sm font-semibold tracking-wide text-white">
            {t('freeSheets.badge')}
          </span>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
            {t('freeSheets.title')}
          </h1>
          <p className="max-w-3xl text-sm text-blue-100 sm:text-base md:text-lg">
            {t('freeSheets.description')}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-sm text-blue-100">
            <span className="rounded-full border border-white/40 px-3 py-1">{t('freeSheets.features.freeDownload')}</span>
            <span className="rounded-full border border-white/40 px-3 py-1">{t('freeSheets.features.categoryLearning')}</span>
            <span className="rounded-full border border-white/40 px-3 py-1">{t('freeSheets.features.youtubeLesson')}</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6">
          <div className="-mx-4 overflow-x-auto px-4">
            <div className="flex w-max gap-3">
              {getSubCategoryOptions(t).map((option) => {
                const isActive = selectedCategory === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setSelectedCategory(option.key)}
                    className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition ${
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

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:w-72">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={t('freeSheets.search.placeholder')}
                className="w-full rounded-full border border-gray-200 bg-white py-3 pl-11 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-600" htmlFor="free-sheet-sort">
                {t('freeSheets.sort.label')}
              </label>
              <select
                id="free-sheet-sort"
                value={sortOption}
                onChange={(event) => setSortOption(event.target.value as typeof sortOption)}
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="latest">{t('freeSheets.sort.latest')}</option>
                <option value="title">{t('freeSheets.sort.title')}</option>
                <option value="difficulty">{t('freeSheets.sort.difficulty')}</option>
              </select>
            </div>
          </div>

          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {errorMessage}
            </div>
          )}

          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="flex items-center gap-3 text-blue-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm font-medium">{t('freeSheets.loading')}</span>
              </div>
            </div>
          ) : filteredSheets.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-center text-gray-500">
              <span className="text-lg font-semibold text-gray-600">{t('freeSheets.empty.title')}</span>
              <p className="text-sm text-gray-500">
                {t('freeSheets.empty.description')}
              </p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredSheets.map((sheet) => {
                const isFavorite = favoriteIds.has(sheet.id);
                const isFavoriteLoading = favoriteLoadingIds.has(sheet.id);
                const displayCategories = sheet.categories.filter((name) => name !== '드럼레슨');

                return (
                  <div
                    key={sheet.id}
                    className="group relative flex flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                  >
                    <Link
                      href={`/drum-sheet/${sheet.slug}`}
                      className="relative block"
                      onClick={(event) => handleSheetLinkClick(event, sheet)}
                    >
                      <div
                        className="aspect-video w-full bg-gray-200 transition duration-300 group-hover:brightness-110"
                        style={{
                          backgroundImage: `url(${sheet.thumbnailUrl})`,
                          backgroundPosition: 'center',
                          backgroundSize: 'cover',
                        }}
                      />

                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent opacity-0 transition group-hover:opacity-100" />

                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-blue-600 shadow-lg">
                          <Play className="ml-1 h-7 w-7" />
                        </div>
                      </div>
                    </Link>

                    <span className="absolute left-4 top-4 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                      FREE
                    </span>

                    <button
                      type="button"
                      onClick={() => handleToggleFavorite(sheet.id)}
                      className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-blue-600 shadow transition hover:bg-white"
                      disabled={isFavoriteLoading}
                    >
                      {isFavoriteLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Heart
                          className="h-5 w-5"
                          fill={isFavorite ? 'currentColor' : 'none'}
                          strokeWidth={isFavorite ? 0 : 2}
                        />
                      )}
                    </button>

                    <div className="flex flex-1 flex-col gap-4 p-5">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between text-xs font-medium text-gray-400">
                          <span>{formatRelativeDate(sheet.createdAt)}</span>
                          {sheet.pageCount ? <span>{sheet.pageCount}p</span> : null}
                        </div>
                        <Link
                          href={`/drum-sheet/${sheet.slug}`}
                          className="text-lg font-semibold leading-tight text-gray-900 transition hover:text-blue-600"
                        >
                          {sheet.title}
                        </Link>
                        <span className="text-sm font-medium text-blue-600">{sheet.artist}</span>
                      </div>

                      <div className="mt-auto flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
                          {getDifficultyLabel(sheet.difficulty, t)}
                        </span>

                        {displayCategories.length > 0 ? (
                          displayCategories.map((category) => (
                            <span
                              key={category}
                              className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600"
                            >
                              {getCategoryName(category)}
                            </span>
                          ))
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
                            {getCategoryName('카테고리 준비 중')}
                          </span>
                        )}
                      </div>

                      <Link
                        href={`/drum-sheet/${sheet.slug}`}
                        className="mt-4 inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                        onClick={(event) => handleSheetLinkClick(event, sheet)}
                      >
                        {t('freeSheets.actions.viewFreeSheet')}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {selectedSheet && isMobileDetailOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm md:hidden">
          <div className="w-full max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-blue-600">{t('freeSheets.mobile.freeSheet')}</p>
                <h2 className="text-lg font-bold text-gray-900">{selectedSheet.title}</h2>
                <p className="text-sm text-gray-500">{selectedSheet.artist}</p>
              </div>
              <button
                type="button"
                onClick={closeMobileDetail}
                aria-label={t('freeSheets.actions.closeDetail')}
                className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <i className="ri-close-line text-2xl" />
              </button>
            </div>

            <div className="space-y-5">
              <div className="overflow-hidden rounded-2xl border border-gray-100">
                <img
                  src={selectedSheet.thumbnailUrl}
                  alt={selectedSheet.title}
                  className="w-full object-cover"
                  onError={(event) => {
                    const img = event.target as HTMLImageElement;
                    img.src = generateDefaultThumbnail(640, 480);
                  }}
                />
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                    {getDifficultyLabel(selectedSheet.difficulty, t)}
                  </span>
                  {selectedSheet.categories.map((category) => (
                    <span
                      key={category}
                      className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-600"
                    >
                      {category}
                    </span>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span>{t('freeSheets.mobile.upload')} {formatRelativeDate(selectedSheet.createdAt)}</span>
                  {selectedSheet.pageCount ? <span>{selectedSheet.pageCount} {t('freeSheets.mobile.pages')}</span> : null}
                  {selectedSheet.youtubeUrl ? <span>{t('freeSheets.mobile.youtubeLessonIncluded')}</span> : null}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-gray-100 px-4 py-3">
                <div className="text-sm text-gray-500">
                  <p className="font-semibold text-gray-900">{t('freeSheets.mobile.freeDownload')}</p>
                  <p>{t('freeSheets.mobile.practiceWithPdf')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleFavorite(selectedSheet.id)}
                  disabled={favoriteLoadingIds.has(selectedSheet.id)}
                  className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${
                    favoriteIds.has(selectedSheet.id)
                      ? 'border-red-200 bg-red-50 text-red-500'
                      : 'border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500'
                  } ${favoriteLoadingIds.has(selectedSheet.id) ? 'opacity-60 cursor-not-allowed' : ''}`}
                  aria-label={favoriteIds.has(selectedSheet.id) ? t('freeSheets.mobile.unfavorite') : t('freeSheets.mobile.favorite')}
                >
                  <i className={`ri-heart-${favoriteIds.has(selectedSheet.id) ? 'fill' : 'line'} text-xl`} />
                </button>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => handleOpenPdf(selectedSheet)}
                  className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow transition hover:bg-blue-700"
                >
                  {t('freeSheets.actions.viewFreeSheet')}
                </button>
                {selectedSheet.youtubeUrl ? (
                  <button
                    type="button"
                    onClick={() => handleOpenYoutube(selectedSheet)}
                    className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-500 transition hover:bg-red-100"
                  >
                    {t('freeSheets.actions.viewYoutubeLesson')}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => handleNavigateToDetail(selectedSheet)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  {t('freeSheets.actions.goToDetail')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FreeSheetsPage;
 