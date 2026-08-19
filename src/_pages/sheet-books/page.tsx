'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Loader2, Search, ChevronLeft, ChevronRight, ShoppingCart, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import MainHeader from '../../components/common/MainHeader';
import Footer from '../../components/common/Footer';
import Seo from '../../components/Seo';
import { supabase } from '../../lib/supabase';
import { generateDefaultThumbnail } from '../../lib/defaultThumbnail';
import { fetchUserFavorites, toggleFavorite } from '../../lib/favorites';
import { languageDomainMap } from '../../config/languageDomainMap';
import { useCart } from '../../hooks/useCart';
import { hasPurchasedSheet } from '../../lib/purchaseCheck';
import { getSiteCurrency, convertFromKrw, formatCurrency as formatCurrencyUtil } from '../../lib/currency';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import {
  SHEET_BOOK_GENRE_I18N_KEYS,
  SHEET_BOOK_GENRE_NAMES,
  SHEET_BOOK_MAIN_CATEGORY_NAME,
} from '@/lib/sheetBookCategories';

const SHEET_SELECT_FIELDS = `
  id, title, title_translations, artist, difficulty, created_at,
  thumbnail_url, pdf_url, page_count, slug, price, sales_type, youtube_url
`;

const ITEMS_PER_PAGE = 12;

interface SheetBookRow {
  id: string;
  title: string;
  title_translations?: Record<string, string> | null;
  artist: string;
  created_at: string;
  thumbnail_url: string | null;
  page_count: number | null;
  slug: string;
  price: number | null;
}

interface SheetBookItem {
  id: string;
  title: string;
  titleTranslations?: Record<string, string> | null;
  artist: string;
  createdAt: string;
  thumbnailUrl: string;
  pageCount: number | null;
  slug: string;
  price: number;
  genres: string[];
}

const GENRE_TABS = SHEET_BOOK_GENRE_NAMES.map((name) => ({
  name,
  i18nKey: SHEET_BOOK_GENRE_I18N_KEYS[name],
}));

