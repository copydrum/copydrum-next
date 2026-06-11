/**
 * 서버 사이드 SEO 문자열 생성 헬퍼.
 *
 * generateMetadata 는 서버에서 실행되므로 react-i18next 의 클라이언트 t() 를 쓸 수 없다.
 * 여기서는 각 locale 의 seo.json / sheetDetail.json 을 직접 로드하여
 * buildDetailSeoStrings 가 기대하는 t(key) 인터페이스를 서버용으로 재현한다.
 *
 * → 16개 비영어 locale 에서도 검색 결과(title/description)가 해당 언어로 노출된다.
 */
import { buildDetailSeoStrings } from '@/lib/seo';

import seoEn from '@/i18n/locales/en/seo.json';
import seoKo from '@/i18n/locales/ko/seo.json';
import seoJa from '@/i18n/locales/ja/seo.json';
import seoZhCN from '@/i18n/locales/zh-CN/seo.json';
import seoZhTW from '@/i18n/locales/zh-TW/seo.json';
import seoDe from '@/i18n/locales/de/seo.json';
import seoFr from '@/i18n/locales/fr/seo.json';
import seoEs from '@/i18n/locales/es/seo.json';
import seoVi from '@/i18n/locales/vi/seo.json';
import seoTh from '@/i18n/locales/th/seo.json';
import seoHi from '@/i18n/locales/hi/seo.json';
import seoId from '@/i18n/locales/id/seo.json';
import seoPt from '@/i18n/locales/pt/seo.json';
import seoRu from '@/i18n/locales/ru/seo.json';
import seoIt from '@/i18n/locales/it/seo.json';
import seoTr from '@/i18n/locales/tr/seo.json';
import seoUk from '@/i18n/locales/uk/seo.json';

import sdEn from '@/i18n/locales/en/sheetDetail.json';
import sdKo from '@/i18n/locales/ko/sheetDetail.json';
import sdJa from '@/i18n/locales/ja/sheetDetail.json';
import sdZhCN from '@/i18n/locales/zh-CN/sheetDetail.json';
import sdZhTW from '@/i18n/locales/zh-TW/sheetDetail.json';
import sdDe from '@/i18n/locales/de/sheetDetail.json';
import sdFr from '@/i18n/locales/fr/sheetDetail.json';
import sdEs from '@/i18n/locales/es/sheetDetail.json';
import sdVi from '@/i18n/locales/vi/sheetDetail.json';
import sdTh from '@/i18n/locales/th/sheetDetail.json';
import sdHi from '@/i18n/locales/hi/sheetDetail.json';
import sdId from '@/i18n/locales/id/sheetDetail.json';
import sdPt from '@/i18n/locales/pt/sheetDetail.json';
import sdRu from '@/i18n/locales/ru/sheetDetail.json';
import sdIt from '@/i18n/locales/it/sheetDetail.json';
import sdTr from '@/i18n/locales/tr/sheetDetail.json';
import sdUk from '@/i18n/locales/uk/sheetDetail.json';

import cpEn from '@/i18n/locales/en/categoriesPage.json';
import cpKo from '@/i18n/locales/ko/categoriesPage.json';
import cpJa from '@/i18n/locales/ja/categoriesPage.json';
import cpZhCN from '@/i18n/locales/zh-CN/categoriesPage.json';
import cpZhTW from '@/i18n/locales/zh-TW/categoriesPage.json';
import cpDe from '@/i18n/locales/de/categoriesPage.json';
import cpFr from '@/i18n/locales/fr/categoriesPage.json';
import cpEs from '@/i18n/locales/es/categoriesPage.json';
import cpVi from '@/i18n/locales/vi/categoriesPage.json';
import cpTh from '@/i18n/locales/th/categoriesPage.json';
import cpHi from '@/i18n/locales/hi/categoriesPage.json';
import cpId from '@/i18n/locales/id/categoriesPage.json';
import cpPt from '@/i18n/locales/pt/categoriesPage.json';
import cpRu from '@/i18n/locales/ru/categoriesPage.json';
import cpIt from '@/i18n/locales/it/categoriesPage.json';
import cpTr from '@/i18n/locales/tr/categoriesPage.json';
import cpUk from '@/i18n/locales/uk/categoriesPage.json';

import fsEn from '@/i18n/locales/en/freeSheets.json';
import fsKo from '@/i18n/locales/ko/freeSheets.json';
import fsJa from '@/i18n/locales/ja/freeSheets.json';
import fsZhCN from '@/i18n/locales/zh-CN/freeSheets.json';
import fsZhTW from '@/i18n/locales/zh-TW/freeSheets.json';
import fsDe from '@/i18n/locales/de/freeSheets.json';
import fsFr from '@/i18n/locales/fr/freeSheets.json';
import fsEs from '@/i18n/locales/es/freeSheets.json';
import fsVi from '@/i18n/locales/vi/freeSheets.json';
import fsTh from '@/i18n/locales/th/freeSheets.json';
import fsHi from '@/i18n/locales/hi/freeSheets.json';
import fsId from '@/i18n/locales/id/freeSheets.json';
import fsPt from '@/i18n/locales/pt/freeSheets.json';
import fsRu from '@/i18n/locales/ru/freeSheets.json';
import fsIt from '@/i18n/locales/it/freeSheets.json';
import fsTr from '@/i18n/locales/tr/freeSheets.json';
import fsUk from '@/i18n/locales/uk/freeSheets.json';

type SeoJson = Record<string, string>;
type SheetDetailJson = { difficulty?: Record<string, string> } & Record<string, unknown>;

