/**
 * 나만의 악보집 금액 계산. 화면 표시와 서버 주문 생성이 같은 함수를 사용한다.
 * 할인율은 담은 곡 수(이미 구매한 곡 포함)로 정하고, 이미 구매한 곡은 0원으로 계산한다.
 */

export const MY_BOOK_MIN_SONGS = 10;
export const MY_BOOK_MAX_SONGS = 100;
/** 이미 구매한 곡만으로 만드는 경우에도 받는 최소 편집비 */
export const MY_BOOK_MIN_PAYMENT = 5000;
export const MY_BOOK_TITLE_MAX_LENGTH = 40;
export const MY_BOOK_MEMO_MAX_LENGTH = 500;
export const MY_BOOK_COVER_MAX_BYTES = 10 * 1024 * 1024;
export const MY_BOOK_COVER_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf'] as const;

/** 곡 수가 많은 구간부터 정렬 */
export const MY_BOOK_DISCOUNT_TIERS: ReadonlyArray<{ minSongs: number; percent: number }> = [
  { minSongs: 50, percent: 50 },
  { minSongs: 30, percent: 40 },
  { minSongs: 20, percent: 30 },
  { minSongs: 10, percent: 20 },
];

export const MY_BOOK_MAX_DISCOUNT_PERCENT = MY_BOOK_DISCOUNT_TIERS[0].percent;

export interface MyBookPriceItem {
  listPrice: number;
  isOwned?: boolean;
}

export interface MyBookPriceResult {
  songCount: number;
  ownedCount: number;
  /** 담은 곡 전체의 정가 합계 */
  listTotal: number;
  /** 이미 구매한 곡을 뺀 정가 합계 (할인 전 결제 대상 금액) */
  payableListTotal: number;
  discountPercent: number;
  discountAmount: number;
  finalPrice: number;
  minPaymentApplied: boolean;
  meetsMinimum: boolean;
  exceedsMaximum: boolean;
  nextTier: { minSongs: number; percent: number; songsNeeded: number } | null;
}

export function getMyBookDiscountPercent(songCount: number): number {
  const tier = MY_BOOK_DISCOUNT_TIERS.find((t) => songCount >= t.minSongs);
  return tier?.percent ?? 0;
}

export function calculateMyBookPrice(items: ReadonlyArray<MyBookPriceItem>): MyBookPriceResult {
  const songCount = items.length;
  const ownedCount = items.filter((item) => item.isOwned).length;
  const toPrice = (value: number) => Math.max(0, Math.round(Number(value) || 0));

  const listTotal = items.reduce((sum, item) => sum + toPrice(item.listPrice), 0);
  const payableListTotal = items.reduce(
    (sum, item) => sum + (item.isOwned ? 0 : toPrice(item.listPrice)),
    0
  );

  const meetsMinimum = songCount >= MY_BOOK_MIN_SONGS;
  const exceedsMaximum = songCount > MY_BOOK_MAX_SONGS;
  const discountPercent = getMyBookDiscountPercent(songCount);

  // 정수 연산으로 100원 단위 내림 (부동소수점 오차 방지)
  const discounted = Math.floor((payableListTotal * (100 - discountPercent)) / 10000) * 100;
  const discountAmount = payableListTotal - discounted;
  const minPaymentApplied = meetsMinimum && discounted < MY_BOOK_MIN_PAYMENT;
  const finalPrice = minPaymentApplied ? MY_BOOK_MIN_PAYMENT : discounted;

  const upcoming = [...MY_BOOK_DISCOUNT_TIERS]
    .reverse()
    .find((t) => t.minSongs > songCount);
  const nextTier = upcoming
    ? { minSongs: upcoming.minSongs, percent: upcoming.percent, songsNeeded: upcoming.minSongs - songCount }
    : null;

  return {
    songCount,
    ownedCount,
    listTotal,
    payableListTotal,
    discountPercent,
    discountAmount,
    finalPrice,
    minPaymentApplied,
    meetsMinimum,
    exceedsMaximum,
    nextTier,
  };
}

/**
 * 결제 금액을 곡별 정가 비율로 나눈다. 합계는 항상 total 과 같다 (구매내역에 곡별 결제 금액으로 남긴다).
 */
export function allocateMyBookItemPrices(total: number, listPrices: ReadonlyArray<number>): number[] {
  const amount = Math.max(0, Math.round(Number(total) || 0));
  if (listPrices.length === 0) return [];

  const weights = listPrices.map((price) => Math.max(0, Math.round(Number(price) || 0)));
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  const shares =
    weightSum > 0
      ? weights.map((w) => Math.floor((amount * w) / weightSum))
      : weights.map(() => Math.floor(amount / weights.length));

  let remainder = amount - shares.reduce((sum, s) => sum + s, 0);
  for (let i = 0; remainder > 0; i = (i + 1) % shares.length) {
    shares[i] += 1;
    remainder -= 1;
  }
  return shares;
}

export function getCoverExtension(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return (MY_BOOK_COVER_EXTENSIONS as readonly string[]).includes(ext) ? ext : null;
}
