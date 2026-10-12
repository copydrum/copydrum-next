import { supabase } from './supabase';

/**
 * 이전 사이트(아임웹·카페24) 구매내역.
 * DB 함수 get_my_legacy_purchases 가 본인 구매만 돌려주며, 주문 화면에서 쓰는 orders 조회 결과와
 * 같은 모양으로 바꿔 기존 구매내역 목록에 그대로 합친다.
 */

interface LegacyPurchaseRow {
  legacy_order_id: number;
  source: 'imweb' | 'cafe24';
  order_no: string;
  ordered_at: string | null;
  amount: number | string;
  currency: string;
  drum_sheet_id: string;
}

export interface LegacyOrderItemRecord {
  id: string;
  drum_sheet_id: string;
  sheet_title: string | null;
  price: number | null;
  created_at: string | null;
  drum_sheets: any;
}

export interface LegacyOrderRecord {
  id: string;
  order_number: string;
  created_at: string | null;
  status: 'completed';
  payment_status: 'paid';
  payment_method: null;
  order_type: 'product';
  total_amount: number;
  expected_completion_date: null;
  order_items: LegacyOrderItemRecord[];
}

const LEGACY_ID_PREFIX = 'legacy:';

const LEGACY_SHEET_COLUMNS = `
  id,
  title,
  artist,
  price,
  slug,
  thumbnail_url,
  preview_image_url,
  pdf_url,
  sales_type,
  preorder_deadline,
  categories (
    name
  )
`;

/** 사이트 표시 환율과 같은 기준 (1,000원 = $1) */
const toKrw = (amount: number | string, currency: string) => {
  const value = Number(amount) || 0;
  return currency === 'USD' ? Math.round(value * 1000) : value;
};

export const isLegacyOrderItemId = (orderItemId: string | null | undefined) =>
  Boolean(orderItemId?.startsWith(LEGACY_ID_PREFIX));

export function parseLegacyOrderItemId(orderItemId: string) {
  const [, legacyOrderId, sheetId] = orderItemId.split(':');
  return { legacyOrderId: Number(legacyOrderId), sheetId };
}

async function fetchLegacyPurchaseRows(): Promise<LegacyPurchaseRow[]> {
  const { data, error } = await supabase.rpc('get_my_legacy_purchases');
  if (error) {
    console.warn('[legacyPurchases] 이전 사이트 구매내역 조회 실패:', error.message);
    return [];
  }
  return (data ?? []) as LegacyPurchaseRow[];
}

/** 이전 사이트에서 구매한 악보 ID 목록 */
export async function fetchLegacyPurchasedSheetIds(): Promise<string[]> {
  const rows = await fetchLegacyPurchaseRows();
  return Array.from(new Set(rows.map((row) => row.drum_sheet_id)));
}

/** 이전 사이트 구매를 주문번호 단위로 묶어, 최근 주문이 먼저 오도록 돌려준다 */
export async function fetchLegacyPurchaseOrders(): Promise<LegacyOrderRecord[]> {
  const rows = await fetchLegacyPurchaseRows();
  if (rows.length === 0) {
    return [];
  }

  const sheetIds = Array.from(new Set(rows.map((row) => row.drum_sheet_id)));
  const sheets = new Map<string, any>();
  for (let i = 0; i < sheetIds.length; i += 200) {
    const { data, error } = await supabase
      .from('drum_sheets')
      .select(LEGACY_SHEET_COLUMNS)
      .in('id', sheetIds.slice(i, i + 200));
    if (error) {
      console.warn('[legacyPurchases] 악보 정보 조회 실패:', error.message);
      continue;
    }
    (data ?? []).forEach((sheet: any) => sheets.set(sheet.id, sheet));
  }

  // 품목 하나가 여러 악보로 나뉜 경우(카페24 "외 N건") 품목 금액을 악보별로 알 수 없다
  const sheetsPerLine = new Map<number, number>();
  rows.forEach((row) => sheetsPerLine.set(row.legacy_order_id, (sheetsPerLine.get(row.legacy_order_id) ?? 0) + 1));

  const orders = new Map<string, LegacyOrderRecord>();
  const countedLines = new Set<number>();
  rows.forEach((row) => {
    const orderId = `${LEGACY_ID_PREFIX}${row.source}:${row.order_no}`;
    let order = orders.get(orderId);
    if (!order) {
      order = {
        id: orderId,
        order_number: row.order_no,
        created_at: row.ordered_at,
        status: 'completed',
        payment_status: 'paid',
        payment_method: null,
        order_type: 'product',
        total_amount: 0,
        expected_completion_date: null,
        order_items: [],
      };
      orders.set(orderId, order);
    }

    const lineAmount = toKrw(row.amount, row.currency);
    if (!countedLines.has(row.legacy_order_id)) {
      countedLines.add(row.legacy_order_id);
      order.total_amount += lineAmount;
    }

    const sheet = sheets.get(row.drum_sheet_id) ?? null;
    order.order_items.push({
      id: `${LEGACY_ID_PREFIX}${row.legacy_order_id}:${row.drum_sheet_id}`,
      drum_sheet_id: row.drum_sheet_id,
      sheet_title: sheet?.title ?? null,
      price: sheetsPerLine.get(row.legacy_order_id) === 1 ? lineAmount : null,
      created_at: row.ordered_at,
      drum_sheets: sheet,
    });
  });

  return Array.from(orders.values()).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
}
