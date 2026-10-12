'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  fetchPublicEventDiscounts,
  getEventStatus,
  type EventDiscountSheet,
} from '@/lib/eventDiscounts';

interface EventSalesSnapshot {
  events: EventDiscountSheet[];
  loaded: boolean;
}

const CACHE_TTL_MS = 60 * 1000;
/** setTimeout 최대 지연(약 24.8일)을 넘지 않도록 상한을 둔다 */
const MAX_TIMER_DELAY_MS = 6 * 60 * 60 * 1000;

const EMPTY_SNAPSHOT: EventSalesSnapshot = { events: [], loaded: false };
let snapshot: EventSalesSnapshot = EMPTY_SNAPSHOT;
let fetchedAt = 0;
let inflight: Promise<void> | null = null;
let focusListenerAttached = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

/** 진행 중·예정 이벤트를 다시 불러온다 (TTL 안이면 캐시 사용) */
export const refreshEventSales = (force = false): Promise<void> => {
  if (inflight) return inflight;
  if (!force && snapshot.loaded && Date.now() - fetchedAt < CACHE_TTL_MS) {
    return Promise.resolve();
  }

  inflight = fetchPublicEventDiscounts()
    .then((events) => {
      snapshot = { events, loaded: true };
      fetchedAt = Date.now();
    })
    .catch(() => {
      snapshot = { events: snapshot.events, loaded: true };
    })
    .finally(() => {
      inflight = null;
      emit();
    });

  return inflight;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (!focusListenerAttached && typeof window !== 'undefined') {
    focusListenerAttached = true;
    // 다른 탭에 있다 돌아온 손님에게 새 특가를 바로 보여준다
    window.addEventListener('focus', () => void refreshEventSales());
  }
  return () => {
    listeners.delete(listener);
  };
};

const nextBoundary = (events: EventDiscountSheet[], now: number) => {
  let next: number | null = null;
  for (const event of events) {
    for (const value of [event.event_start, event.event_end]) {
      const time = new Date(value).getTime();
      if (time > now && (next === null || time < next)) next = time;
    }
  }
  return next;
};

export function useEventSales() {
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY_SNAPSHOT,
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void refreshEventSales();
  }, []);

  // 시작·종료 시각이 지나면 다시 렌더링해 상태(진행 중/예정/종료)를 갱신한다
  useEffect(() => {
    const boundary = nextBoundary(state.events, now);
    if (boundary === null) return;
    const delay = Math.min(Math.max(boundary - Date.now() + 500, 500), MAX_TIMER_DELAY_MS);
    const timer = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [state.events, now]);

  return useMemo(() => {
    const active: EventDiscountSheet[] = [];
    const scheduled: EventDiscountSheet[] = [];
    for (const event of state.events) {
      const status = getEventStatus(event, now);
      if (status === 'active') active.push(event);
      else if (status === 'scheduled') scheduled.push(event);
    }
    scheduled.sort((a, b) => a.event_start.localeCompare(b.event_start));
    const activeBySheetId = new Map(active.map((event) => [event.sheet_id, event]));

    return {
      loaded: state.loaded,
      active,
      scheduled,
      hasActive: active.length > 0,
      hasAny: active.length + scheduled.length > 0,
      getActiveEvent: (sheetId: string | null | undefined) =>
        sheetId ? activeBySheetId.get(sheetId) ?? null : null,
      getScheduledEvent: (sheetId: string | null | undefined) =>
        sheetId ? scheduled.find((event) => event.sheet_id === sheetId) ?? null : null,
    };
  }, [state, now]);
}
