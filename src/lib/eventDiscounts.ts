import { supabase } from '@/lib/supabase';
import {
  EVENT_CHECKOUT_GRACE_MS,
  getEventSalePrice,
  isSellableEvent,
  type EventDiscountSheet,
} from './eventDiscountRules';

export * from './eventDiscountRules';

/** 진행 중 + 예정 이벤트 (고객 화면용) */
export const fetchPublicEventDiscounts = async (): Promise<EventDiscountSheet[]> => {
  const { data, error } = await supabase
    .from('event_discount_sheet_view')
    .select('*')
    .eq('is_active', true)
    .gte('event_end', new Date().toISOString())
    .order('event_end', { ascending: true });

  if (error) {
    console.error('이벤트 할인 악보 조회 오류:', error);
    throw error;
  }

  return ((data || []) as EventDiscountSheet[]).filter(isSellableEvent);
};

/** 지금 진행 중인 이벤트만 sheet_id 기준으로 조회 (주문 직전 가격 확정용) */
export const fetchActiveEventsBySheetIds = async (
  sheetIds: string[],
): Promise<Map<string, EventDiscountSheet>> => {
  const ids = Array.from(new Set(sheetIds.filter(Boolean)));
  const result = new Map<string, EventDiscountSheet>();
  if (ids.length === 0) return result;

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('event_discount_sheet_view')
    .select('*')
    .in('sheet_id', ids)
    .eq('is_active', true)
    .lte('event_start', nowIso)
    .gte('event_end', nowIso);

  if (error) {
    console.error('진행 중 이벤트 조회 오류:', error);
    return result;
  }

  for (const event of (data || []) as EventDiscountSheet[]) {
    if (isSellableEvent(event)) result.set(event.sheet_id, event);
  }
  return result;
};

/** 지금 결제할 가격 (진행 중 이벤트가 있으면 할인가) */
export const resolveSheetPrice = async (sheetId: string, basePrice: number) => {
  const events = await fetchActiveEventsBySheetIds([sheetId]);
  const event = events.get(sheetId) ?? null;
  const price = Math.max(0, Math.round(Number(basePrice) || 0));
  return {
    price: event ? Math.min(price, getEventSalePrice(event)) : price,
    event,
  };
};

// ─── 관리자 ────────────────────────────────────────────

export const fetchEventDiscountList = async () => {
  const { data, error } = await supabase
    .from('event_discount_sheet_view')
    .select('*')
    .order('event_start', { ascending: false });

  if (error) {
    console.error('이벤트 할인 악보 전체 목록 조회 오류:', error);
    throw error;
  }

  return (data || []) as EventDiscountSheet[];
};

export interface EventDiscountUpsertPayload {
  sheet_id: string;
  discount_price: number;
  event_start: string;
  event_end: string;
  is_active: boolean;
}

/** sheet_id 가 같은 기존 이벤트는 덮어쓴다 (악보당 이벤트 1건) */
export const upsertEventDiscountSheets = async (payloads: EventDiscountUpsertPayload[]) => {
  if (payloads.length === 0) return [];
  const { data, error } = await supabase
    .from('event_discount_sheets')
    .upsert(payloads, { onConflict: 'sheet_id' })
    .select();

  if (error) {
    console.error('이벤트 할인 악보 저장 오류:', error);
    throw error;
  }

  return data || [];
};

export const updateEventDiscount = async (
  id: string,
  patch: Partial<Pick<EventDiscountUpsertPayload, 'discount_price' | 'event_start' | 'event_end' | 'is_active'>>,
) => {
  const { error } = await supabase.from('event_discount_sheets').update(patch).eq('id', id);
  if (error) {
    console.error('이벤트 할인 악보 수정 오류:', error);
    throw error;
  }
};

export const deleteEventDiscountById = async (id: string) => {
  const { error } = await supabase.from('event_discount_sheets').delete().eq('id', id);
  if (error) {
    console.error('이벤트 할인 악보 삭제 오류:', error);
    throw error;
  }
};

export interface EventSalesStat {
  count: number;
  revenue: number;
}

/**
 * 이벤트 기간 중 판매 실적 (결제 완료 주문 기준).
 * 같은 악보로 이벤트를 다시 열면 마지막(현재 저장된) 기간만 집계된다.
 */
export const fetchEventSalesStats = async (
  events: Pick<EventDiscountSheet, 'id' | 'sheet_id' | 'event_start' | 'event_end'>[],
): Promise<Record<string, EventSalesStat>> => {
  const stats: Record<string, EventSalesStat> = {};
  if (events.length === 0) return stats;

  const sheetIds = Array.from(new Set(events.map((event) => event.sheet_id)));
  const earliestStart = events.reduce(
    (min, event) => (event.event_start < min ? event.event_start : min),
    events[0].event_start,
  );

  const { data, error } = await supabase
    .from('order_items')
    .select('drum_sheet_id, price, orders!inner(status, created_at)')
    .in('drum_sheet_id', sheetIds)
    .in('orders.status', ['payment_confirmed', 'completed'])
    .gte('orders.created_at', earliestStart);

  if (error) {
    console.error('이벤트 판매 실적 조회 오류:', error);
    return stats;
  }

  const rows = (data || []) as Array<{
    drum_sheet_id: string;
    price: number | null;
    orders: { created_at: string } | { created_at: string }[] | null;
  }>;

  for (const event of events) {
    const start = new Date(event.event_start).getTime();
    const end = new Date(event.event_end).getTime() + EVENT_CHECKOUT_GRACE_MS;
    let count = 0;
    let revenue = 0;
    for (const row of rows) {
      if (row.drum_sheet_id !== event.sheet_id) continue;
      const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
      const createdAt = order ? new Date(order.created_at).getTime() : NaN;
      if (createdAt >= start && createdAt <= end) {
        count += 1;
        revenue += Number(row.price) || 0;
      }
    }
    stats[event.id] = { count, revenue };
  }

  return stats;
};
