import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocateMyBookItemPrices, calculateMyBookPrice, MY_BOOK_MIN_PAYMENT } from './pricing';

const songs = (count: number, price = 3000, ownedCount = 0) =>
  Array.from({ length: count }, (_, i) => ({ listPrice: price, isOwned: i < ownedCount }));

test('9곡은 최소 곡 수 미달, 할인 없음', () => {
  const r = calculateMyBookPrice(songs(9));
  assert.equal(r.meetsMinimum, false);
  assert.equal(r.discountPercent, 0);
  assert.deepEqual(r.nextTier, { minSongs: 10, percent: 20, songsNeeded: 1 });
});

test('구간 경계값', () => {
  const cases: Array<[number, number, number]> = [
    [10, 20, 24000],
    [19, 20, 45600],
    [20, 30, 42000],
    [23, 30, 48300],
    [29, 30, 60900],
    [30, 40, 54000],
    [49, 40, 88200],
    [50, 50, 75000],
    [100, 50, 150000],
  ];
  for (const [count, percent, price] of cases) {
    const r = calculateMyBookPrice(songs(count));
    assert.equal(r.discountPercent, percent, `${count}곡 할인율`);
    assert.equal(r.finalPrice, price, `${count}곡 금액`);
    assert.equal(r.meetsMinimum, true);
  }
});

test('50곡 이상이면 다음 구간 없음, 100곡 초과는 표시', () => {
  assert.equal(calculateMyBookPrice(songs(50)).nextTier, null);
  assert.equal(calculateMyBookPrice(songs(101)).exceedsMaximum, true);
});

test('이미 구매한 곡은 0원, 할인율은 전체 곡 수 기준', () => {
  const r = calculateMyBookPrice(songs(20, 3000, 5));
  assert.equal(r.ownedCount, 5);
  assert.equal(r.listTotal, 60000);
  assert.equal(r.payableListTotal, 45000);
  assert.equal(r.discountPercent, 30);
  assert.equal(r.finalPrice, 31500);
  assert.equal(r.discountAmount, 13500);
});

test('최소 결제금액 적용', () => {
  const allOwned = calculateMyBookPrice(songs(12, 3000, 12));
  assert.equal(allOwned.finalPrice, MY_BOOK_MIN_PAYMENT);
  assert.equal(allOwned.minPaymentApplied, true);

  const mostlyOwned = calculateMyBookPrice(songs(10, 3000, 8));
  assert.equal(mostlyOwned.finalPrice, MY_BOOK_MIN_PAYMENT);
});

test('100원 단위 내림', () => {
  const r = calculateMyBookPrice([...songs(9), { listPrice: 3550 }]);
  // (27000 + 3550) * 0.8 = 24440 → 24400
  assert.equal(r.finalPrice, 24400);
});

test('곡별 결제 금액 나누기: 합계는 결제 금액과 같다', () => {
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

  const even = allocateMyBookItemPrices(49700, Array(23).fill(3000));
  assert.equal(even.length, 23);
  assert.equal(sum(even), 49700);
  assert.ok(Math.max(...even) - Math.min(...even) <= 1);

  const mixed = allocateMyBookItemPrices(24400, [...Array(9).fill(3000), 3550]);
  assert.equal(sum(mixed), 24400);
  assert.ok(mixed[9] > mixed[0]);

  assert.deepEqual(allocateMyBookItemPrices(1000, [0, 0]), [500, 500]);
  assert.deepEqual(allocateMyBookItemPrices(5000, []), []);
});
