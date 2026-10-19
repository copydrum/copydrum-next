'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'next/navigation';
import MainHeader from '../../components/common/MainHeader';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { useMyBookStore } from '../../stores/myBookStore';
import { useDialogStore } from '../../stores/dialogStore';
import { useLocaleRouter } from '../../hooks/useLocaleRouter';
import { useHydrated } from '../../hooks/useHydrated';
import { fetchPurchasedSheetIds } from '../../lib/purchaseCheck';
import { isMyBookVisible } from '../../config/featureFlags';
import {
  calculateMyBookPrice,
  getCoverExtension,
  MY_BOOK_COVER_MAX_BYTES,
  MY_BOOK_DISCOUNT_TIERS,
  MY_BOOK_MAX_DISCOUNT_PERCENT,
  MY_BOOK_MAX_SONGS,
  MY_BOOK_MEMO_MAX_LENGTH,
  MY_BOOK_MIN_SONGS,
  MY_BOOK_TITLE_MAX_LENGTH,
} from '../../lib/myBook/pricing';
import {
  getMyBookIneligibleReason,
  MY_BOOK_SHEET_COLUMNS,
  type MyBookSheetRow,
} from '../../lib/myBook/catalog';
import MyBookCoverPreview from '../../components/myBook/MyBookCoverPreview';
import {
  DEFAULT_MY_BOOK_COVER_THEME,
  getCoverThemeGradientCss,
  MY_BOOK_COVER_THEMES,
} from '../../lib/myBook/coverThemes';

const formatWon = (value: number) => `${value.toLocaleString('ko-KR')}원`;

const HERO_FEATURES = [
  { key: 'instant', icon: 'ri-flashlight-fill' },
  { key: 'discount', icon: 'ri-percent-line' },
  { key: 'owned', icon: 'ri-gift-line' },
  { key: 'toc', icon: 'ri-list-ordered' },
] as const;

const STEPS = [
  { key: 'pick', icon: 'ri-music-2-line' },
  { key: 'design', icon: 'ri-palette-line' },
  { key: 'download', icon: 'ri-download-cloud-2-line' },
] as const;

// PostgREST or() 필터 구분자로 쓰이는 문자 제거
const sanitizeSearch = (value: string) => value.replace(/[,()%*\\]/g, ' ').trim();

