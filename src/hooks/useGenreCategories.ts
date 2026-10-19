'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface GenreCategory {
  id: string;
  name: string;
  slug: string | null;
}

/** 헤더·모바일 메뉴가 페이지마다 다시 마운트돼도 장르 목록은 한 번만 불러온다 */
let cache: GenreCategory[] | null = null;
let inflight: Promise<GenreCategory[]> | null = null;

const fetchGenreCategories = async (): Promise<GenreCategory[]> => {
  const withSlug = await supabase
    .from('categories')
    .select('id, name, slug')
    .neq('name', '드럼레슨')
    .neq('name', '악보집');
  if (!withSlug.error && withSlug.data) return withSlug.data as GenreCategory[];

  const basic = await supabase
    .from('categories')
    .select('id, name')
    .neq('name', '드럼레슨')
    .neq('name', '악보집');
  if (basic.error) throw basic.error;
  return (basic.data || []).map((cat) => ({ ...cat, slug: null }));
};

const loadGenreCategories = () => {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetchGenreCategories()
      .then((data) => {
        cache = data;
        return data;
      })
      .catch((error) => {
        console.error('카테고리 로드 오류:', error);
        return [] as GenreCategory[];
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
};

export function useGenreCategories(enabled = true) {
  const [categories, setCategories] = useState<GenreCategory[]>(() => cache ?? []);

  useEffect(() => {
    if (!enabled || cache) {
      if (cache) setCategories(cache);
      return;
    }
    let cancelled = false;
    loadGenreCategories().then((data) => {
      if (!cancelled) setCategories(data);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return categories;
}

const GENRE_ORDER_KO = ['가요', '팝', '락', 'CCM', '트로트/성인가요', '재즈', 'J-POP', 'OST', '드럼솔로', '드럼커버'];
const GENRE_ORDER_GLOBAL = ['팝', '락', '가요', '재즈', 'J-POP', 'OST', 'CCM', '트로트/성인가요', '드럼솔로', '드럼커버'];

/** 한국어는 가요 우선, 나머지 언어는 팝 우선 순서 */
export const getGenreOrder = (language: string) => (language === 'ko' ? GENRE_ORDER_KO : GENRE_ORDER_GLOBAL);

const GENRE_LABEL_KEYS: Record<string, string> = {
  '가요': 'kpop',
  '팝': 'pop',
  '락': 'rock',
  'CCM': 'ccm',
  '트로트/성인가요': 'trot',
  '재즈': 'jazz',
  'J-POP': 'jpop',
  'OST': 'ost',
  '드럼솔로': 'drumSolo',
  '드럼커버': 'drumCover',
};

/** DB의 한국어 장르명을 현재 언어로 표시 */
export const getGenreLabel = (name: string, language: string, t: (key: string) => string) => {
  if (language === 'ko') return name;
  const key = GENRE_LABEL_KEYS[name];
  return key ? t(`categoriesPage.categories.${key}`) : name;
};

/** 표시 순서대로 정렬된 장르 링크 목록 (DB에 없는 장르는 건너뛴다) */
export const buildGenreNavItems = (
  categories: GenreCategory[],
  language: string,
  t: (key: string) => string,
) =>
  getGenreOrder(language).flatMap((name) => {
    const category = categories.find((cat) => cat.name === name);
    if (!category) return [];
    return [{
      id: category.id,
      slug: category.slug,
      label: getGenreLabel(name, language, t),
      href: `/categories?category=${category.slug || category.id}`,
    }];
  });

/** URL의 category 파라미터(slug 또는 id)가 이 카테고리를 가리키는지 */
export const isSameCategory = (param: string | null | undefined, category: Pick<GenreCategory, 'id' | 'slug'>) =>
  Boolean(param) && (param === category.id || param === category.slug);
