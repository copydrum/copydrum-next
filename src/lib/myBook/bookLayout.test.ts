import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBookLayout,
  getTocPageCount,
  splitTocRows,
  TOC_ROWS_FIRST_PAGE,
  TOC_ROWS_NEXT_PAGE,
} from './bookLayout';

const songs = (pageCounts: number[]) => pageCounts.map((pageCount) => ({ pageCount }));

test('목차 페이지 수는 첫 페이지 22줄, 이후 28줄 기준', () => {
  assert.equal(getTocPageCount(1), 1);
  assert.equal(getTocPageCount(TOC_ROWS_FIRST_PAGE), 1);
  assert.equal(getTocPageCount(TOC_ROWS_FIRST_PAGE + 1), 2);
  assert.equal(getTocPageCount(TOC_ROWS_FIRST_PAGE + TOC_ROWS_NEXT_PAGE), 2);
  assert.equal(getTocPageCount(TOC_ROWS_FIRST_PAGE + TOC_ROWS_NEXT_PAGE + 1), 3);
  assert.equal(getTocPageCount(100), 4);
});

test('목차 줄 나누기는 모든 곡을 순서대로 한 번씩 포함', () => {
  const pages = splitTocRows(100);
  assert.equal(pages.length, getTocPageCount(100));
  assert.equal(pages[0].length, TOC_ROWS_FIRST_PAGE);
  assert.deepEqual(pages.flat(), Array.from({ length: 100 }, (_, i) => i));
});

test('곡 시작 페이지: 표지(1), 안쪽 표지(2), 목차(3) 다음부터', () => {
  const layout = calculateBookLayout(songs([2, 4, 1]));
  assert.equal(layout.tocStartPage, 3);
  assert.equal(layout.tocPageCount, 1);
  assert.deepEqual(layout.songStartPages, [4, 6, 10]);
  assert.equal(layout.totalPages, 10);
});

test('목차가 여러 장이면 곡 시작 페이지도 밀린다', () => {
  const layout = calculateBookLayout(songs(Array.from({ length: 30 }, () => 2)));
  assert.equal(layout.tocPageCount, 2);
  assert.equal(layout.songStartPages[0], 5);
  assert.equal(layout.songStartPages[29], 5 + 29 * 2);
  assert.equal(layout.totalPages, 4 + 60);
});

test('페이지 수가 0 이하로 잘못 들어와도 최소 1페이지로 계산', () => {
  const layout = calculateBookLayout(songs([0, 3]));
  assert.deepEqual(layout.songStartPages, [4, 5]);
  assert.equal(layout.totalPages, 7);
});