const MyBookPage = () => {
  const { t, i18n } = useTranslation();
  const params = useParams();
  const locale = (params?.locale as string) || i18n.language || 'ko';
  const router = useLocaleRouter();
  const { user } = useAuthStore();
  const { showAlert, showConfirm } = useDialogStore();

  const ids = useMyBookStore((s) => s.ids);
  const addSheet = useMyBookStore((s) => s.add);
  const removeSheet = useMyBookStore((s) => s.remove);
  const moveSheet = useMyBookStore((s) => s.move);
  const clearSheets = useMyBookStore((s) => s.clear);

  const hydrated = useHydrated();
  const [sheetsById, setSheetsById] = useState<Map<string, MyBookSheetRow>>(new Map());
  const [lookedUpIds, setLookedUpIds] = useState<Set<string>>(new Set());
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [loadingSheets, setLoadingSheets] = useState(false);

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MyBookSheetRow[]>([]);
  const [searching, setSearching] = useState(false);

  const [bookTitle, setBookTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverTheme, setCoverTheme] = useState(DEFAULT_MY_BOOK_COVER_THEME.id);
  const [agreed, setAgreed] = useState(false);
  const [submitState, setSubmitState] = useState<'idle' | 'uploading' | 'submitting'>('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const visible = isMyBookVisible(locale);

  useEffect(() => {
    if (hydrated && !visible) {
      router.replace('/');
    }
  }, [hydrated, visible, router]);

  // 담긴 곡 상세 정보 로드 (가격은 항상 DB 기준)
  useEffect(() => {
    if (!hydrated) return;
    const missing = ids.filter((id) => !sheetsById.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    setLoadingSheets(true);
    (async () => {
      const { data, error } = await supabase
        .from('drum_sheets')
        .select(MY_BOOK_SHEET_COLUMNS)
        .in('id', missing);
      if (cancelled) return;
      if (error) {
        console.error('[my-book] 곡 정보 로드 실패:', error);
      } else {
        setSheetsById((prev) => {
          const next = new Map(prev);
          ((data ?? []) as unknown as MyBookSheetRow[]).forEach((row) => next.set(row.id, row));
          return next;
        });
        setLookedUpIds((prev) => new Set([...prev, ...missing]));
      }
      setLoadingSheets(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, ids, sheetsById]);

  // 이미 구매한 곡 (로그인 사용자)
  useEffect(() => {
    if (!user || ids.length === 0) {
      setOwnedIds(new Set());
      return;
    }
    let cancelled = false;
    fetchPurchasedSheetIds(user.id, ids)
      .then((purchased) => {
        if (!cancelled) setOwnedIds(new Set(purchased));
      })
      .catch((error) => console.warn('[my-book] 구매 내역 확인 실패:', error));
    return () => {
      cancelled = true;
    };
  }, [user, ids]);

  // 검색 (300ms 디바운스)
  useEffect(() => {
    const keyword = sanitizeSearch(query);
    if (keyword.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('drum_sheets')
        .select(MY_BOOK_SHEET_COLUMNS)
        .eq('is_active', true)
        .gt('price', 0)
        .or(`title.ilike.%${keyword}%,artist.ilike.%${keyword}%`)
        .order('title', { ascending: true })
        .limit(40);
      if (cancelled) return;
      if (error) {
        console.error('[my-book] 검색 실패:', error);
        setSearchResults([]);
      } else {
        setSearchResults(
          ((data ?? []) as unknown as MyBookSheetRow[]).filter(
            (row) => getMyBookIneligibleReason(row) === null
          )
        );
      }
      setSearching(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const items = useMemo(
    () =>
      ids.map((id) => {
        const sheet = sheetsById.get(id) ?? null;
        return {
          id,
          sheet,
          owned: ownedIds.has(id),
          unavailable: sheet ? getMyBookIneligibleReason(sheet) !== null : lookedUpIds.has(id),
        };
      }),
    [ids, sheetsById, ownedIds, lookedUpIds]
  );

  const unavailableIds = items.filter((item) => item.unavailable).map((item) => item.id);
  const detailsPending = items.some((item) => !item.sheet && !item.unavailable);

  const price = useMemo(
    () =>
      calculateMyBookPrice(
        items
          .filter((item) => item.sheet && !item.unavailable)
          .map((item) => ({ listPrice: item.sheet!.price ?? 0, isOwned: item.owned }))
      ),
    [items]
  );

  const handleAdd = useCallback(
    async (sheet: MyBookSheetRow) => {
      if (ids.length >= MY_BOOK_MAX_SONGS) {
        await showAlert(t('myBook.search.full', { max: MY_BOOK_MAX_SONGS }));
        return;
      }
      setSheetsById((prev) => new Map(prev).set(sheet.id, sheet));
      addSheet(sheet.id);
    },
    [ids.length, addSheet, showAlert, t]
  );

  const handleClear = async () => {
    if (await showConfirm(t('myBook.list.clearConfirm'))) {
      clearSheets();
    }
  };

  const handleCoverChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    if (!getCoverExtension(file.name)) {
      await showAlert(t('myBook.errors.coverType'));
      return;
    }
    if (file.size > MY_BOOK_COVER_MAX_BYTES) {
      await showAlert(t('myBook.errors.coverSize'));
      return;
    }
    setCoverFile(file);
  };

  const loginHref = `/auth/login?redirect=${encodeURIComponent(`/${locale}/my-book`)}`;

  const canSubmit =
    price.meetsMinimum &&
    !price.exceedsMaximum &&
    unavailableIds.length === 0 &&
    !detailsPending &&
    !loadingSheets &&
    submitState === 'idle';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!user) {
      router.push(loginHref);
      return;
    }
    if (!bookTitle.trim()) {
      setFormError(t('myBook.errors.titleRequired'));
      return;
    }
    if (!agreed) {
      setFormError(t('myBook.errors.agreeRequired'));
      return;
    }
    if (!canSubmit) return;

    try {
      let coverPath: string | null = null;
      if (coverFile) {
        setSubmitState('uploading');
        const urlRes = await fetch('/api/my-book/cover-upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: coverFile.name, fileSize: coverFile.size }),
        });
        const urlJson = await urlRes.json();
        if (!urlJson.success) {
          throw new Error(urlJson.error || t('myBook.errors.coverUpload'));
        }
        const { error: uploadError } = await supabase.storage
          .from('custom-orders')
          .uploadToSignedUrl(urlJson.path, urlJson.token, coverFile, {
            contentType: coverFile.type || undefined,
          });
        if (uploadError) {
          console.error('[my-book] 표지 업로드 실패:', uploadError);
          throw new Error(t('myBook.errors.coverUpload'));
        }
        coverPath = urlJson.path;
      }

      setSubmitState('submitting');
      const res = await fetch('/api/my-book/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetIds: ids,
          title: bookTitle.trim(),
          memo: memo.trim(),
          coverPath,
          coverFileName: coverFile?.name ?? null,
          coverTheme: coverFile ? null : coverTheme,
          agreed,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(
          Array.isArray(json.unavailableSheetIds) && json.unavailableSheetIds.length > 0
            ? t('myBook.errors.unavailable')
            : json.error || t('myBook.errors.submit')
        );
      }

      clearSheets();
      router.push(`/custom-order-detail/${json.orderId}`);
    } catch (error) {
      console.error('[my-book] 신청 실패:', error);
      setFormError(error instanceof Error ? error.message : t('myBook.errors.submit'));
      setSubmitState('idle');
    }
  };

  const summaryMessage = (() => {
    if (detailsPending) return t('myBook.list.loading');
    if (price.exceedsMaximum) return t('myBook.summary.tooMany', { max: MY_BOOK_MAX_SONGS });
    if (!price.meetsMinimum) {
      return t('myBook.summary.needMore', {
        count: MY_BOOK_MIN_SONGS - price.songCount,
        min: MY_BOOK_MIN_SONGS,
      });
    }
    if (price.nextTier) {
      return t('myBook.summary.nextTier', {
        count: price.nextTier.songsNeeded,
        percent: price.nextTier.percent,
      });
    }
    return t('myBook.summary.maxTier');
  })();

  const saving = price.meetsMinimum ? Math.max(0, price.payableListTotal - price.finalPrice) : 0;
  const perSong =
    price.meetsMinimum && price.songCount > 0 ? Math.round(price.finalPrice / price.songCount / 10) * 10 : 0;
  const progressMax = MY_BOOK_DISCOUNT_TIERS[0].minSongs;
  const progressPercent = Math.min(100, (price.songCount / progressMax) * 100);

  if (!hydrated || !visible) {
    return (
      <div className="min-h-screen bg-white">
        <MainHeader user={user} />
      </div>
    );
  }

  const noticeKeys = ['toc', 'cover', 'copyright', 'schedule', 'grant', 'personal', 'refund'];

  return (
    <div className="min-h-screen bg-gray-50 pb-24 lg:pb-0">
      <MainHeader user={user} />

      <main className="max-w-6xl mx-auto px-4 py-8 md:py-12">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-fuchsia-600 px-5 py-8 text-white md:px-10 md:py-12">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-24 right-40 h-56 w-56 rounded-full border border-white/20" />
          <div className="relative flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
                <i className="ri-flashlight-fill text-amber-300" />
                {t('myBook.hero.eyebrow')}
              </span>
              <h1 className="mt-3 whitespace-pre-line break-keep text-2xl font-bold leading-tight md:text-4xl">
                {t('myBook.hero.title')}
              </h1>
              <p className="mt-3 break-keep text-sm text-indigo-100 md:text-lg">{t('myBook.hero.description')}</p>
              <p className="mt-4 inline-block rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-indigo-700 md:text-base">
                {t('myBook.hero.highlight', { percent: MY_BOOK_MAX_DISCOUNT_PERCENT })}
              </p>
            </div>
            <div className="hidden shrink-0 md:block">
              <div className="relative h-56 w-48">
                <div className="absolute left-10 top-4 h-48 w-[136px] rotate-6 rounded-md bg-white p-3 shadow-xl">
                  <p className="text-[10px] font-extrabold text-gray-900">목차</p>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <div key={n} className="mt-2 flex items-center gap-1">
                      <span className="text-[8px] font-bold text-indigo-500">{String(n).padStart(2, '0')}</span>
                      <span className="h-1.5 flex-1 rounded bg-gray-200" />
                      <span className="text-[8px] text-gray-400">{n * 3 + 1}</span>
                    </div>
                  ))}
                </div>
                <MyBookCoverPreview
                  title={bookTitle || t('myBook.form.bookTitlePlaceholder').replace(/^예\)\s*/, '')}
                  songCount={Math.max(ids.length, MY_BOOK_MIN_SONGS)}
                  themeId={coverTheme}
                  className="absolute left-0 top-0 -rotate-3"
                />
              </div>
            </div>
          </div>
          <ul className="relative mt-6 grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
            {HERO_FEATURES.map(({ key, icon }) => (
              <li key={key} className="break-keep rounded-xl bg-white/15 px-3 py-3 backdrop-blur-sm">
                <p className="flex items-start gap-1.5 text-[13px] font-bold leading-snug md:text-sm">
                  <i className={`${icon} text-base text-amber-300`} />
                  {t(`myBook.hero.features.${key}.title`)}
                </p>
                <p className="mt-0.5 text-xs text-indigo-100">
                  {t(`myBook.hero.features.${key}.desc`, { percent: MY_BOOK_MAX_DISCOUNT_PERCENT })}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* 진행 순서 */}
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 md:p-6">
          <h2 className="text-lg font-bold text-gray-900">{t('myBook.steps.title')}</h2>
          <ol className="mt-4 grid gap-3 md:grid-cols-3">
            {STEPS.map(({ key, icon }, index) => (
              <li key={key} className="flex gap-3 rounded-xl bg-gray-50 px-4 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-lg text-white">
                  <i className={icon} />
                </span>
                <div>
                  <p className="text-sm font-bold text-gray-900">
                    <span className="mr-1 text-indigo-600">{index + 1}.</span>
                    {t(`myBook.steps.items.${key}.title`)}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{t(`myBook.steps.items.${key}.desc`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* 할인 구간 */}
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 md:p-6">
          <h2 className="text-lg font-bold text-gray-900">{t('myBook.tiers.title')}</h2>
          <p className="mt-0.5 text-sm text-gray-500">{t('myBook.tiers.subtitle')}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[...MY_BOOK_DISCOUNT_TIERS].reverse().map((tier) => {
              const active = price.discountPercent === tier.percent && price.meetsMinimum;
              return (
                <div
                  key={tier.minSongs}
                  className={`relative rounded-xl border px-4 py-3 text-center transition-colors ${
                    active ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  {active && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                      {t('myBook.tiers.current')}
                    </span>
                  )}
                  <p className="text-sm text-gray-600">{t('myBook.tiers.row', { minSongs: tier.minSongs })}</p>
                  <p className={`mt-1 text-xl font-extrabold ${active ? 'text-indigo-700' : 'text-gray-900'}`}>
                    {t('myBook.tiers.discount', { percent: tier.percent })}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            {t('myBook.tiers.note', { min: MY_BOOK_MIN_SONGS, max: MY_BOOK_MAX_SONGS })}
          </p>
        </section>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex flex-col gap-6">
            {/* 검색 */}
            <section className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6">
              <h2 className="text-lg font-bold text-gray-900">{t('myBook.search.title')}</h2>
              <div className="relative mt-3">
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('myBook.search.placeholder')}
                  className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-4 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {sanitizeSearch(query).length < 2 ? (
                <p className="mt-2 text-xs text-gray-500">{t('myBook.search.hint')}</p>
              ) : searching ? (
                <p className="mt-3 text-sm text-gray-500">{t('myBook.search.searching')}</p>
              ) : searchResults.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">{t('myBook.search.noResults')}</p>
              ) : (
                <ul className="mt-3 max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-100">
                  {searchResults.map((sheet) => {
                    const added = ids.includes(sheet.id);
                    return (
                      <li key={sheet.id} className="flex items-center gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">{sheet.title}</p>
                          <p className="truncate text-xs text-gray-500">
                            {sheet.artist} · {formatWon(sheet.price ?? 0)}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={added}
                          onClick={() => handleAdd(sheet)}
                          className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold ${
                            added
                              ? 'bg-gray-100 text-gray-400'
                              : 'bg-indigo-600 text-white hover:bg-indigo-700'
                          }`}
                        >
                          {added ? t('myBook.search.added') : t('myBook.search.add')}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* 담은 곡 */}
            <section className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  {t('myBook.list.title')}{' '}
                  <span className="text-indigo-600">{t('myBook.list.count', { count: ids.length })}</span>
                </h2>
                {ids.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-xs text-gray-500 underline hover:text-gray-700"
                  >
                    {t('myBook.list.clear')}
                  </button>
                )}
              </div>

              {ids.length === 0 ? (
                <p className="mt-4 rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
                  {t('myBook.list.empty')}
                </p>
              ) : (
                <>
                  {unavailableIds.length > 0 && (
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                      <span>{t('myBook.errors.unavailable')}</span>
                      <button
                        type="button"
                        onClick={() => unavailableIds.forEach((id) => removeSheet(id))}
                        className="shrink-0 font-semibold underline"
                      >
                        {t('myBook.list.removeUnavailable')}
                      </button>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-gray-500">
                    <i className="ri-list-ordered mr-1" />
                    {t('myBook.list.orderHint')}
                  </p>
                  <ol className="mt-2 divide-y divide-gray-100">
                    {items.map((item, index) => (
                      <li key={item.id} className="flex items-center gap-2 py-2.5 md:gap-3">
                        <span className="w-7 shrink-0 text-center text-sm font-semibold text-gray-400">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`truncate text-sm font-medium ${
                              item.unavailable ? 'text-gray-400 line-through' : 'text-gray-900'
                            }`}
                          >
                            {item.sheet?.title ?? t('myBook.list.loading')}
                          </p>
                          <p className="truncate text-xs text-gray-500">
                            {item.sheet?.artist}
                            {item.sheet && !item.unavailable && (
                              <>
                                {' · '}
                                {item.owned ? (
                                  <span className="font-semibold text-emerald-600">{t('myBook.list.owned')}</span>
                                ) : (
                                  formatWon(item.sheet.price ?? 0)
                                )}
                              </>
                            )}
                            {item.unavailable && (
                              <span className="font-semibold text-red-500"> · {t('myBook.list.unavailable')}</span>
                            )}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            aria-label={t('myBook.list.moveUp')}
                            disabled={index === 0}
                            onClick={() => moveSheet(item.id, -1)}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                          >
                            <i className="ri-arrow-up-s-line text-lg" />
                          </button>
                          <button
                            type="button"
                            aria-label={t('myBook.list.moveDown')}
                            disabled={index === items.length - 1}
                            onClick={() => moveSheet(item.id, 1)}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                          >
                            <i className="ri-arrow-down-s-line text-lg" />
                          </button>
                          <button
                            type="button"
                            aria-label={t('myBook.list.remove')}
                            onClick={() => removeSheet(item.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500"
                          >
                            <i className="ri-close-line text-lg" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </section>

            {/* 안내 */}
            <section className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6">
              <h2 className="text-lg font-bold text-gray-900">{t('myBook.notice.title')}</h2>
              <ul className="mt-3 space-y-2 text-sm text-gray-600">
                {noticeKeys.map((key) => (
                  <li key={key} className="flex gap-2">
                    <i className="ri-check-line mt-0.5 text-indigo-500" />
                    <span>{t(`myBook.notice.items.${key}`)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* 금액 + 신청 */}
          <div ref={formRef} className="lg:sticky lg:top-[136px] lg:self-start">
            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:p-6"
            >
              <div>
                <h2 className="text-lg font-bold text-gray-900">{t('myBook.summary.title')}</h2>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <dt>{t('myBook.summary.listTotal')}</dt>
                    <dd>{formatWon(price.listTotal)}</dd>
                  </div>
                  {price.ownedCount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <dt>{t('myBook.summary.ownedDeduction', { count: price.ownedCount })}</dt>
                      <dd>-{formatWon(price.listTotal - price.payableListTotal)}</dd>
                    </div>
                  )}
                  {price.meetsMinimum && price.discountAmount > 0 && (
                    <div className="flex justify-between text-indigo-600">
                      <dt>{t('myBook.summary.discount', { percent: price.discountPercent })}</dt>
                      <dd>-{formatWon(price.discountAmount)}</dd>
                    </div>
                  )}
                  {price.minPaymentApplied && (
                    <div className="flex justify-between text-gray-600">
                      <dt>{t('myBook.summary.minPayment')}</dt>
                      <dd>{formatWon(price.finalPrice)}</dd>
                    </div>
                  )}
                </dl>
                <div className="mt-3 flex items-end justify-between border-t border-gray-100 pt-3">
                  <span className="text-sm font-semibold text-gray-900">{t('myBook.summary.final')}</span>
                  <span className="text-2xl font-extrabold text-gray-900">
                    {price.meetsMinimum ? formatWon(price.finalPrice) : '-'}
                  </span>
                </div>
                {saving > 0 && (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-1 rounded-lg bg-rose-50 px-3 py-2 text-xs">
                    <span className="font-bold text-rose-600">
                      <i className="ri-coins-line mr-1" />
                      {t('myBook.summary.saving', { amount: formatWon(saving) })}
                    </span>
                    {perSong > 0 && (
                      <span className="text-gray-500">{t('myBook.summary.perSong', { amount: formatWon(perSong) })}</span>
                    )}
                  </div>
                )}

                <div className="mt-4" aria-label={t('myBook.summary.progressLabel')}>
                  <div className="relative h-2 rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-fuchsia-500 transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                    {[...MY_BOOK_DISCOUNT_TIERS].reverse().map((tier) => (
                      <span
                        key={tier.minSongs}
                        className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ${
                          price.songCount >= tier.minSongs ? 'bg-indigo-600' : 'bg-gray-300'
                        }`}
                        style={{ left: `${Math.min(100, (tier.minSongs / progressMax) * 100)}%` }}
                      />
                    ))}
                  </div>
                  <div className="relative mt-2 h-8 text-[10px] leading-tight">
                    {[...MY_BOOK_DISCOUNT_TIERS].reverse().map((tier) => {
                      const left = (tier.minSongs / progressMax) * 100;
                      const reached = price.songCount >= tier.minSongs;
                      return (
                        <span
                          key={tier.minSongs}
                          className={`absolute whitespace-nowrap text-center ${reached ? 'font-bold text-indigo-700' : 'text-gray-400'} ${
                            left >= 100 ? '-translate-x-full text-right' : '-translate-x-1/2'
                          }`}
                          style={{ left: `${left}%` }}
                        >
                          {tier.minSongs}곡
                          <br />
                          {tier.percent}%
                        </span>
                      );
                    })}
                  </div>
                </div>

                <p
                  className={`mt-2 rounded-lg px-3 py-2 text-xs font-medium ${
                    price.meetsMinimum && !price.exceedsMaximum
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {summaryMessage}
                </p>
                {!user && <p className="mt-2 text-xs text-gray-500">{t('myBook.summary.loginForOwned')}</p>}
              </div>

              <div className="border-t border-gray-100 pt-5">
                <h3 className="text-base font-bold text-gray-900">{t('myBook.form.title')}</h3>

                <label htmlFor="my-book-title" className="mt-3 block text-sm font-medium text-gray-700">
                  {t('myBook.form.bookTitle')} <span className="text-red-500">*</span>
                </label>
                <input
                  id="my-book-title"
                  type="text"
                  value={bookTitle}
                  maxLength={MY_BOOK_TITLE_MAX_LENGTH}
                  onChange={(e) => setBookTitle(e.target.value)}
                  placeholder={t('myBook.form.bookTitlePlaceholder')}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-1 text-right text-xs text-gray-400">
                  {bookTitle.length}/{MY_BOOK_TITLE_MAX_LENGTH}
                </p>

                <p className="mt-2 block text-sm font-medium text-gray-700">{t('myBook.form.coverTheme')}</p>
                {coverFile ? (
                  <p className="mt-1 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                    {t('myBook.form.coverThemeFileNote')}
                  </p>
                ) : (
                  <div className="mt-1 flex gap-3 rounded-lg bg-gray-50 p-3">
                    <MyBookCoverPreview
                      title={bookTitle}
                      songCount={Math.max(ids.length, MY_BOOK_MIN_SONGS)}
                      themeId={coverTheme}
                      width={88}
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div role="radiogroup" aria-label={t('myBook.form.coverTheme')} className="grid grid-cols-4 gap-x-1 gap-y-2">
                        {MY_BOOK_COVER_THEMES.map((theme) => {
                          const selected = theme.id === coverTheme;
                          const label = t(`myBook.form.coverThemes.${theme.id}`);
                          return (
                            <button
                              key={theme.id}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              aria-label={label}
                              title={label}
                              onClick={() => setCoverTheme(theme.id)}
                              className="flex min-w-0 flex-col items-center gap-1"
                            >
                              <span
                                className={`flex h-9 w-9 items-center justify-center rounded-full border border-black/10 text-xs font-extrabold shadow-sm ring-2 ring-offset-2 transition ${
                                  selected ? 'ring-indigo-600' : 'ring-transparent hover:ring-indigo-200'
                                }`}
                                style={{ background: getCoverThemeGradientCss(theme), color: theme.text }}
                              >
                                {selected ? <i className="ri-check-line text-sm" /> : '가'}
                              </span>
                              <span
                                className={`w-full truncate text-center text-[10px] ${
                                  selected ? 'font-semibold text-indigo-700' : 'text-gray-500'
                                }`}
                              >
                                {label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-2 break-keep text-xs text-gray-500">{t('myBook.form.coverNone')}</p>
                    </div>
                  </div>
                )}

                <p className="mt-3 block text-sm font-medium text-gray-700">{t('myBook.form.cover')}</p>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                  onChange={handleCoverChange}
                  className="hidden"
                />
                {coverFile ? (
                  <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                    <span className="truncate text-gray-700">
                      <i className="ri-attachment-2 mr-1" />
                      {coverFile.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCoverFile(null)}
                      className="shrink-0 text-xs text-gray-500 underline"
                    >
                      {t('myBook.form.coverRemove')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-600 hover:border-indigo-400 hover:text-indigo-600"
                  >
                    <i className="ri-upload-2-line" />
                    {t('myBook.form.coverPick')}
                  </button>
                )}
                <p className="mt-1 text-xs text-gray-500">{t('myBook.form.coverHint')}</p>
                {coverFile && <p className="mt-1 text-xs text-gray-500">{t('myBook.form.coverAttached')}</p>}

                <label htmlFor="my-book-memo" className="mt-4 block text-sm font-medium text-gray-700">
                  {t('myBook.form.memo')}
                </label>
                <textarea
                  id="my-book-memo"
                  value={memo}
                  rows={3}
                  maxLength={MY_BOOK_MEMO_MAX_LENGTH}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder={t('myBook.form.memoPlaceholder')}
                  className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-1 text-xs text-gray-500">{t('myBook.form.memoHint')}</p>

                <label className="mt-3 flex items-start gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-indigo-600"
                  />
                  <span>{t('myBook.form.agree')}</span>
                </label>
              </div>

              {formError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>
              )}

              <button
                type="submit"
                disabled={user ? !canSubmit : false}
                className="w-full rounded-lg bg-indigo-600 py-3.5 text-base font-bold text-white transition-colors hover:bg-indigo-700 disabled:bg-gray-300"
              >
                {submitState === 'uploading'
                  ? t('myBook.form.uploadingCover')
                  : submitState === 'submitting'
                    ? t('myBook.form.submitting')
                    : user
                      ? t('myBook.form.submit')
                      : t('myBook.form.loginToSubmit')}
              </button>
              <p className="-mt-2 text-center text-xs font-medium text-indigo-700">
                <i className="ri-flashlight-fill mr-0.5 text-amber-500" />
                {t('myBook.form.afterSubmit')}
              </p>
            </form>
          </div>
        </div>
      </main>

      {/* 모바일 하단 요약 바 */}
      <div
        data-mobile-purchase-bar
        className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-gray-500">
              {t('myBook.list.count', { count: ids.length })}
              {price.meetsMinimum && price.discountPercent > 0 && (
                <span className="ml-1 font-semibold text-indigo-600">
                  {t('myBook.summary.discount', { percent: price.discountPercent })}
                </span>
              )}
            </p>
            <p className="text-lg font-extrabold text-gray-900">
              {price.meetsMinimum ? formatWon(price.finalPrice) : '-'}
              {saving > 0 && (
                <span className="ml-1.5 text-xs font-bold text-rose-600">
                  {t('myBook.summary.savingShort', { amount: formatWon(saving) })}
                </span>
              )}
            </p>
            {!price.meetsMinimum && ids.length > 0 && (
              <p className="truncate text-[11px] text-amber-700">{summaryMessage}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="shrink-0 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white"
          >
            {t('myBook.form.submitShort')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MyBookPage;
