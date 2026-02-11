'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from 'react-i18next';

interface MobileSearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}

export default function MobileSearchOverlay({
  isOpen,
  onClose,
  initialQuery = '',
}: MobileSearchOverlayProps) {
  const router = useLocaleRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [topSheets, setTopSheets] = useState<Array<{ id: string; title: string; artist: string | null; slug: string }>>([]);
  const [keywordSuggestions, setKeywordSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const hasFetchedRef = useRef(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [initialQuery, isOpen]);

  const loadSuggestions = useCallback(async () => {
    try {
      setIsLoadingSuggestions(true);
      const { data, error } = await supabase
        .from('drum_sheets')
        .select('id, title, artist, slug')
        .eq('is_active', true)
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(12);

      if (error) {
        throw error;
      }

      const sheets = (data ?? []).filter(
        (sheet): sheet is { id: string; title: string; artist: string | null } =>
          Boolean(sheet?.id) && Boolean(sheet?.title),
      );

      setTopSheets(sheets.slice(0, 5));

      const suggestionsSource = sheets.slice(5);
      const rawSuggestions =
        suggestionsSource.length >= 4 ? suggestionsSource.slice(0, 4) : sheets.slice(0, 4);

      const uniqueTitles = Array.from(
        new Set(rawSuggestions.map((sheet) => sheet.title.trim()).filter(Boolean)),
      );
      setKeywordSuggestions(uniqueTitles.slice(0, 4));
    } catch (error) {
      console.error('모바일 검색 추천 데이터 로드 오류:', error);
      setTopSheets([]);
      setKeywordSuggestions([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      void loadSuggestions();
    }
  }, [isOpen, loadSuggestions]);

  useEffect(() => {
    if (!isOpen) {
      hasFetchedRef.current = false;
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }
    const params = new URLSearchParams({ search: trimmed });
    router.push(`/categories?${params.toString()}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-white md:hidden">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            aria-label={t('mobile.search.close')}
            className="text-gray-500 hover:text-gray-700"
          >
            <i className="ri-arrow-left-line text-2xl" />
          </button>
          <form onSubmit={handleSubmit} className="flex-1 flex items-center">
            <div className="relative w-full">
              <input
                ref={inputRef}
                type="search"
                value={query}
                placeholder={t('search.placeholder')}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full rounded-full bg-gray-100 py-3 pl-12 pr-12 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={t('mobile.search.clear')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-circle-line text-xl" />
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8">
          <div>
            <p className="text-sm font-semibold text-gray-900">{t('mobile.search.topSheets')}</p>
            <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50">
              {isLoadingSuggestions ? (
                <ul className="divide-y divide-gray-200">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <li key={index} className="px-4 py-3">
                      <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
                    </li>
                  ))}
                </ul>
              ) : topSheets.length === 0 ? (
                <div className="px-4 py-5 text-sm text-gray-500">{t('mobile.search.noTopSheets')}</div>
              ) : (
                <ol className="divide-y divide-gray-200">
                  {topSheets.map((sheet, index) => (
                    <li key={sheet.id}>
                      <button
                        type="button"
                        onClick={() => {
                          router.push(`/drum-sheet/${sheet.slug}`);
                          onClose();
                        }}
                        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-100"
                      >
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {index + 1}. {sheet.title}
                          </p>
                          {sheet.artist ? (
                            <p className="text-xs text-gray-500 mt-0.5">{sheet.artist}</p>
                          ) : null}
                        </div>
                        <i className="ri-arrow-right-s-line text-lg text-gray-400" />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-900">{t('mobile.search.suggestions')}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(isLoadingSuggestions ? Array.from({ length: 4 }) : keywordSuggestions).map(
                (keyword, index) => (
                  <button
                    key={keyword ?? index}
                    type="button"
                    onClick={() => {
                      if (!keyword) {
                        return;
                      }
                      setQuery(keyword);
                      const params = new URLSearchParams({ search: keyword });
                      router.push(`/categories?${params.toString()}`);
                      onClose();
                    }}
                    className="rounded-full border border-gray-200 px-4 py-2 text-xs text-gray-700 hover:border-blue-300 hover:text-blue-600 disabled:opacity-60"
                    disabled={!keyword}
                  >
                    {keyword || t('message.loading')}
                  </button>
                ),
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


