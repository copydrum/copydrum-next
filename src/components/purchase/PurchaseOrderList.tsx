'use client';

import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import LocaleLink from '@/components/common/LocaleLink';
import { generateDefaultThumbnail } from '@/lib/defaultThumbnail';
import { getSiteCurrency, convertFromKrw, formatCurrency } from '@/lib/currency';
import { formatWalletAmount } from '@/lib/wallet/display';
import { formatDateToKorean } from '@/utils/businessDays';
import { buildDownloadKey, downloadFile, getDownloadFileName, requestSignedDownloadUrl } from '@/utils/downloadHelpers';
import {
  isAwaitingDeposit,
  isDownloadableItem,
  isPreorderPending,
  loadPurchaseOrders,
  type PurchaseOrder,
  type PurchaseOrderItem,
} from '@/lib/purchases/purchaseOrders';

const PAGE_SIZE = 20;

// 악보 무통장 입금 계좌 (결제 시 안내하는 계좌와 같다)
const DEPOSIT_BANK = '카카오뱅크';
const DEPOSIT_ACCOUNT = '3333-15-0302437';
const DEPOSIT_HOLDER = '강만수';

const BRAND_METHOD_LABELS: Record<string, string> = {
  kakaopay: '카카오페이',
  paypal: 'PayPal',
  lemon_squeezy: 'Lemon Squeezy',
};

interface PurchaseOrderListProps {
  user: User;
  /** 페이지 제목과 겹치지 않게 목록 제목을 바꿀 때 */
  title?: string;
}