const SEO_BY_LOCALE: Record<string, SeoJson> = {
  en: seoEn, ko: seoKo, ja: seoJa, 'zh-CN': seoZhCN, 'zh-TW': seoZhTW,
  de: seoDe, fr: seoFr, es: seoEs, vi: seoVi, th: seoTh, hi: seoHi,
  id: seoId, pt: seoPt, ru: seoRu, it: seoIt, tr: seoTr, uk: seoUk,
};

const SHEET_DETAIL_BY_LOCALE: Record<string, SheetDetailJson> = {
  en: sdEn, ko: sdKo, ja: sdJa, 'zh-CN': sdZhCN, 'zh-TW': sdZhTW,
  de: sdDe, fr: sdFr, es: sdEs, vi: sdVi, th: sdTh, hi: sdHi,
  id: sdId, pt: sdPt, ru: sdRu, it: sdIt, tr: sdTr, uk: sdUk,
};

type CategoriesPageJson = { pageTitle?: string; pageDescription?: string } & Record<string, unknown>;
type FreeSheetsJson = { title?: string; description?: string } & Record<string, unknown>;

const CATEGORIES_PAGE_BY_LOCALE: Record<string, CategoriesPageJson> = {
  en: cpEn, ko: cpKo, ja: cpJa, 'zh-CN': cpZhCN, 'zh-TW': cpZhTW,
  de: cpDe, fr: cpFr, es: cpEs, vi: cpVi, th: cpTh, hi: cpHi,
  id: cpId, pt: cpPt, ru: cpRu, it: cpIt, tr: cpTr, uk: cpUk,
};

const FREE_SHEETS_BY_LOCALE: Record<string, FreeSheetsJson> = {
  en: fsEn, ko: fsKo, ja: fsJa, 'zh-CN': fsZhCN, 'zh-TW': fsZhTW,
  de: fsDe, fr: fsFr, es: fsEs, vi: fsVi, th: fsTh, hi: fsHi,
  id: fsId, pt: fsPt, ru: fsRu, it: fsIt, tr: fsTr, uk: fsUk,
};

/**
 * 주어진 locale 에 대해 buildDetailSeoStrings 가 사용할 t(key) 함수를 만든다.
 * seo.* / sheetDetail.difficulty.* 키를 locale → en 순으로 해석한다.
 */
function createServerT(locale: string): (key: string) => string {
  const seo = SEO_BY_LOCALE[locale] || SEO_BY_LOCALE.en;
  const seoFallback = SEO_BY_LOCALE.en;
  const sd = SHEET_DETAIL_BY_LOCALE[locale] || SHEET_DETAIL_BY_LOCALE.en;
  const sdFallback = SHEET_DETAIL_BY_LOCALE.en;

  return (key: string): string => {
    if (key.startsWith('seo.')) {
      const subKey = key.slice('seo.'.length);
      return (seo[subKey] ?? seoFallback[subKey] ?? '') as string;
    }
    if (key.startsWith('sheetDetail.difficulty.')) {
      const subKey = key.slice('sheetDetail.difficulty.'.length);
      const map = (sd.difficulty || {}) as Record<string, string>;
      const fb = (sdFallback.difficulty || {}) as Record<string, string>;
      return map[subKey] ?? fb[subKey] ?? '';
    }
    return '';
  };
}

interface ServerSeoSheet {
  title: string;
  artist: string;
  difficulty?: string;
  tempo?: number;
  page_count?: number;
  categories?: { name: string } | null;
}

/**
 * 서버에서 drum-sheet 상세 페이지의 localized SEO 문자열(title/description/keywords)을 생성한다.
 */
export function getServerDetailSeo(locale: string, sheet: ServerSeoSheet) {
  const t = createServerT(locale);
  return buildDetailSeoStrings(sheet as any, t);
}

interface PageSeo {
  title: string;
  description: string;
}

/** 홈 페이지 localized SEO (seo.homeTitle / homeDescription). */
export function getServerHomeSeo(locale: string): PageSeo {
  const seo = SEO_BY_LOCALE[locale] || SEO_BY_LOCALE.en;
  const fb = SEO_BY_LOCALE.en;
  return {
    title: (seo.homeTitle || fb.homeTitle) as string,
    description: (seo.homeDescription || fb.homeDescription) as string,
  };
}

/** 카테고리(카탈로그) 랜딩 페이지 localized SEO. */
export function getServerCategoriesPageSeo(locale: string): PageSeo {
  const cp = CATEGORIES_PAGE_BY_LOCALE[locale] || CATEGORIES_PAGE_BY_LOCALE.en;
  const fb = CATEGORIES_PAGE_BY_LOCALE.en;
  const seo = SEO_BY_LOCALE[locale] || SEO_BY_LOCALE.en;
  // 브랜드명을 붙여 검색 결과 가독성을 높인다.
  const base = (cp.pageTitle || fb.pageTitle || 'Drum Sheet Music') as string;
  return {
    title: `${base} | COPYDRUM`,
    description: (cp.pageDescription || fb.pageDescription || seo.homeDescription) as string,
  };
}

/** 드럼레슨 교재(free-sheets) 페이지 localized SEO. */
export function getServerFreeSheetsSeo(locale: string): PageSeo {
  const fs = FREE_SHEETS_BY_LOCALE[locale] || FREE_SHEETS_BY_LOCALE.en;
  const fb = FREE_SHEETS_BY_LOCALE.en;
  const base = (fs.title || fb.title || 'Drum Lesson Books') as string;
  return {
    title: `${base} | COPYDRUM`,
    description: (fs.description || fb.description || '') as string,
  };
}
