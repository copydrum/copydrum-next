import { supabase } from '@/lib/supabase';

export type EventDiscountStatus = 'disabled' | 'scheduled' | 'active' | 'ended';

export interface EventDiscountSheet {
  id: string;
  sheet_id: string;
  original_price: number;
  discount_price: number;
  event_start: string;
  event_end: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  title?: string;
  artist?: string;
  thumbnail_url?: string | null;
  category_id?: string | null;
  sheet_price?: number | null;
  discount_percent?: number | null;
  status: EventDiscountStatus;
}

export interface RemainingTime {
  totalMilliseconds: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export const formatRemainingTime = (value: RemainingTime) => {
  const parts = [
    value.hours.toString().padStart(2, '0'),
    value.minutes.toString().padStart(2, '0'),
    value.seconds.toString().padStart(2, '0'),
  ];
  return parts.join(':');
};

export const getRemainingTime = (event: Pick<EventDiscountSheet, 'event_end'>, now = new Date()): RemainingTime => {
  const end = new Date(event.event_end);
  const diff = Math.max(0, end.getTime() - now.getTime());

  const seconds = Math.floor(diff / 1000);
  const days = Math.floor(seconds / (24 * 3600));
  const hours = Math.floor((seconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return {
    totalMilliseconds: diff,
    days,
    hours,
    minutes,
    seconds: remainingSeconds,
  };
};

export const isEventActive = (
  event: Pick<EventDiscountSheet, 'event_start' | 'event_end' | 'is_active'> | null,
  referenceDate = new Date()
): boolean => {
  if (!event || !event.is_active) {
    return false;
  }
  const start = new Date(event.event_start);
  const end = new Date(event.event_end);
  const now = referenceDate.getTime();
  return now >= start.getTime() && now <= end.getTime();
};

export const fetchEventDiscountBySheetId = async (sheetId: string) => {
  const { data, error } = await supabase
    .from('event_discount_sheet_view')
    .select('*')
    .eq('sheet_id', sheetId)
    .maybeSingle();

  if (error) {
    console.error('이벤트 할인 악보 조회 오류:', error);
    throw error;
  }

  return data as EventDiscountSheet | null;
};

export const fetchEventDiscountById = async (eventId: string) => {
  const { data, error } = await supabase
    .from('event_discount_sheet_view')
    .select('*')
    .eq('id', eventId)
    .maybeSingle();

  if (error) {
    console.error('이벤트 할인 악보 상세 조회 오류:', error);
    throw error;
  }

  return data as EventDiscountSheet | null;
};

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

export type EventDiscountMap = Record<string, EventDiscountSheet>;

export const buildEventDiscountMap = (events: EventDiscountSheet[], referenceDate = new Date()): EventDiscountMap => {
  return events.reduce<EventDiscountMap>((acc, event) => {
    if (isEventActive(event, referenceDate)) {
      acc[event.sheet_id] = event;
    }
    return acc;
  }, {});
};

export const fetchActiveEventDiscounts = async () => {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('event_discount_sheet_view')
    .select('*')
    .eq('is_active', true)
    .lte('event_start', nowIso)
    .gte('event_end', nowIso);

  if (error) {
    console.error('이벤트 할인 악보 목록 조회 오류:', error);
    throw error;
  }

  return (data || []) as EventDiscountSheet[];
};

export const purchaseEventDiscount = async (event: EventDiscountSheet) => {
  if (!isEventActive(event)) {
    throw new Error('이미 종료되었거나 비활성화된 이벤트입니다.');
  }

  try {
    // 실제 결제 로직은 백엔드 API와 연동되어야 합니다.
    // 현재는 결제 API가 준비되지 않았으므로 모의 결제 처리로 대체합니다.
    console.log('이벤트 할인 악보 결제 시도:', {
      eventId: event.id,
      sheetId: event.sheet_id,
      amount: event.discount_price,
    });

    await new Promise((resolve) => setTimeout(resolve, 600));

    return {
      success: true,
      message: '결제가 완료되었습니다.',
      orderId: `event-order-${Date.now()}`,
    };
  } catch (error) {
    console.error('이벤트 할인 악보 결제 오류:', error);
    throw error;
  }
};

export const upsertEventDiscountSheet = async (payload: {
  id?: string;
  sheet_id: string;
  discount_price?: number;
  original_price?: number | null;
  event_start: string;
  event_end: string;
  is_active?: boolean;
}) => {
  const { data, error } = await supabase
    .from('event_discount_sheets')
    .upsert(payload, { onConflict: 'sheet_id' })
    .select()
    .single();

  if (error) {
    console.error('이벤트 할인 악보 저장 오류:', error);
    throw error;
  }

  return data as EventDiscountSheet;
};

export const deleteEventDiscountById = async (id: string) => {
  const { error } = await supabase
    .from('event_discount_sheets')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('이벤트 할인 악보 삭제 오류:', error);
    throw error;
  }
};

