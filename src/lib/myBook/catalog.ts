/** 나만의 악보집에 담을 수 없는 카테고리 (악보집 상품·드럼레슨 교재·레슨 자료) */
export const MY_BOOK_EXCLUDED_CATEGORY_NAMES = [
  '드럼레슨',
  '악보집',
  '루디먼트',
  '드럼테크닉',
  '기초/입문',
  '리듬패턴',
  '필인',
];

export interface MyBookSheetRow {
  id: string;
  title: string;
  artist: string | null;
  price: number | null;
  sales_type?: string | null;
  is_active?: boolean | null;
  thumbnail_url?: string | null;
  categories?: { name: string | null } | null;
}

export const MY_BOOK_SHEET_COLUMNS =
  'id, title, artist, price, sales_type, is_active, thumbnail_url, categories ( name )';

/** 담을 수 없는 이유. 담을 수 있으면 null */
export function getMyBookIneligibleReason(
  sheet: MyBookSheetRow
): 'inactive' | 'free' | 'preorder' | 'category' | null {
  if (sheet.is_active === false) return 'inactive';
  if (!sheet.price || sheet.price <= 0) return 'free';
  if (sheet.sales_type === 'PREORDER') return 'preorder';
  if (sheet.categories?.name && MY_BOOK_EXCLUDED_CATEGORY_NAMES.includes(sheet.categories.name)) {
    return 'category';
  }
  return null;
}