export default function SheetBooksPage() {
  const { t, i18n } = useTranslation();
  const router = useLocaleRouter();
  const contentRef = useRef<HTMLElement>(null);

  const [user, setUser] = useState<User | null>(null);
  const [books, setBooks] = useState<SheetBookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState<'latest' | 'title' | 'priceLow' | 'priceHigh'>('latest');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoriteLoadingIds, setFavoriteLoadingIds] = useState<Set<string>>(new Set());

  const { addToCart, isInCart } = useCart();

  const getDisplayTitle = useCallback(
    (book: SheetBookItem) => {
      if (i18n.language === 'ko') return book.title;
      return book.titleTranslations?.en?.trim() || book.title;
    },
    [i18n.language],
  );

  const getGenreLabel = useCallback(
    (genreName: string) => {
      if (i18n.language === 'ko') return genreName;
      const key = SHEET_BOOK_GENRE_I18N_KEYS[genreName as keyof typeof SHEET_BOOK_GENRE_I18N_KEYS];
      return key ? t(`categoriesPage.categories.${key}`) : genreName;
    },
    [i18n.language, t],
  );

  const formatPrice = useCallback(
    (price: number) => {
      if (!price || price <= 0) return t('sheetBooks.price.free');
      const hostname = typeof window !== 'undefined' ? window.location.hostname : undefined;
      const currency = getSiteCurrency(hostname, i18n.language);
      const converted = convertFromKrw(price, currency, i18n.language);
      return formatCurrencyUtil(converted, currency);
    },
    [i18n.language, t],
  );

  const loadBooks = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const { data: mainCategory, error: catError } = await supabase
        .from('categories')
        .select('id')
        .eq('name', SHEET_BOOK_MAIN_CATEGORY_NAME)
        .maybeSingle();

      if (catError) {
        setErrorMessage(t('sheetBooks.errors.categoryLoadError'));
        setBooks([]);
        return;
      }
      if (!mainCategory) {
        setErrorMessage(t('sheetBooks.errors.categoryNotFound'));
        setBooks([]);
        return;
      }

      const { data: sheets, error: sheetsError } = await supabase
        .from('drum_sheets')
        .select(SHEET_SELECT_FIELDS)
        .eq('category_id', mainCategory.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (sheetsError) {
        setErrorMessage(t('sheetBooks.errors.sheetsLoadError'));
        setBooks([]);
        return;
      }

      const rows = (sheets ?? []) as SheetBookRow[];
      const ids = rows.map((r) => r.id);
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

      setBooks(
        rows.map((sheet) => ({
          id: sheet.id,
          title: sheet.title,
          titleTranslations: sheet.title_translations ?? null,
          artist: sheet.artist,
          createdAt: sheet.created_at,
          thumbnailUrl: sheet.thumbnail_url || generateDefaultThumbnail(800, 1067),
          pageCount: sheet.page_count,
          slug: sheet.slug,
          price: Math.max(0, sheet.price ?? 0),
          genres: genreMap.get(sheet.id) ?? [],
        })),
      );
    } catch {
      setErrorMessage(t('sheetBooks.errors.generalError'));
      setBooks([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  useEffect(() => {
    const initAuth = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      setUser(currentUser);
      if (currentUser) {
        const favs = await fetchUserFavorites(currentUser.id);
        setFavoriteIds(new Set(favs));
      }
    };
    void initAuth();
  }, []);

  const availableGenres = useMemo(
    () => GENRE_TABS.filter((g) => books.some((b) => b.genres.includes(g.name))),
    [books],
  );

  const filteredBooks = useMemo(() => {
    let result = [...books];
    const keyword = searchTerm.trim().toLowerCase();
    if (keyword) {
      result = result.filter((b) => {
        const en = b.titleTranslations?.en?.toLowerCase() ?? '';
        return (
          b.title.toLowerCase().includes(keyword) ||
          en.includes(keyword) ||
          b.artist.toLowerCase().includes(keyword)
        );
      });
    }
    if (selectedGenre) {
      result = result.filter((b) => b.genres.includes(selectedGenre));
    }
    switch (sortOption) {
      case 'title':
        result.sort((a, b) => getDisplayTitle(a).localeCompare(getDisplayTitle(b)));
        break;
      case 'priceLow':
        result.sort((a, b) => a.price - b.price);
        break;
      case 'priceHigh':
        result.sort((a, b) => b.price - a.price);
        break;
      default:
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return result;
  }, [books, searchTerm, selectedGenre, sortOption, getDisplayTitle]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortOption, selectedGenre]);

  const totalPages = Math.max(1, Math.ceil(filteredBooks.length / ITEMS_PER_PAGE));
  const paginatedBooks = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredBooks.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredBooks, currentPage]);

  const handleToggleFavorite = async (sheetId: string) => {
    if (!user) {
      router.push('/auth/login');
      return;
    }
    setFavoriteLoadingIds((prev) => new Set(prev).add(sheetId));
    try {
      const nowFav = await toggleFavorite(user.id, sheetId);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (nowFav) next.add(sheetId);
        else next.delete(sheetId);
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

  const handleAddToCart = async (book: SheetBookItem) => {
    if (user) {
      try {
        if (await hasPurchasedSheet(user.id, book.id)) {
          alert(t('sheetDetail.alreadyPurchased'));
          return;
        }
      } catch {
        /* ignore */
      }
    }
    await addToCart(book.id);
  };

  const baseUrl =
    languageDomainMap[i18n.language as keyof typeof languageDomainMap] ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  return (
    <div className="min-h-screen bg-gray-50">
      <Seo
        title={`${t('sheetBooks.title')} | COPYDRUM`}
        description={t('sheetBooks.description')}
        canonicalUrl={baseUrl ? `${baseUrl}/sheet-books` : '/sheet-books'}
        locale={i18n.language}
      />
      <MainHeader user={user} />

      <section className="relative bg-gradient-to-br from-indigo-700 via-violet-700 to-purple-800 text-white overflow-hidden">
        <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:py-16">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold border border-white/25">
            <i className="ri-book-mark-line" />
            {t('sheetBooks.badge')}
          </span>
          <h1 className="mt-4 text-3xl font-bold sm:text-4xl">{t('sheetBooks.title')}</h1>
          <p className="mt-3 max-w-2xl text-indigo-100">{t('sheetBooks.description')}</p>
        </div>
      </section>

      <section ref={contentRef} className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('sheetBooks.search.placeholder')}
                className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-11 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-500" htmlFor="sheet-book-sort">
                {t('sheetBooks.sort.label')}
              </label>
              <select
                id="sheet-book-sort"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as typeof sortOption)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm"
              >
                <option value="latest">{t('sheetBooks.sort.latest')}</option>
                <option value="title">{t('sheetBooks.sort.title')}</option>
                <option value="priceLow">{t('sheetBooks.sort.priceLow')}</option>
                <option value="priceHigh">{t('sheetBooks.sort.priceHigh')}</option>
              </select>
            </div>
          </div>

          {availableGenres.length > 0 && (
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0">
              <div className="flex gap-2 pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedGenre('')}
                  className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap ${
                    selectedGenre === '' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-700'
                  }`}
                >
                  {t('sheetBooks.genres.all')}
                </button>
                {availableGenres.map((genre) => (
                  <button
                    key={genre.name}
                    type="button"
                    onClick={() => setSelectedGenre(genre.name)}
                    className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap ${
                      selectedGenre === genre.name
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white border border-gray-200 text-gray-700'
                    }`}
                  >
                    {getGenreLabel(genre.name)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loading && (
            <p className="text-sm text-gray-500">{t('sheetBooks.results', { count: filteredBooks.length })}</p>
          )}

          {errorMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{errorMessage}</div>
          )}

          {loading ? (
            <div className="flex h-64 items-center justify-center text-indigo-600 gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>{t('sheetBooks.loading')}</span>
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center text-gray-500 gap-2">
              <i className="ri-book-mark-line text-5xl text-gray-300" />
              <p className="font-semibold text-gray-600">{t('sheetBooks.empty.title')}</p>
              <p className="text-sm">{t('sheetBooks.empty.description')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
              {paginatedBooks.map((book) => {
                const isFav = favoriteIds.has(book.id);
                const isFavLoading = favoriteLoadingIds.has(book.id);
                const inCart = isInCart(book.id);
                const primaryGenre = book.genres[0];

                return (
                  <div
                    key={book.id}
                    className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-lg transition-shadow"
                  >
                    <button
                      type="button"
                      onClick={() => router.push(`/drum-sheet/${book.slug}`)}
                      className="relative aspect-[3/4] w-full overflow-hidden bg-indigo-50"
                    >
                      <img
                        src={book.thumbnailUrl}
                        alt={getDisplayTitle(book)}
                        loading="lazy"
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      {book.pageCount ? (
                        <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                          {book.pageCount}p
                        </span>
                      ) : null}
                      <span className="absolute left-3 top-3 rounded-md bg-white/95 px-2 py-0.5 text-[10px] font-bold text-indigo-700">PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleFavorite(book.id)}
                      disabled={isFavLoading}
                      className={`absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full shadow ${
                        isFav ? 'bg-red-50 text-red-500' : 'bg-white/95 text-gray-500'
                      }`}
                    >
                      {isFavLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <i className={`ri-heart-${isFav ? 'fill' : 'line'}`} />}
                    </button>

                    <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
                      {primaryGenre ? (
                        <span className="inline-flex w-fit rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                          {getGenreLabel(primaryGenre)}
                        </span>
                      ) : null}
                      <button type="button" onClick={() => router.push(`/drum-sheet/${book.slug}`)} className="text-left">
                        <h3 className="text-sm font-bold text-gray-900 line-clamp-2">{getDisplayTitle(book)}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{book.artist}</p>
                      </button>
                      <p className="text-base sm:text-lg font-extrabold text-gray-900">{formatPrice(book.price)}</p>
                      <div className="mt-auto flex flex-col gap-2 pt-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => handleAddToCart(book)}
                          disabled={inCart}
                          className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 disabled:opacity-50"
                        >
                          <ShoppingCart className="h-4 w-4" />
                          {t('sheetBooks.actions.addToCart')}
                        </button>
                        <button
                          type="button"
                          onClick={() => router.push(`/drum-sheet/${book.slug}`)}
                          className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"
                        >
                          <Zap className="h-4 w-4" />
                          {t('sheetBooks.actions.buyNow')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg border disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-gray-600">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg border disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
