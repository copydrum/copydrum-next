/** 악보집 장르(서브카테고리). DB categories.name 과 1:1 */
export const SHEET_BOOK_GENRE_NAMES = [
  '가요',
  '팝',
  '락',
  '재즈',
  'J-POP',
  'OST',
  '드럼솔로',
  '드럼커버',
] as const;

export type SheetBookGenreName = (typeof SHEET_BOOK_GENRE_NAMES)[number];

/** i18n: sheetBooks.genres.* 또는 categoriesPage.categories.* 키 */
export const SHEET_BOOK_GENRE_I18N_KEYS: Record<SheetBookGenreName, string> = {
  가요: 'kpop',
  팝: 'pop',
  락: 'rock',
  재즈: 'jazz',
  'J-POP': 'jpop',
  OST: 'ost',
  드럼솔로: 'drumSolo',
  드럼커버: 'drumCover',
};

export const SHEET_BOOK_MAIN_CATEGORY_NAME = '악보집';