/** 마이페이지 구매 내역 탭과 구매내역 페이지가 함께 쓰는 주문별 구매 목록 */
export default function PurchaseOrderList({ user, title }: PurchaseOrderListProps) {
  const { t, i18n } = useTranslation();
  const router = useLocaleRouter();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [downloadingKeys, setDownloadingKeys] = useState<string[]>([]);
  const [bulkDownloading, setBulkDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadPurchaseOrders(user.id).then((data) => {
      if (cancelled) return;
      setOrders(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const currency = getSiteCurrency(typeof window !== 'undefined' ? window.location.hostname : undefined, i18n.language);
  const formatOrderAmount = (order: PurchaseOrder, value: number) =>
    order.payment_method === 'cash'
      ? formatWalletAmount(value, i18n.language)
      : formatCurrency(convertFromKrw(value, currency, i18n.language), currency);

  const formatDateTime = (value: string | null) =>
    value ? new Date(value).toLocaleString(i18n.language === 'ko' ? 'ko-KR' : i18n.language) : '-';

  const getPaymentMethodLabel = (order: PurchaseOrder) => {
    if (order.is_legacy) return t('purchaseOrders.legacyMethod');
    const method = (order.payment_method ?? '').toLowerCase();
    const labels: Record<string, string> = {
      card: t('myOrders.paymentMethod.card'),
      bank_transfer: t('myOrders.paymentMethod.bankTransfer'),
      virtual_account: t('myOrders.paymentMethod.virtualAccount'),
      cash: t('myOrders.paymentMethod.cash'),
      points: t('myOrders.paymentMethod.points'),
      reward_points: t('myOrders.paymentMethod.reward_points'),
      ...BRAND_METHOD_LABELS,
    };
    return labels[method] ?? (order.payment_method || '');
  };

  const getPreorderLabel = (order: PurchaseOrder, item: PurchaseOrderItem) => {
    if (order.expected_completion_date) {
      const date = formatDateToKorean(order.expected_completion_date);
      if (date) return t('mypage.downloads.expectedCompletionDate', { date });
    }
    const deadline = item.drum_sheets?.preorder_deadline;
    const parsed = deadline ? new Date(deadline) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return t('mypage.downloads.preorderInProgress');
    const label = `${String(parsed.getMonth() + 1).padStart(2, '0')}/${String(parsed.getDate()).padStart(2, '0')}`;
    return t('mypage.downloads.preorderInProgressWithDeadline', { deadline: label });
  };

  // 검색어가 있으면 곡명·아티스트가 맞는 곡만 남기고, 맞는 곡이 없는 주문은 숨긴다
  const filteredOrders = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return orders;
    return orders
      .map((order) => ({
        ...order,
        order_items: order.order_items.filter((item) =>
          `${item.drum_sheets?.title ?? ''} ${item.drum_sheets?.artist ?? ''}`.toLowerCase().includes(keyword),
        ),
      }))
      .filter((order) => order.order_items.length > 0);
  }, [orders, query]);

  // 곡 수 기준으로 PAGE_SIZE 씩 보여 준다 (주문은 쪼개지 않는다)
  const visibleOrders = useMemo(() => {
    const result: PurchaseOrder[] = [];
    let shown = 0;
    for (const order of filteredOrders) {
      if (shown >= limit) break;
      result.push(order);
      shown += order.order_items.length;
    }
    return result;
  }, [filteredOrders, limit]);

  const totalSheets = filteredOrders.reduce((count, order) => count + order.order_items.length, 0);
  const hasMore = visibleOrders.length < filteredOrders.length;

  const setDownloading = (key: string, on: boolean) =>
    setDownloadingKeys((prev) => (on ? (prev.includes(key) ? prev : [...prev, key]) : prev.filter((value) => value !== key)));

  const downloadItem = async (order: PurchaseOrder, item: PurchaseOrderItem, accessToken: string) => {
    if (!item.drum_sheets) throw new Error(t('mypage.errors.downloadLinkNotFound'));
    const signedUrl = await requestSignedDownloadUrl({ orderId: order.id, orderItemId: item.id, accessToken });
    await downloadFile(
      signedUrl,
      getDownloadFileName({ title: item.drum_sheets.title, artist: item.drum_sheets.artist, orderId: order.id }),
    );
  };

  const getAccessToken = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  const handleDownload = async (order: PurchaseOrder, item: PurchaseOrderItem) => {
    const key = buildDownloadKey(order.id, item.id);
    setDownloading(key, true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error(t('mypage.errors.loginRequiredForDownload'));
      await downloadItem(order, item, token);
    } catch (error) {
      alert(error instanceof Error ? error.message : t('mypage.errors.downloadFailedSingle'));
    } finally {
      setDownloading(key, false);
    }
  };

  const handleDownloadMany = async (order: PurchaseOrder, items: PurchaseOrderItem[]) => {
    if (items.length === 0) {
      alert(t('mypage.errors.noDownloadableItems'));
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      alert(t('mypage.errors.loginRequiredForDownload'));
      return;
    }
    setBulkDownloading(true);
    let failed = 0;
    try {
      for (const item of items) {
        const key = buildDownloadKey(order.id, item.id);
        setDownloading(key, true);
        try {
          await downloadItem(order, item, token);
        } catch {
          failed += 1;
        } finally {
          setDownloading(key, false);
        }
      }
    } finally {
      setBulkDownloading(false);
    }
    if (failed > 0) alert(t('mypage.errors.downloadFailed', { count: failed }));
  };

  const toggleItem = (orderId: string, itemId: string) =>
    setSelected((prev) => {
      const current = prev[orderId] ?? [];
      const next = current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId];
      if (next.length === 0) {
        const { [orderId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [orderId]: next };
    });

  const toggleAll = (order: PurchaseOrder, selectableIds: string[]) =>
    setSelected((prev) => {
      const current = prev[order.id] ?? [];
      if (selectableIds.every((id) => current.includes(id))) {
        const { [order.id]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [order.id]: selectableIds };
    });

  const clearSelection = (orderId: string) =>
    setSelected((prev) => {
      const { [orderId]: _removed, ...rest } = prev;
      return rest;
    });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <i className="ri-loader-4-line mb-3 animate-spin text-3xl text-blue-500" />
        <p className="text-sm font-medium">{t('purchaseHistory.loading')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-gray-900 md:text-xl">{title ?? t('mypage.purchases.title')}</h3>
          {orders.length > 0 && (
            <p className="text-xs text-gray-500 md:text-sm">{t('purchaseOrders.sheetCount', { count: totalSheets })}</p>
          )}
        </div>
        <LocaleLink
          href="/categories"
          className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 md:text-sm"
        >
          <i className="ri-add-line text-base" /> {t('mypage.purchases.browseMore')}
        </LocaleLink>
      </div>

      {orders.length === 0 ? (
        <div className="py-16 text-center text-gray-500">
          <i className="ri-shopping-bag-line mb-4 text-4xl text-gray-300" />
          <p className="font-medium">{t('mypage.purchases.noPurchases')}</p>
        </div>
      ) : (
        <>
          <div className="relative mt-4">
            <i className="ri-search-line pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setLimit(PAGE_SIZE);
              }}
              placeholder={t('purchaseOrders.searchPlaceholder')}
              className="h-11 w-full rounded-full border border-gray-200 bg-gray-50 pl-10 pr-10 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('purchaseOrders.clearSearch')}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <i className="ri-close-line text-lg" />
              </button>
            )}
          </div>

          {filteredOrders.length === 0 ? (
            <p className="py-14 text-center text-sm text-gray-500">{t('purchaseOrders.noResults')}</p>
          ) : (
            <div className="mt-2 divide-y divide-gray-100">
              {visibleOrders.map((order) => {
                const awaiting = isAwaitingDeposit(order);
                const selectableIds = order.order_items.filter((item) => isDownloadableItem(order, item)).map((item) => item.id);
                const orderSelected = selected[order.id] ?? [];
                const allSelected = selectableIds.length > 0 && selectableIds.every((id) => orderSelected.includes(id));
                const showCheckboxes = selectableIds.length > 1;
                const methodLabel = getPaymentMethodLabel(order);

                return (
                  <div key={order.id} className="py-5">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-[15px] font-bold text-gray-900">
                            {order.order_number ?? `#${order.id.slice(0, 8).toUpperCase()}`}
                          </h4>
                          {awaiting ? (
                            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                              {t('purchaseOrders.awaitingDeposit')}
                            </span>
                          ) : (
                            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                              {t('mypage.status.order.completed')}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {formatDateTime(order.created_at)}
                          {order.total_amount > 0 && (
                            <>
                              <span className="mx-1.5 text-gray-300">·</span>
                              <span className="font-semibold text-gray-800">{formatOrderAmount(order, order.total_amount)}</span>
                            </>
                          )}
                          {methodLabel && (
                            <>
                              <span className="mx-1.5 text-gray-300">·</span>
                              {methodLabel}
                            </>
                          )}
                        </p>
                      </div>
                      {selectableIds.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            void handleDownloadMany(order, order.order_items.filter((item) => selectableIds.includes(item.id)))
                          }
                          disabled={bulkDownloading}
                          className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                        >
                          <i className="ri-folder-download-line text-base" />
                          {bulkDownloading ? t('mypage.purchases.downloading') : t('mypage.purchases.downloadAllInOrder')}
                        </button>
                      )}
                    </div>

                    {awaiting && (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-900">
                        <p className="font-semibold">{t('purchaseOrders.depositGuide')}</p>
                        <p className="mt-1">
                          {t('purchaseOrders.depositAccount', { bank: DEPOSIT_BANK, account: DEPOSIT_ACCOUNT, holder: DEPOSIT_HOLDER })}
                          <button
                            type="button"
                            onClick={() => void navigator.clipboard?.writeText(DEPOSIT_ACCOUNT)}
                            className="ml-1.5 inline-flex items-center text-amber-700 hover:text-amber-900"
                            aria-label={DEPOSIT_ACCOUNT}
                          >
                            <i className="ri-file-copy-line" />
                          </button>
                        </p>
                        {order.depositor_name && <p>{t('purchaseOrders.depositor', { name: order.depositor_name })}</p>}
                      </div>
                    )}

                    {showCheckboxes && (
                      <div className="mt-3 flex min-h-[40px] flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-1.5 text-xs">
                        <label className="inline-flex cursor-pointer items-center gap-2 font-medium text-gray-700">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={allSelected}
                            onChange={() => toggleAll(order, selectableIds)}
                            disabled={bulkDownloading}
                          />
                          {t('mypage.purchases.selectAll')}
                          {orderSelected.length > 0 && (
                            <span className="text-gray-400">
                              {t('mypage.purchases.selected')} {orderSelected.length.toLocaleString()}
                            </span>
                          )}
                        </label>
                        {orderSelected.length > 0 && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => clearSelection(order.id)}
                              disabled={bulkDownloading}
                              className="px-2 py-1 font-medium text-gray-500 hover:text-gray-800"
                            >
                              {t('mypage.purchases.deselectAll')}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleDownloadMany(order, order.order_items.filter((item) => orderSelected.includes(item.id)))
                              }
                              disabled={bulkDownloading}
                              className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              <i className="ri-download-2-line" />
                              {bulkDownloading ? t('mypage.purchases.downloading') : t('mypage.purchases.downloadSelected')}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <ul className="mt-2">
                      {order.order_items.map((item) => {
                        const key = buildDownloadKey(order.id, item.id);
                        const isDownloading = bulkDownloading || downloadingKeys.includes(key);
                        const canDownload = isDownloadableItem(order, item);
                        const isSelected = orderSelected.includes(item.id);
                        const title = item.drum_sheets?.title ?? t('mypage.purchases.deletedSheet');
                        const slug = item.drum_sheets?.slug || item.sheet_id;

                        return (
                          <li
                            key={item.id}
                            className={`flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors ${isSelected ? 'bg-blue-50/80' : ''}`}
                          >
                            {showCheckboxes && (
                              <input
                                type="checkbox"
                                aria-label={title}
                                className="h-4 w-4 flex-shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-30"
                                checked={isSelected}
                                onChange={() => toggleItem(order.id, item.id)}
                                disabled={!canDownload || bulkDownloading}
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => slug && router.push(`/drum-sheet/${slug}`)}
                              title={t('purchaseOrders.viewSheet')}
                              className="group flex min-w-0 flex-1 items-center gap-3 text-left"
                            >
                              <img
                                src={item.drum_sheets?.thumbnail_url || generateDefaultThumbnail(80, 80)}
                                alt=""
                                loading="lazy"
                                className="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
                                onError={(event) => {
                                  (event.target as HTMLImageElement).src = generateDefaultThumbnail(80, 80);
                                }}
                              />
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-gray-900 group-hover:text-blue-700">{title}</span>
                                <span className="block truncate text-xs text-gray-500">
                                  {item.drum_sheets?.artist ?? '-'}
                                  {item.price != null && (
                                    <>
                                      <span className="mx-1 text-gray-300">·</span>
                                      {formatOrderAmount(order, item.price)}
                                    </>
                                  )}
                                </span>
                              </span>
                            </button>
                            {awaiting ? (
                              <span className="flex-shrink-0 rounded-lg bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-700">
                                {t('purchaseOrders.awaitingDeposit')}
                              </span>
                            ) : isPreorderPending(item) ? (
                              <span className="flex-shrink-0 rounded-lg bg-gray-100 px-2.5 py-2 text-xs font-semibold text-gray-500">
                                {getPreorderLabel(order, item)}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void handleDownload(order, item)}
                                disabled={isDownloading || !canDownload}
                                className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 md:text-sm"
                              >
                                <i className="ri-download-2-line text-base" />
                                {isDownloading ? t('mypage.purchases.downloading') : t('mypage.purchases.download')}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          {hasMore && (
            <button
              type="button"
              onClick={() => setLimit((value) => value + PAGE_SIZE)}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              {t('purchaseOrders.loadMore')}
              <i className="ri-arrow-down-s-line text-base" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
