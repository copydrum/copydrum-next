/** 이벤트 할인가 하한 (DB 트리거 normalize_event_discount_sheet 와 동일) */
export const EVENT_MIN_PRICE = 1000;
export const EVENT_PRICE_UNIT = 100;
export const EVENT_DEFAULT_PERCENT = 50;
export const EVENT_PERCENT_PRESETS = [30, 40, 50, 60, 70] as const;
/** 결제 도중 이벤트가 끝나도 이 시간 동안은 할인가 주문을 허용한다 (서버 검증 기준) */
export const EVENT_CHECKOUT_GRACE_MS = 10 * 60 * 1000;

export const EVENT_PRICE_EXPIRED_MESSAGE =
  '특가 이벤트가 종료되어 가격이 변경되었습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요. (The sale has ended. Please refresh the page and try again.)';

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
  slug?: string | null;
  sheet_is_active?: boolean | null;
  sales_type?: 'INSTANT' | 'PREORDER' | null;
  title_translations?: Record<string, string> | null;
  preview_image_url?: string | null;
  youtube_url?: string | null;
  sheet_created_at?: string | null;
}

export interface RemainingTime {
  totalMilliseconds: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * 정가에 할인율을 적용한 이벤트가.
 * 100원 단위 내림, 최저 1,000원. 정가보다 싸지지 않으면 null (이벤트 불가).
 */
export const calculateEventPrice = (price: number, percent: number): number | null => {
  const base = Math.round(Number(price) || 0);
  const rate = Math.min(95, Math.max(1, Math.round(Number(percent) || 0)));
  const discounted = Math.floor((base * (100 - rate)) / 100 / EVENT_PRICE_UNIT) * EVENT_PRICE_UNIT;
  const result = Math.max(EVENT_MIN_PRICE, discounted);
  return result < base ? result : null;
};

/** 현재 악보 정가 기준 할인율 (정수 %) */
export const getEventPercent = (
  event: Pick<EventDiscountSheet, 'discount_price' | 'sheet_price' | 'original_price'>,
) => {
  const base = Number(event.sheet_price ?? event.original_price) || 0;
  if (base <= 0) return 0;
  return Math.max(0, Math.round((1 - event.discount_price / base) * 100));
};

/** 손님이 실제로 내는 금액 (정가가 내려간 경우 더 싼 쪽) */
export const getEventSalePrice = (event: Pick<EventDiscountSheet, 'discount_price' | 'sheet_price'>) => {
  const base = Number(event.sheet_price);
  const discount = Math.max(0, Math.round(Number(event.discount_price) || 0));
  return Number.isFinite(base) && base > 0 ? Math.min(base, discount) : discount;
};

export const getEventStatus = (
  event: Pick<EventDiscountSheet, 'event_start' | 'event_end' | 'is_active'>,
  now: number = Date.now(),
): EventDiscountStatus => {
  if (!event.is_active) return 'disabled';
  if (now < new Date(event.event_start).getTime()) return 'scheduled';
  if (now > new Date(event.event_end).getTime()) return 'ended';
  return 'active';
};

export const isEventActive = (
  event: Pick<EventDiscountSheet, 'event_start' | 'event_end' | 'is_active'> | null | undefined,
  now: number = Date.now(),
): boolean => !!event && getEventStatus(event, now) === 'active';

export const getRemainingTime = (target: string | number | Date, now: number = Date.now()): RemainingTime => {
  const end = target instanceof Date ? target.getTime() : new Date(target).getTime();
  const diff = Math.max(0, end - now);
  const totalSeconds = Math.floor(diff / 1000);
  return {
    totalMilliseconds: diff,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
};

const pad2 = (value: number) => value.toString().padStart(2, '0');

/** HH:MM:SS (일 단위는 호출하는 쪽에서 별도 표기) */
export const formatClock = (value: RemainingTime) =>
  `${pad2(value.hours)}:${pad2(value.minutes)}:${pad2(value.seconds)}`;

export const getEventDisplayTitle = (
  event: Pick<EventDiscountSheet, 'title' | 'title_translations'>,
  language: string,
) => {
  const base = event.title ?? '';
  if (language === 'ko') return base;
  const translations = event.title_translations ?? {};
  return translations[language]?.trim() || translations.en?.trim() || base;
};

const extractYouTubeId = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.replace('/', '') || null;
    if (parsed.searchParams.has('v')) return parsed.searchParams.get('v');
    const match = parsed.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
};

/** 썸네일이 없으면 유튜브 썸네일, 그것도 없으면 null */
export const getEventThumbnail = (
  event: Pick<EventDiscountSheet, 'thumbnail_url' | 'youtube_url'>,
): string | null => {
  if (event.thumbnail_url) return event.thumbnail_url;
  const videoId = extractYouTubeId(event.youtube_url);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
};

/** 고객 화면에 노출 가능한 이벤트인지 (판매 중지 악보·가격 역전 제외) */
export const isSellableEvent = (event: EventDiscountSheet) =>
  event.sheet_is_active !== false &&
  Number(event.sheet_price) > 0 &&
  getEventSalePrice(event) < Number(event.sheet_price);
