'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  EVENT_DEFAULT_PERCENT,
  EVENT_MIN_PRICE,
  EVENT_PERCENT_PRESETS,
  calculateEventPrice,
  deleteEventDiscountById,
  fetchEventDiscountList,
  fetchEventSalesStats,
  getEventPercent,
  getEventStatus,
  getEventThumbnail,
  updateEventDiscount,
  upsertEventDiscountSheets,
  type EventDiscountSheet,
  type EventDiscountStatus,
  type EventSalesStat,
} from '../../lib/eventDiscounts';
import { convertFromKrw, formatCurrency as formatMoney } from '../../lib/currency';
import { generateDefaultThumbnail } from '../../lib/defaultThumbnail';
import { refreshEventSales } from '../../hooks/useEventSales';
import EventCountdown from '../event-sale/EventCountdown';

interface SheetCandidate {
  id: string;
  title: string;
  artist: string;
  price: number;
  thumbnail_url: string | null;
  youtube_url: string | null;
  created_at: string;
}

type FilterKey = 'active' | 'scheduled' | 'ended' | 'disabled' | 'all';
type StartMode = 'now' | 'custom';

const HOUR = 60 * 60 * 1000;
const DURATION_PRESETS = [
  { label: '24시간', hours: 24 },
  { label: '48시간', hours: 48 },
  { label: '3일', hours: 72 },
  { label: '7일', hours: 168 },
];

const STATUS_META: Record<EventDiscountStatus, { label: string; className: string }> = {
  active: { label: '진행 중', className: 'bg-red-100 text-red-700' },
  scheduled: { label: '예정', className: 'bg-amber-100 text-amber-700' },
  ended: { label: '종료', className: 'bg-gray-100 text-gray-600' },
  disabled: { label: '비활성', className: 'bg-gray-200 text-gray-500' },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'active', label: '진행 중' },
  { key: 'scheduled', label: '예정' },
  { key: 'ended', label: '종료' },
  { key: 'disabled', label: '비활성' },
  { key: 'all', label: '전체' },
];

const SHEET_FIELDS = 'id, title, artist, price, thumbnail_url, youtube_url, created_at';

const krw = (value: number | null | undefined) => `₩${Math.round(value ?? 0).toLocaleString()}`;

const toLocalInput = (value: string | number | Date) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const fromLocalInput = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

/** 관리자 미리보기용 해외 표시가 */
const foreignPrices = (price: number) => [
  { label: 'USD', value: formatMoney(convertFromKrw(price, 'USD', 'en'), 'USD') },
  { label: 'USD(할인권역)', value: formatMoney(convertFromKrw(price, 'USD', 'vi'), 'USD') },
  { label: 'EUR', value: formatMoney(convertFromKrw(price, 'EUR', 'de'), 'EUR') },
];

/** 예전 100원 이벤트처럼 지금 규칙(1,000원 이상)에 맞지 않는 기록 */
const isLegacyEvent = (event: EventDiscountSheet) => Number(event.discount_price) < EVENT_MIN_PRICE;

