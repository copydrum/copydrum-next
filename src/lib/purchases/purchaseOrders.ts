import { supabase } from '../supabase';
import { fetchLegacyPurchaseOrders } from '../legacyPurchases';

/** 다운로드를 허용하는 주문 상태 */
export const DOWNLOADABLE_STATUSES = ['completed', 'payment_confirmed', 'paid'];

export interface PurchaseSheet {
  id: string;
  title: string;
  artist: string;
  slug: string | null;
  thumbnail_url: string | null;
  pdf_url: string | null;
  sales_type: string | null;
  preorder_deadline: string | null;
}

export interface PurchaseOrderItem {
  id: string;
  sheet_id: string;
  price: number | null;
  drum_sheets: PurchaseSheet | null;
}

export interface PurchaseOrder {
  id: string;
  order_number: string | null;
  created_at: string;
  status: string;
  payment_status: string | null;
  payment_method: string | null;
  total_amount: number;
  depositor_name: string | null;
  expected_completion_date: string | null;
  is_legacy: boolean;
  order_items: PurchaseOrderItem[];
}

const SHEET_COLUMNS = `
  id,
  title,
  artist,
  slug,
  thumbnail_url,
  pdf_url,
  sales_type,
  preorder_deadline
`;

export const isAwaitingDeposit = (order: Pick<PurchaseOrder, 'payment_status'>) =>
  order.payment_status === 'awaiting_deposit';

export const isDownloadableOrder = (order: Pick<PurchaseOrder, 'status' | 'payment_status'>) =>
  !isAwaitingDeposit(order) && DOWNLOADABLE_STATUSES.includes((order.status ?? '').toLowerCase());

/** 선주문 상품이 아직 PDF 없이 제작 중인지 */
export const isPreorderPending = (item: PurchaseOrderItem) =>
  item.drum_sheets?.sales_type === 'PREORDER' && !item.drum_sheets?.pdf_url;

export const isDownloadableItem = (order: PurchaseOrder, item: PurchaseOrderItem) =>
  isDownloadableOrder(order) && Boolean(item.sheet_id) && !isPreorderPending(item);

/** 결제 완료된 주문에 들어 있는 악보 수 */
export const countPurchasedSheets = (orders: PurchaseOrder[]) =>
  orders.reduce((count, order) => count + (isAwaitingDeposit(order) ? 0 : order.order_items.length), 0);

const normalizeSheet = (sheet: any): PurchaseSheet | null =>
  sheet
    ? {
        id: sheet.id,
        title: sheet.title,
        artist: sheet.artist,
        slug: sheet.slug ?? null,
        thumbnail_url: sheet.thumbnail_url ?? null,
        pdf_url: sheet.pdf_url ?? null,
        sales_type: sheet.sales_type ?? null,
        preorder_deadline: sheet.preorder_deadline ?? null,
      }
    : null;

const normalizeOrder = (order: any): PurchaseOrder => ({
  id: order.id,
  order_number: order.order_number ?? null,
  created_at: order.created_at,
  status: order.status ?? '',
  payment_status: order.payment_status ?? null,
  payment_method: order.payment_method ?? null,
  total_amount: Number(order.total_amount) || 0,
  depositor_name: order.depositor_name ?? null,
  expected_completion_date:
    typeof order.expected_completion_date === 'string' && order.expected_completion_date.trim()
      ? order.expected_completion_date
      : null,
  is_legacy: String(order.id).startsWith('legacy:'),
  order_items: (order.order_items ?? []).map((item: any) => ({
    id: item.id,
    sheet_id: item.drum_sheet_id || item.drum_sheets?.id || '',
    price: item.price ?? null,
    drum_sheets: normalizeSheet(item.drum_sheets),
  })),
});

async function fetchPurchaseOrders(userId: string): Promise<PurchaseOrder[]> {
  const ordersQuery = supabase
    .from('orders')
    .select(
      `
      id,
      order_number,
      created_at,
      status,
      total_amount,
      payment_method,
      payment_status,
      depositor_name,
      order_type,
      expected_completion_date,
      order_items (
        id,
        drum_sheet_id,
        price,
        drum_sheets (${SHEET_COLUMNS})
      )
    `,
    )
    .eq('user_id', userId)
    // 결제 완료 + 무통장 입금 대기 (카드 결제를 시작만 하고 그만둔 pending 주문은 제외)
    .in('payment_status', ['paid', 'awaiting_deposit'])
    .order('created_at', { ascending: false });

  // 이전 사이트 구매는 모두 현재 사이트 주문보다 오래되어 뒤에 붙여도 최신순이 유지된다
  const [{ data, error }, legacyOrders] = await Promise.all([ordersQuery, fetchLegacyPurchaseOrders()]);
  if (error) {
    console.error('[purchaseOrders] 주문 조회 실패:', error.message);
  }

  return [...(data ?? []), ...legacyOrders]
    .filter((order: any) => (order.order_items?.length ?? 0) > 0 && (!order.order_type || order.order_type === 'product'))
    .map(normalizeOrder);
}

/** 마이페이지 요약과 구매 목록이 같은 화면에서 동시에 부르므로 같은 요청을 나눠 쓴다 */
const CACHE_MS = 30_000;
let cache: { userId: string; at: number; promise: Promise<PurchaseOrder[]> } | null = null;

export function loadPurchaseOrders(userId: string, { force = false } = {}): Promise<PurchaseOrder[]> {
  if (!force && cache && cache.userId === userId && Date.now() - cache.at < CACHE_MS) {
    return cache.promise;
  }
  const promise = fetchPurchaseOrders(userId).catch((error) => {
    console.error('[purchaseOrders] 구매내역 로드 오류:', error);
    cache = null;
    return [] as PurchaseOrder[];
  });
  cache = { userId, at: Date.now(), promise };
  return promise;
}