export default function EventDiscountManagement() {
  const [events, setEvents] = useState<EventDiscountSheet[]>([]);
  const [stats, setStats] = useState<Record<string, EventSalesStat>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('active');
  const [listSearch, setListSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // 등록 폼
  const [formOpen, setFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventDiscountSheet | null>(null);
  const [selected, setSelected] = useState<SheetCandidate[]>([]);
  const [recentSheets, setRecentSheets] = useState<SheetCandidate[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SheetCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [percent, setPercent] = useState<number>(EVENT_DEFAULT_PERCENT);
  const [startMode, setStartMode] = useState<StartMode>('now');
  const [customStart, setCustomStart] = useState(() => toLocalInput(Date.now()));
  const [durationHours, setDurationHours] = useState<number | null>(48);
  const [customEnd, setCustomEnd] = useState(() => toLocalInput(Date.now() + 48 * HOUR));
  const [activateNow, setActivateNow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchEventDiscountList();
      setEvents(list);
      setNow(Date.now());
      setStats(await fetchEventSalesStats(list));
    } catch (error) {
      console.error(error);
      alert('타임특가 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  // 상태 배지(진행 중→종료 등)가 시간이 지나면 바뀌도록 30초마다 다시 계산
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const eventBySheetId = useMemo(() => new Map(events.map((event) => [event.sheet_id, event])), [events]);

  const withStatus = useMemo(
    () => events.map((event) => ({ event, status: getEventStatus(event, now) })),
    [events, now],
  );

  const counts = useMemo(() => {
    const result: Record<FilterKey, number> = { active: 0, scheduled: 0, ended: 0, disabled: 0, all: events.length };
    withStatus.forEach(({ status }) => {
      result[status] += 1;
    });
    return result;
  }, [withStatus, events.length]);

  const totals = useMemo(
    () =>
      Object.values(stats).reduce(
        (acc, stat) => ({ count: acc.count + stat.count, revenue: acc.revenue + stat.revenue }),
        { count: 0, revenue: 0 },
      ),
    [stats],
  );

  const visible = useMemo(() => {
    const keyword = listSearch.trim().toLowerCase();
    const rows = withStatus.filter(({ event, status }) => {
      if (filter !== 'all' && status !== filter) return false;
      if (!keyword) return true;
      return (
        (event.title ?? '').toLowerCase().includes(keyword) ||
        (event.artist ?? '').toLowerCase().includes(keyword)
      );
    });
    const order: Record<EventDiscountStatus, number> = { active: 0, scheduled: 1, disabled: 2, ended: 3 };
    return rows.sort((a, b) => {
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      if (a.status === 'active') return a.event.event_end.localeCompare(b.event.event_end);
      if (a.status === 'scheduled') return a.event.event_start.localeCompare(b.event.event_start);
      return b.event.event_end.localeCompare(a.event.event_end);
    });
  }, [withStatus, filter, listSearch]);

  // ─── 폼 ──────────────────────────────────────────────

  const loadRecentSheets = useCallback(async () => {
    const { data, error } = await supabase
      .from('drum_sheets')
      .select(SHEET_FIELDS)
      .eq('is_active', true)
      .gt('price', EVENT_MIN_PRICE)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) {
      console.error('최근 악보 조회 오류:', error);
      return;
    }
    setRecentSheets((data || []) as SheetCandidate[]);
  }, []);

  const resetForm = () => {
    setEditingEvent(null);
    setSelected([]);
    setSearchTerm('');
    setSearchResults(null);
    setPercent(EVENT_DEFAULT_PERCENT);
    setStartMode('now');
    setCustomStart(toLocalInput(Date.now()));
    setDurationHours(48);
    setCustomEnd(toLocalInput(Date.now() + 48 * HOUR));
    setActivateNow(true);
    setFormError(null);
  };

  const openCreateForm = (preset?: SheetCandidate) => {
    resetForm();
    if (preset) setSelected([preset]);
    setFormOpen(true);
    if (recentSheets.length === 0) void loadRecentSheets();
  };

  const openEditForm = (event: EventDiscountSheet) => {
    resetForm();
    setEditingEvent(event);
    setSelected([
      {
        id: event.sheet_id,
        title: event.title ?? '',
        artist: event.artist ?? '',
        price: Number(event.sheet_price) || 0,
        thumbnail_url: event.thumbnail_url ?? null,
        youtube_url: event.youtube_url ?? null,
        created_at: event.sheet_created_at ?? event.created_at,
      },
    ]);
    setPercent(getEventPercent(event) || EVENT_DEFAULT_PERCENT);
    const startsLater = new Date(event.event_start).getTime() > Date.now();
    setStartMode(startsLater ? 'custom' : 'now');
    setCustomStart(toLocalInput(event.event_start));
    setDurationHours(null);
    setCustomEnd(toLocalInput(event.event_end));
    setActivateNow(event.is_active);
    setFormOpen(true);
  };

  /** 종료된 특가를 같은 악보로 다시 여는 경우: 기간만 새로 잡는다 */
  const openRerunForm = (event: EventDiscountSheet) => {
    openCreateForm({
      id: event.sheet_id,
      title: event.title ?? '',
      artist: event.artist ?? '',
      price: Number(event.sheet_price) || 0,
      thumbnail_url: event.thumbnail_url ?? null,
      youtube_url: event.youtube_url ?? null,
      created_at: event.sheet_created_at ?? event.created_at,
    });
    if (!isLegacyEvent(event)) setPercent(getEventPercent(event) || EVENT_DEFAULT_PERCENT);
  };

  const closeForm = () => {
    setFormOpen(false);
    resetForm();
  };

  const runSearch = async () => {
    const keyword = searchTerm.trim();
    if (!keyword) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const escaped = keyword.replace(/[%_,()]/g, ' ');
      const { data, error } = await supabase
        .from('drum_sheets')
        .select(SHEET_FIELDS)
        .eq('is_active', true)
        .or(`title.ilike.%${escaped}%,artist.ilike.%${escaped}%`)
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) throw error;
      setSearchResults((data || []) as SheetCandidate[]);
    } catch (error) {
      console.error('악보 검색 오류:', error);
      alert('악보 검색 중 오류가 발생했습니다.');
    } finally {
      setSearching(false);
    }
  };

  const toggleSelect = (sheet: SheetCandidate) => {
    setSelected((prev) =>
      prev.some((item) => item.id === sheet.id) ? prev.filter((item) => item.id !== sheet.id) : [...prev, sheet],
    );
  };

  const periodStartMs = startMode === 'now' ? now : new Date(customStart).getTime();
  const periodEndMs =
    durationHours !== null ? periodStartMs + durationHours * HOUR : new Date(customEnd).getTime();
  const periodValid = Number.isFinite(periodStartMs) && Number.isFinite(periodEndMs) && periodEndMs > periodStartMs;

  const previewRows = selected.map((sheet) => ({
    sheet,
    salePrice: calculateEventPrice(sheet.price, percent),
    existing: editingEvent ? null : eventBySheetId.get(sheet.id) ?? null,
  }));
  const sellableRows = previewRows.filter((row) => row.salePrice !== null);

  const handleSave = async () => {
    setFormError(null);
    if (selected.length === 0) {
      setFormError('특가로 등록할 악보를 선택해 주세요.');
      return;
    }
    if (!periodValid) {
      setFormError('종료 시각은 시작 시각보다 뒤여야 합니다.');
      return;
    }
    if (periodEndMs <= Date.now()) {
      setFormError('종료 시각이 이미 지났습니다.');
      return;
    }
    if (sellableRows.length === 0) {
      setFormError('선택한 악보 모두 정가가 낮아 할인할 수 없습니다. (특가는 1,000원 이상, 정가보다 낮아야 합니다)');
      return;
    }

    const skipped = previewRows.length - sellableRows.length;
    const overwritten = sellableRows.filter((row) => row.existing && getEventStatus(row.existing, Date.now()) !== 'ended');
    const confirmLines = [
      `${sellableRows.length}곡을 ${percent}% 할인으로 ${editingEvent ? '수정' : '등록'}합니다.`,
      `기간: ${formatDateTime(new Date(periodStartMs).toISOString())} ~ ${formatDateTime(new Date(periodEndMs).toISOString())}`,
      skipped > 0 ? `· 정가가 낮아 할인할 수 없는 ${skipped}곡은 제외됩니다.` : '',
      overwritten.length > 0 ? `· 진행 중/예정인 기존 특가 ${overwritten.length}건을 새 조건으로 덮어씁니다.` : '',
      activateNow ? '' : '· 비활성 상태로 저장되어 고객에게 보이지 않습니다.',
    ].filter(Boolean);
    if (!window.confirm(confirmLines.join('\n'))) return;

    const startIso =
      startMode === 'now'
        ? editingEvent && new Date(editingEvent.event_start).getTime() <= Date.now()
          ? editingEvent.event_start
          : new Date().toISOString()
        : fromLocalInput(customStart);
    const endIso = new Date(periodEndMs).toISOString();
    if (!startIso) {
      setFormError('시작 시각을 확인해 주세요.');
      return;
    }

    setSaving(true);
    try {
      await upsertEventDiscountSheets(
        sellableRows.map((row) => ({
          sheet_id: row.sheet.id,
          discount_price: row.salePrice as number,
          event_start: startIso,
          event_end: endIso,
          is_active: activateNow,
        })),
      );
      closeForm();
      await loadEvents();
      void refreshEventSales(true);
      setFilter(activateNow ? (startMode === 'now' ? 'active' : 'scheduled') : 'disabled');
    } catch (error) {
      const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
      setFormError(message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // ─── 목록 빠른 작업 ─────────────────────────────────────

  const runAction = async (event: EventDiscountSheet, action: () => Promise<void>, confirmMessage?: string) => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setBusyId(event.id);
    try {
      await action();
      await loadEvents();
      void refreshEventSales(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
      alert(message || '처리 중 오류가 발생했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const endNow = (event: EventDiscountSheet) =>
    runAction(
      event,
      () => updateEventDiscount(event.id, { event_end: new Date().toISOString() }),
      `"${event.title}" 특가를 지금 종료할까요?\n종료 즉시 정가로 판매됩니다.`,
    );

  const extend24h = (event: EventDiscountSheet) =>
    runAction(event, () =>
      updateEventDiscount(event.id, {
        event_end: new Date(Math.max(new Date(event.event_end).getTime(), Date.now()) + 24 * HOUR).toISOString(),
      }),
    );

  const startNow = (event: EventDiscountSheet) =>
    runAction(
      event,
      () => updateEventDiscount(event.id, { event_start: new Date().toISOString() }),
      `"${event.title}" 특가를 지금 바로 시작할까요?`,
    );

  const toggleActive = (event: EventDiscountSheet) =>
    runAction(
      event,
      () => updateEventDiscount(event.id, { is_active: !event.is_active }),
      event.is_active ? `"${event.title}" 특가를 비활성화할까요?\n고객 화면에서 바로 사라집니다.` : undefined,
    );

  const remove = (event: EventDiscountSheet) =>
    runAction(
      event,
      () => deleteEventDiscountById(event.id),
      `"${event.title}" 특가 기록을 삭제할까요?\n판매 실적 집계에서도 빠집니다.`,
    );

  // ─── 렌더링 ────────────────────────────────────────────

  const renderActions = (event: EventDiscountSheet, status: EventDiscountStatus) => {
    const busy = busyId === event.id;
    const btn =
      'inline-flex items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50';
    const legacy = isLegacyEvent(event);
    return (
      <div className="flex flex-wrap gap-1.5">
        {status === 'active' && (
          <>
            <button type="button" disabled={busy} onClick={() => void extend24h(event)} className={`${btn} border-gray-200 text-gray-700 hover:bg-gray-50`}>
              <i className="ri-add-line" />24시간
            </button>
            <button type="button" disabled={busy} onClick={() => void endNow(event)} className={`${btn} border-red-200 text-red-600 hover:bg-red-50`}>
              <i className="ri-stop-circle-line" />즉시 종료
            </button>
          </>
        )}
        {status === 'scheduled' && (
          <button type="button" disabled={busy} onClick={() => void startNow(event)} className={`${btn} border-red-200 text-red-600 hover:bg-red-50`}>
            <i className="ri-play-circle-line" />지금 시작
          </button>
        )}
        {(status === 'active' || status === 'scheduled') && (
          <button type="button" disabled={busy} onClick={() => openEditForm(event)} className={`${btn} border-gray-200 text-gray-700 hover:bg-gray-50`}>
            <i className="ri-edit-line" />수정
          </button>
        )}
        {status !== 'ended' && !legacy && (
          <button type="button" disabled={busy} onClick={() => void toggleActive(event)} className={`${btn} border-gray-200 text-gray-700 hover:bg-gray-50`}>
            {event.is_active ? '비활성화' : '활성화'}
          </button>
        )}
        {status === 'ended' && (
          <button type="button" disabled={busy} onClick={() => openRerunForm(event)} className={`${btn} border-blue-200 text-blue-600 hover:bg-blue-50`}>
            <i className="ri-restart-line" />다시 진행
          </button>
        )}
        {status === 'disabled' && legacy && (
          <button type="button" disabled={busy} onClick={() => openRerunForm(event)} className={`${btn} border-blue-200 text-blue-600 hover:bg-blue-50`}>
            <i className="ri-restart-line" />새 조건으로 진행
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => void remove(event)} className={`${btn} border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-red-600`}>
          <i className="ri-delete-bin-line" />
        </button>
      </div>
    );
  };

  const renderTiming = (event: EventDiscountSheet, status: EventDiscountStatus) => (
    <div className="space-y-0.5 text-xs text-gray-500">
      <div>
        {formatDateTime(event.event_start)} ~ {formatDateTime(event.event_end)}
      </div>
      {status === 'active' && (
        <div className="font-semibold text-red-600">
          종료까지 <EventCountdown target={event.event_end} />
        </div>
      )}
      {status === 'scheduled' && (
        <div className="font-semibold text-amber-600">
          오픈까지 <EventCountdown target={event.event_start} />
        </div>
      )}
    </div>
  );

  const renderPrice = (event: EventDiscountSheet) => {
    const legacy = isLegacyEvent(event);
    return (
      <div className="text-sm">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-red-600">{krw(event.discount_price)}</span>
          <span className="rounded bg-red-50 px-1 text-[11px] font-bold text-red-600">-{getEventPercent(event)}%</span>
        </div>
        <div className="text-xs text-gray-400 line-through">{krw(event.sheet_price ?? event.original_price)}</div>
        {legacy && <div className="mt-0.5 text-[11px] font-semibold text-gray-500">구 100원 이벤트</div>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">타임특가 관리</h2>
          <p className="mt-1 text-sm text-gray-500">
            신곡을 정해진 시간 동안 할인 판매합니다. 특가는 정가의 일정 비율(%)로 정해지며 최소 1,000원, 100원 단위로 내림
            처리됩니다. 1인 구매 제한은 없습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openCreateForm()}
          className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700"
        >
          <i className="ri-add-line text-base" />
          특가 등록
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: '진행 중', value: `${counts.active}건`, tone: 'text-red-600' },
          { label: '예정', value: `${counts.scheduled}건`, tone: 'text-amber-600' },
          { label: '특가 판매 (누적)', value: `${totals.count.toLocaleString()}건`, tone: 'text-gray-900' },
          { label: '특가 매출 (누적)', value: krw(totals.revenue), tone: 'text-gray-900' },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">{card.label}</p>
            <p className={`mt-1 text-lg font-bold sm:text-xl ${card.tone}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {formOpen && (
        <div className="rounded-2xl border border-red-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h3 className="font-bold text-gray-900">{editingEvent ? '특가 수정' : '특가 등록'}</h3>
            <button type="button" onClick={closeForm} className="text-gray-400 hover:text-gray-600" aria-label="닫기">
              <i className="ri-close-line text-xl" />
            </button>
          </div>

          <div className="grid gap-6 p-5 lg:grid-cols-2">
            {/* 1. 악보 선택 */}
            <section className="space-y-3">
              <h4 className="text-sm font-bold text-gray-900">1. 악보 선택 {!editingEvent && <span className="font-normal text-gray-500">(여러 곡 동시 등록 가능)</span>}</h4>
              {editingEvent ? (
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  {editingEvent.title} · {editingEvent.artist}
                </p>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void runSearch();
                      }}
                      placeholder="제목 또는 아티스트 검색"
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void runSearch()}
                      disabled={searching}
                      className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {searching ? '검색 중' : '검색'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    {searchResults === null ? '최근 등록된 악보 (정가 1,000원 초과)' : `검색 결과 ${searchResults.length}곡`}
                    {searchResults !== null && (
                      <button type="button" onClick={() => { setSearchResults(null); setSearchTerm(''); }} className="ml-2 text-blue-600 underline">
                        최근 악보 보기
                      </button>
                    )}
                  </p>
                  <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
                    {(searchResults ?? recentSheets).map((sheet) => {
                      const checked = selected.some((item) => item.id === sheet.id);
                      const existing = eventBySheetId.get(sheet.id);
                      const existingStatus = existing ? getEventStatus(existing, now) : null;
                      const sale = calculateEventPrice(sheet.price, percent);
                      return (
                        <label key={sheet.id} className={`flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50 ${checked ? 'bg-red-50/60' : ''}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleSelect(sheet)} className="h-4 w-4 accent-red-600" />
                          <img
                            src={getEventThumbnail(sheet) || generateDefaultThumbnail(80, 80)}
                            alt=""
                            className="h-10 w-10 flex-shrink-0 rounded object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-gray-900">{sheet.title}</p>
                            <p className="truncate text-xs text-gray-500">
                              {sheet.artist} · {new Date(sheet.created_at).toLocaleDateString('ko-KR')}
                            </p>
                          </div>
                          <div className="flex-shrink-0 text-right text-xs">
                            <div className="text-gray-500">{krw(sheet.price)}</div>
                            {sale ? <div className="font-bold text-red-600">{krw(sale)}</div> : <div className="text-gray-400">할인 불가</div>}
                            {existingStatus && existingStatus !== 'ended' && (
                              <div className="text-[10px] font-semibold text-amber-600">{STATUS_META[existingStatus].label} 특가 있음</div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                    {(searchResults ?? recentSheets).length === 0 && (
                      <p className="px-3 py-6 text-center text-sm text-gray-400">표시할 악보가 없습니다.</p>
                    )}
                  </div>
                </>
              )}
            </section>

            {/* 2~3. 할인율·기간 */}
            <section className="space-y-5">
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-gray-900">2. 할인율</h4>
                <div className="flex flex-wrap items-center gap-2">
                  {EVENT_PERCENT_PRESETS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPercent(value)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                        percent === value ? 'border-red-600 bg-red-600 text-white' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {value}%
                    </button>
                  ))}
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={95}
                      value={percent}
                      onChange={(e) => setPercent(Math.min(95, Math.max(1, Number(e.target.value) || 1)))}
                      className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-bold text-gray-900">3. 기간</h4>
                <div className="flex flex-wrap gap-2">
                  {(['now', 'custom'] as StartMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setStartMode(mode)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                        startMode === mode ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {mode === 'now' ? (editingEvent && new Date(editingEvent.event_start).getTime() <= Date.now() ? '시작 시각 유지' : '지금 바로 시작') : '시작 시각 지정'}
                    </button>
                  ))}
                </div>
                {startMode === 'custom' && (
                  <input
                    type="datetime-local"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm sm:w-auto"
                  />
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {DURATION_PRESETS.map((preset) => (
                    <button
                      key={preset.hours}
                      type="button"
                      onClick={() => setDurationHours(preset.hours)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                        durationHours === preset.hours ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setCustomEnd(toLocalInput(periodValid ? periodEndMs : Date.now() + 48 * HOUR));
                      setDurationHours(null);
                    }}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                      durationHours === null ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    종료 시각 지정
                  </button>
                </div>
                {durationHours === null && (
                  <input
                    type="datetime-local"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm sm:w-auto"
                  />
                )}
                <p className={`text-xs ${periodValid ? 'text-gray-500' : 'text-red-600'}`}>
                  {periodValid
                    ? `${formatDateTime(new Date(periodStartMs).toISOString())} ~ ${formatDateTime(new Date(periodEndMs).toISOString())} (${Math.round((periodEndMs - periodStartMs) / HOUR)}시간)`
                    : '종료 시각은 시작 시각보다 뒤여야 합니다.'}
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={activateNow} onChange={(e) => setActivateNow(e.target.checked)} className="h-4 w-4 accent-red-600" />
                저장 후 바로 고객에게 노출
              </label>
            </section>
          </div>

          {/* 4. 미리보기 */}
          {previewRows.length > 0 && (
            <div className="border-t border-gray-100 px-5 py-4">
              <h4 className="mb-2 text-sm font-bold text-gray-900">4. 가격 미리보기 ({sellableRows.length}/{previewRows.length}곡 등록 가능)</h4>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500">
                      <th className="py-1.5 pr-3 font-medium">악보</th>
                      <th className="py-1.5 pr-3 font-medium">정가</th>
                      <th className="py-1.5 pr-3 font-medium">특가</th>
                      <th className="py-1.5 pr-3 font-medium">해외 표시가</th>
                      <th className="py-1.5 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {previewRows.map(({ sheet, salePrice, existing }) => (
                      <tr key={sheet.id}>
                        <td className="py-2 pr-3">
                          <p className="max-w-[220px] truncate font-semibold text-gray-900">{sheet.title}</p>
                          <p className="max-w-[220px] truncate text-xs text-gray-500">{sheet.artist}</p>
                        </td>
                        <td className="py-2 pr-3 text-gray-500">{krw(sheet.price)}</td>
                        <td className="py-2 pr-3">
                          {salePrice ? (
                            <span className="font-bold text-red-600">{krw(salePrice)}</span>
                          ) : (
                            <span className="text-xs text-gray-400">할인 불가 (정가가 너무 낮음)</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-xs text-gray-500">
                          {salePrice
                            ? foreignPrices(salePrice).map((item) => `${item.label} ${item.value}`).join(' · ')
                            : '-'}
                        </td>
                        <td className="py-2 text-right">
                          {existing && getEventStatus(existing, now) !== 'ended' && (
                            <span className="mr-2 text-[11px] font-semibold text-amber-600">기존 특가 덮어씀</span>
                          )}
                          {!editingEvent && (
                            <button type="button" onClick={() => toggleSelect(sheet)} className="text-gray-400 hover:text-red-600" aria-label="선택 해제">
                              <i className="ri-close-circle-line text-lg" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-red-600">{formError}</p>
            <div className="flex gap-2">
              <button type="button" onClick={closeForm} className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 sm:flex-none">
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex-1 rounded-lg bg-red-600 px-5 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60 sm:flex-none"
              >
                {saving ? '저장 중...' : editingEvent ? '수정 저장' : `${sellableRows.length}곡 등록`}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-1 overflow-x-auto">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  filter === item.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {item.label} <span className="opacity-70">{counts[item.key]}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="목록에서 찾기"
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm md:w-56"
            />
            <button type="button" onClick={() => void loadEvents()} className="rounded-lg border border-gray-200 px-3 text-gray-600 hover:bg-gray-50" aria-label="새로고침">
              <i className="ri-refresh-line" />
            </button>
          </div>
        </div>

        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-gray-400">불러오는 중...</p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-400">해당하는 특가가 없습니다.</p>
        ) : (
          <>
            {/* PC */}
            <table className="hidden w-full text-sm lg:table">
              <thead className="whitespace-nowrap bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">악보</th>
                  <th className="px-4 py-2 font-medium">가격</th>
                  <th className="px-4 py-2 font-medium">기간</th>
                  <th className="px-4 py-2 font-medium">판매</th>
                  <th className="px-4 py-2 font-medium">상태</th>
                  <th className="px-4 py-2 font-medium">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map(({ event, status }) => (
                  <tr key={event.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img src={getEventThumbnail(event) || generateDefaultThumbnail(80, 80)} alt="" className="h-11 w-11 flex-shrink-0 rounded object-cover" />
                        <div className="min-w-0">
                          <p className="max-w-[220px] truncate font-semibold text-gray-900">{event.title}</p>
                          <p className="max-w-[220px] truncate text-xs text-gray-500">{event.artist}</p>
                          {event.sheet_is_active === false && <p className="text-[11px] font-semibold text-gray-400">판매 중지된 악보</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{renderPrice(event)}</td>
                    <td className="px-4 py-3">{renderTiming(event, status)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">
                      <div className="font-semibold text-gray-900">{(stats[event.id]?.count ?? 0).toLocaleString()}건</div>
                      <div>{krw(stats[event.id]?.revenue ?? 0)}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_META[status].className}`}>{STATUS_META[status].label}</span>
                    </td>
                    <td className="px-4 py-3">{renderActions(event, status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 모바일 */}
            <ul className="divide-y divide-gray-100 lg:hidden">
              {visible.map(({ event, status }) => (
                <li key={event.id} className="space-y-3 p-4">
                  <div className="flex gap-3">
                    <img src={getEventThumbnail(event) || generateDefaultThumbnail(80, 80)} alt="" className="h-14 w-14 flex-shrink-0 rounded object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate font-semibold text-gray-900">{event.title}</p>
                        <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_META[status].className}`}>{STATUS_META[status].label}</span>
                      </div>
                      <p className="truncate text-xs text-gray-500">{event.artist}</p>
                      <div className="mt-1 flex items-end justify-between gap-2">
                        {renderPrice(event)}
                        <div className="text-right text-xs text-gray-600">
                          판매 {(stats[event.id]?.count ?? 0).toLocaleString()}건 · {krw(stats[event.id]?.revenue ?? 0)}
                        </div>
                      </div>
                    </div>
                  </div>
                  {renderTiming(event, status)}
                  {renderActions(event, status)}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
