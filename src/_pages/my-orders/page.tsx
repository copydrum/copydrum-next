'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { generateDefaultThumbnail } from '@/lib/defaultThumbnail';
import MainHeader from '@/components/common/MainHeader';
import { useCart } from '@/hooks/useCart';
import { buildDownloadKey, downloadFile, getDownloadFileName, requestSignedDownloadUrl } from '@/utils/downloadHelpers';
import type { VirtualAccountInfo } from '@/lib/payments';
import { useTranslation } from 'react-i18next';

interface CategoryInfo {
  name: string | null;
}

interface DrumSheetInfo {
  id: string;
  title: string | null;
  artist: string | null;
  price: number | null;
  thumbnail_url: string | null;
  pdf_url: string | null;
  preview_image_url: string | null;
  slug: string | null;
  categories?: CategoryInfo | CategoryInfo[] | null;
}

interface OrderItemInfo {
  id: string;
  sheet_id: string;
  price: number | null;
  created_at: string | null;
  drum_sheets: DrumSheetInfo | null;
}

interface OrderSummary {
  id: string;
  order_number?: string | null;
  created_at: string | null;
  status: string | null;
  total_amount: number | null;
  payment_method?: string | null;
  payment_status?: string | null;
  payment_confirmed_at?: string | null;
  transaction_id?: string | null;
  depositor_name?: string | null;
  virtual_account_info?: VirtualAccountInfo | null;
  order_items: OrderItemInfo[];
}

const DOWNLOADABLE_STATUSES = ['completed', 'payment_confirmed', 'paid'];

const formatCurrency = (value: number | null | undefined) =>
  value != null ? `₩${value.toLocaleString('ko-KR')}` : '-';

const formatDateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('ko-KR') : '-';

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString('ko-KR') : '-';


const getCategoryName = (categories: DrumSheetInfo['categories'], t: (key: string) => string) => {
  if (!categories) return t('myOrders.categoryNotSet');
  if (Array.isArray(categories)) {
    return categories[0]?.name ?? t('myOrders.categoryNotSet');
  }
  return categories.name ?? t('myOrders.categoryNotSet');
};

const getStatusMeta = (status: string | null | undefined, t: (key: string) => string) => {
  if (!status) {
    return {
      label: t('common.status'),
      badgeClass: 'bg-gray-100 text-gray-600',
      description: undefined,
    };
  }
  const statusKey = status.toLowerCase();
  const statusMap: Record<string, { label: string; badgeClass: string; description?: string }> = {
    pending: {
      label: t('myOrders.status.pending'),
      badgeClass: 'bg-yellow-100 text-yellow-800',
      description: t('myOrders.status.pendingDesc'),
    },
    in_progress: {
      label: t('myOrders.status.processing'),
      badgeClass: 'bg-blue-100 text-blue-800',
      description: t('myOrders.status.processingDesc'),
    },
    completed: {
      label: t('myOrders.status.completed'),
      badgeClass: 'bg-green-100 text-green-800',
      description: t('myOrders.status.completedDesc'),
    },
    cancelled: {
      label: t('myOrders.status.cancelled'),
      badgeClass: 'bg-red-100 text-red-700',
      description: t('myOrders.status.cancelledDesc'),
    },
    awaiting_deposit: {
      label: t('myOrders.status.paymentPending'),
      badgeClass: 'bg-amber-100 text-amber-700',
      description: t('myOrders.status.paymentPendingDesc'),
    },
    payment_confirmed: {
      label: t('myOrders.status.paymentConfirmed'),
      badgeClass: 'bg-blue-100 text-blue-800',
      description: t('myOrders.status.paymentConfirmedDesc'),
    },
    paid: {
      label: t('myOrders.status.paid'),
      badgeClass: 'bg-green-100 text-green-900',
      description: t('myOrders.status.paidDesc'),
    },
    refunded: {
      label: t('myOrders.status.refunded'),
      badgeClass: 'bg-purple-100 text-purple-700',
      description: t('myOrders.status.refundedDesc'),
    },
  };
  return (
    statusMap[statusKey] ?? {
      label: status,
      badgeClass: 'bg-gray-100 text-gray-600',
    }
  );
};

const getPaymentMethodLabel = (method: string | null | undefined, t: (key: string) => string) => {
  if (!method) return '-';
  const key = method.toLowerCase();
  const methodMap: Record<string, string> = {
    card: t('myOrders.paymentMethod.card'),
    bank_transfer: t('myOrders.paymentMethod.bankTransfer'),
    virtual_account: t('myOrders.paymentMethod.virtualAccount'),
    cash: t('myOrders.paymentMethod.cash'),
    points: t('myOrders.paymentMethod.points'),
  };
  return methodMap[key] ?? method;
};

const MyOrdersPage = () => {
  const router = useLocaleRouter();
  const { cartItems } = useCart();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [selectedPurchaseIds, setSelectedPurchaseIds] = useState<Record<string, string[]>>({});
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [downloadingKeys, setDownloadingKeys] = useState<string[]>([]);
  // 결제 상태 필터: 'paid' (결제 완료) 또는 'pending' (결제 대기)
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'paid' | 'pending'>('paid');
  const { t } = useTranslation();

  // 일반 유저용: 본인 주문만 조회 (필터 필수)
  // RLS 정책과 함께 이중으로 보안 적용
  // 기본적으로 payment_status = 'paid' (결제 완료)인 주문만 표시
  const loadOrders = useCallback(async (currentUser: User, filter: 'paid' | 'pending' = 'paid') => {
    let query = supabase
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
        payment_confirmed_at,
        transaction_id,
        depositor_name,
        virtual_account_info,
        order_type,
        order_items (
          id,
          drum_sheet_id,
          price,
          created_at,
          drum_sheets (
            id,
            title,
            artist,
            price,
            thumbnail_url,
            pdf_url,
            preview_image_url,
            slug,
            categories (
              name
            )
          )
        )
      `
      )
      .eq('user_id', currentUser.id); // 일반 유저는 본인 주문만 필터링

    // 결제 상태 필터링
    if (filter === 'paid') {
      // 결제 완료: payment_status = 'paid'인 주문만
      query = query.eq('payment_status', 'paid');
    } else {
      // 결제 대기: payment_status가 'paid'가 아닌 경우
      query = query.or('payment_status.neq.paid,payment_status.is.null');
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const normalizedOrders: OrderSummary[] = (data ?? []).map((order: any) => ({
      id: order.id,
      order_number: order.order_number ?? null,
      created_at: order.created_at ?? null,
      status: order.status ?? null,
      total_amount: order.total_amount ?? 0,
      payment_method: order.payment_method ?? null,
      payment_status: order.payment_status ?? null,
      payment_confirmed_at: order.payment_confirmed_at ?? null,
      transaction_id: order.transaction_id ?? null,
      depositor_name: order.depositor_name ?? null,
      virtual_account_info: (order.virtual_account_info ?? null) as VirtualAccountInfo | null,
      order_items: (order.order_items ?? []).map((item: any) => ({
        id: item.id,
        sheet_id: item.drum_sheet_id ?? item.drum_sheets?.id ?? '',
        price: item.price ?? null,
        created_at: item.created_at ?? null,
        drum_sheets: item.drum_sheets
          ? {
              id: item.drum_sheets.id,
              title: item.drum_sheets.title ?? null,
              artist: item.drum_sheets.artist ?? null,
              price: item.drum_sheets.price ?? null,
              thumbnail_url: item.drum_sheets.thumbnail_url ?? null,
              pdf_url: item.drum_sheets.pdf_url ?? null,
              preview_image_url: item.drum_sheets.preview_image_url ?? null,
              categories: item.drum_sheets.categories ?? null,
            }
          : null,
      })),
    }));

    // order_items가 있고, order_type이 'product'인 주문만 필터링 (악보 구매만)
    // order_type이 없어도 order_items가 있으면 악보 구매로 간주
    const filteredOrders = normalizedOrders.filter(
      (order) => 
        (order.order_items?.length ?? 0) > 0 && 
        (order.order_type === 'product' || !order.order_type) // order_type이 없으면 order_items 존재 여부로 판단
    );

    setOrders(filteredOrders);
    setSelectedPurchaseIds((prev) => {
      const next: Record<string, string[]> = {};
      filteredOrders.forEach((order) => {
        const normalizedStatus = (order.status ?? '').toLowerCase();
        if (!DOWNLOADABLE_STATUSES.includes(normalizedStatus)) {
          return;
        }
        const existing = prev[order.id] ?? [];
        if (existing.length === 0) {
          return;
        }

        const validIds = existing.filter((id) =>
          order.order_items.some((item) => item.id === id && item.sheet_id),
        );
        if (validIds.length > 0) {
          next[order.id] = validIds;
        }
      });
      return next;
    });
  }, []);

  // paymentStatusFilter 변경 시 주문 다시 불러오기
  useEffect(() => {
    if (user) {
      loadOrders(user, paymentStatusFilter);
    }
  }, [paymentStatusFilter, user, loadOrders]);

  useEffect(() => {
    let isMounted = true;

    const initialise = async () => {
      setLoading(true);
      try {
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        if (!isMounted) {
          return;
        }

        setUser(currentUser ?? null);

        if (currentUser) {
          await loadOrders(currentUser, paymentStatusFilter);
        } else {
          setOrders([]);
        }
      } catch (error) {
        console.error('구매 내역 초기화 오류:', error);
        if (isMounted) {
          setOrders([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initialise();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) {
        return;
      }

      const nextUser = session?.user ?? null;
      setUser(nextUser);

      if (nextUser) {
        setLoading(true);
        try {
          await loadOrders(nextUser, paymentStatusFilter);
        } catch (error) {
          console.error('구매 내역 갱신 오류:', error);
          setOrders([]);
        } finally {
          setLoading(false);
        }
      } else {
        setOrders([]);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadOrders, paymentStatusFilter]);

  useEffect(() => {
    setSelectedPurchaseIds((prev) => {
      if (Object.keys(prev).length === 0) {
        return prev;
      }

      const orderMap = new Map<string, Set<string>>();
      orders.forEach((order) => {
        orderMap.set(
          order.id,
          new Set(order.order_items.map((item) => item.id))
        );
      });

      const next: Record<string, string[]> = {};
      let changed = false;

      Object.entries(prev).forEach(([orderId, itemIds]) => {
        const validIds = orderMap.get(orderId);
        if (!validIds) {
          changed = true;
          return;
        }

        const filtered = itemIds.filter((itemId) => validIds.has(itemId));

        if (filtered.length !== itemIds.length) {
          changed = true;
        }

        if (filtered.length > 0) {
          next[orderId] = filtered;
        } else if (itemIds.length > 0) {
          changed = true;
        }
      });

      if (!changed) {
        return prev;
      }

      return next;
    });
  }, [orders]);

  const totalPurchasedSheets = useMemo(
    () =>
      orders.reduce(
        (total, order) => total + (order.order_items?.length ?? 0),
        0
      ),
    [orders]
  );

  const togglePurchaseSelection = (orderId: string, itemId: string) => {
    setSelectedPurchaseIds((prev) => {
      const current = prev[orderId] ?? [];
      const next = current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId];

      if (next.length === 0) {
        const { [orderId]: _, ...rest } = prev;
        return rest;
      }

      return { ...prev, [orderId]: next };
    });
  };

  const clearPurchaseSelection = (orderId: string) => {
    setSelectedPurchaseIds((prev) => {
      if (!(orderId in prev)) {
        return prev;
      }

      const { [orderId]: _, ...rest } = prev;
      return rest;
    });
  };

  const toggleSelectAllInOrder = (orderId: string, orderItems: OrderItemInfo[]) => {
    setSelectedPurchaseIds((prev) => {
      const selectableIds = orderItems.filter((item) => item.sheet_id).map((item) => item.id);
      if (selectableIds.length === 0) {
        return prev;
      }

      const current = prev[orderId] ?? [];
      const isAllSelected = selectableIds.every((id) => current.includes(id));

      if (isAllSelected) {
        const { [orderId]: _, ...rest } = prev;
        return rest;
      }

      return { ...prev, [orderId]: selectableIds };
    });
  };

  const startDownloading = (key: string) => {
    setDownloadingKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  const finishDownloading = (key: string) => {
    setDownloadingKeys((prev) => prev.filter((value) => value !== key));
  };

  const handleDownloadMultiple = async (targets: { order: OrderSummary; item: OrderItemInfo }[]) => {
    if (targets.length === 0) {
      alert(t('myOrders.selectSheetsToDownload'));
      return;
    }

    const invalidTargets = targets.filter(
      ({ order }) => !DOWNLOADABLE_STATUSES.includes((order.status ?? '').toLowerCase()),
    );
    if (invalidTargets.length > 0) {
      alert(t('myOrders.refundedOrRestricted'));
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      alert(t('myOrders.loginRequired'));
      return;
    }

    setBulkDownloading(true);
    const failed: { order: OrderSummary; item: OrderItemInfo }[] = [];

    try {
      for (const { order, item } of targets) {
        if (!item.sheet_id) {
          failed.push({ order, item });
          continue;
        }

        if (!item.drum_sheets) {
          failed.push({ order, item });
          continue;
        }

        const key = buildDownloadKey(order.id, item.id);
        startDownloading(key);

        try {
          const fileName = getDownloadFileName({
            title: item.drum_sheets?.title,
            artist: item.drum_sheets?.artist,
            orderId: order.id,
          });
          const signedUrl = await requestSignedDownloadUrl({
            orderId: order.id,
            orderItemId: item.id,
            accessToken: session.access_token,
          });
          await downloadFile(signedUrl, fileName);
        } catch (_error) {
          failed.push({ order, item });
        } finally {
          finishDownloading(key);
        }
      }
    } finally {
      setBulkDownloading(false);
    }

    if (failed.length > 0) {
      alert(t('myOrders.downloadFailed', { count: failed.length }));
    }
  };

  const handleDownloadSelectedInOrder = async (order: OrderSummary) => {
    if (!DOWNLOADABLE_STATUSES.includes((order.status ?? '').toLowerCase())) {
      alert(t('myOrders.refundedOrder'));
      return;
    }

    const selectedIds = selectedPurchaseIds[order.id] ?? [];
    if (selectedIds.length === 0) {
      alert(t('myOrders.selectSheetsToDownload'));
      return;
    }

    const targets = order.order_items
      .filter((item) => item.sheet_id && selectedIds.includes(item.id))
      .map((item) => ({ order, item }));

    await handleDownloadMultiple(targets);
  };

  const handleDownloadAllInOrder = async (order: OrderSummary) => {
    if (!DOWNLOADABLE_STATUSES.includes((order.status ?? '').toLowerCase())) {
      alert(t('myOrders.refundedOrder'));
      return;
    }

    const targets = order.order_items
      .filter((item) => item.sheet_id)
      .map((item) => ({ order, item }));

    if (targets.length === 0) {
      alert(t('myOrders.noSheetsToDownload'));
      return;
    }

    await handleDownloadMultiple(targets);
  };

  const handleDownload = async (order: OrderSummary, item: OrderItemInfo) => {
    if (!DOWNLOADABLE_STATUSES.includes((order.status ?? '').toLowerCase())) {
      alert(t('myOrders.refundedOrder'));
      return;
    }

    if (!item.sheet_id) {
      alert(t('myOrders.sheetInfoNotFound'));
      return;
    }

    if (!item.drum_sheets) {
      alert(t('myOrders.fileNotFound'));
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      alert(t('myOrders.loginRequired'));
      return;
    }

    const key = buildDownloadKey(order.id, item.id);
    startDownloading(key);

    try {
      const fileName = getDownloadFileName({
        title: item.drum_sheets?.title,
        artist: item.drum_sheets?.artist,
        orderId: order.id,
      });
      const signedUrl = await requestSignedDownloadUrl({
        orderId: order.id,
        orderItemId: item.id,
        accessToken: session.access_token,
      });
      await downloadFile(signedUrl, fileName);
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message);
      } else {
        alert(t('myOrders.messages.downloadError'));
      }
    } finally {
      finishDownloading(key);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">{t('myOrders.loginRequired')}</h2>
          <p className="text-gray-600">
            {t('myOrders.loginRequiredMessage')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* 메인 헤더 */}
      <MainHeader user={user} />

      {/* 메인 컨텐츠 */}
      <div>
        <div className="bg-gray-50 py-8">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">{t('myOrders.title')}</h1>
            <p className="mt-2 text-gray-600">
              {t('myOrders.description')}
              {orders.length > 0 && (
                <span className="ml-1">
                  {t('myOrders.totalPurchased', { count: totalPurchasedSheets })}
                </span>
              )}
            </p>
            
            {/* 결제 상태 필터 탭 */}
            <div className="mt-4 flex gap-2 border-b border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setPaymentStatusFilter('paid');
                  setLoading(true);
                }}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  paymentStatusFilter === 'paid'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t('myOrders.tabs.downloadable') || '다운로드 가능'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentStatusFilter('pending');
                  setLoading(true);
                }}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  paymentStatusFilter === 'pending'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t('myOrders.tabs.pending') || '결제 대기'}
              </button>
            </div>
          </div>

        {orders.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
            <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center bg-gray-100 rounded-full">
              <i className="ri-shopping-bag-line text-2xl text-gray-400"></i>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {t('myOrders.empty.title')}
            </h3>
            <p className="text-gray-600 mb-6">
              {t('myOrders.empty.message')}
            </p>
            <a
              href="/categories"
              className="inline-flex items-center px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <i className="ri-music-2-line mr-2"></i>
              {t('myOrders.empty.browseButton')}
            </a>
          </div>
        ) : (
          <div className="space-y-6">
            {orders.map((order) => {
              const statusMeta = getStatusMeta(order.status, t);
              const normalizedStatus = (order.status ?? '').toLowerCase();
              const isDownloadableStatus = DOWNLOADABLE_STATUSES.includes(normalizedStatus);
              const selectableOrderItems = order.order_items.filter((item) => item.sheet_id);
              const orderSelectedIds = selectedPurchaseIds[order.id] ?? [];
              const selectedCount = orderSelectedIds.length;
              const allSelectableSelected =
                selectableOrderItems.length > 0 && selectedCount === selectableOrderItems.length;
              const hasSelectableItems = selectableOrderItems.length > 0;
              const canDownload = isDownloadableStatus && hasSelectableItems;
              const shortOrderId = order.id ? order.id.slice(0, 8).toUpperCase() : '-';
              const displayOrderNumber = order.order_number ?? `#${shortOrderId}`;

              return (
                <section
                  key={order.id}
                  className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 space-y-5"
                >
                  <header className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 pb-4">
                    <div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>{t('myOrders.orderNumber')}</span>
                        <span className="font-semibold text-gray-900">
                          {displayOrderNumber}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDateTime(order.created_at)}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {t('payment.method')}: {getPaymentMethodLabel(order.payment_method, t)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${statusMeta.badgeClass}`}
                      >
                        {statusMeta.label}
                      </span>
                      <p className="text-base font-semibold text-gray-900">
                        {formatCurrency(order.total_amount)}
                      </p>
                      {canDownload ? (
                        <button
                          type="button"
                          onClick={() => handleDownloadAllInOrder(order)}
                          disabled={bulkDownloading}
                          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                            bulkDownloading
                              ? 'border-blue-200 bg-blue-100 text-blue-300 cursor-not-allowed'
                              : 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100'
                          }`}
                        >
                          <i className="ri-stack-line text-base" />
                          {bulkDownloading ? t('myOrders.actions.downloading') : t('myOrders.actions.downloadAll')}
                        </button>
                      ) : null}
                    </div>
                  </header>

                  {canDownload ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleSelectAllInOrder(order.id, order.order_items)}
                          disabled={bulkDownloading}
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition ${
                            bulkDownloading
                              ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'border-gray-300 text-gray-700 hover:bg-white'
                          }`}
                        >
                          <i className="ri-checkbox-multiple-line text-base" />
                          {allSelectableSelected ? t('myOrders.actions.deselectAll') : t('myOrders.actions.selectAll')}
                        </button>
                        <button
                          type="button"
                          onClick={() => clearPurchaseSelection(order.id)}
                          disabled={bulkDownloading || selectedCount === 0}
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition ${
                            bulkDownloading || selectedCount === 0
                              ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'border-gray-300 text-gray-700 hover:bg-white'
                          }`}
                        >
                          <i className="ri-close-circle-line text-base" />
                          {t('myOrders.actions.clearSelection')}
                        </button>
                        <span className="text-xs text-gray-500">
                          {t('myOrders.actions.selectedCount', { count: selectedCount })}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDownloadSelectedInOrder(order)}
                          disabled={bulkDownloading || selectedCount === 0}
                          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition ${
                            bulkDownloading || selectedCount === 0
                              ? 'bg-blue-300 cursor-not-allowed'
                              : 'bg-blue-600 hover:bg-blue-700'
                          }`}
                        >
                          <i className="ri-download-2-line text-base" />
                          {bulkDownloading ? t('myOrders.actions.downloading') : t('myOrders.actions.downloadSelected')}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-4">
                    {order.order_items.map((item) => {
                      const sheet = item.drum_sheets;
                      const thumbnailSrc =
                        sheet?.thumbnail_url ||
                        generateDefaultThumbnail(
                          96,
                          96,
                          sheet?.title ?? t('myOrders.deletedSheet')
                        );

                      const downloadKey = buildDownloadKey(order.id, item.id);
                      const isDownloading = bulkDownloading || downloadingKeys.includes(downloadKey);
                      const isSelectable = Boolean(item.sheet_id);
                      const isSelected = isSelectable && isDownloadableStatus && orderSelectedIds.includes(item.id);

                      return (
                        <article
                          key={item.id}
                          className={`flex flex-wrap items-center justify-between gap-4 rounded-lg border px-4 py-3 transition ${
                            isSelected
                              ? 'border-blue-300 bg-blue-50/70 shadow-sm'
                              : 'border-gray-100 bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <input
                              type="checkbox"
                              className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              checked={isSelectable && isDownloadableStatus ? isSelected : false}
                              onChange={() => togglePurchaseSelection(order.id, item.id)}
                              disabled={!isSelectable || bulkDownloading || !isDownloadableStatus}
                            />
                            <img
                              src={thumbnailSrc}
                              alt={sheet?.title ?? t('myOrders.deletedSheet')}
                              className="h-16 w-16 rounded-lg object-cover"
                              onError={(event) => {
                                (event.target as HTMLImageElement).src =
                                  generateDefaultThumbnail(96, 96);
                              }}
                            />
                            <div className="min-w-0">
                              <p className="text-xs text-gray-500">
                                {getCategoryName(sheet?.categories, t)}
                              </p>
                              <h3 className="text-sm font-semibold text-gray-900 truncate">
                                {sheet?.title ?? t('myOrders.deletedSheet')}
                              </h3>
                              <p className="text-xs text-gray-500">
                                {sheet?.artist ?? '-'}
                              </p>
                              <p className="text-xs text-gray-400 mt-1">
                                {t('myOrders.actions.purchaseDate', { date: formatDate(item.created_at) })}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">
                              {formatCurrency(item.price)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDownload(order, item)}
                              disabled={isDownloading || !DOWNLOADABLE_STATUSES.includes((order.status ?? '').toLowerCase())}
                              className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-white transition ${
                                isDownloading ||
                                !DOWNLOADABLE_STATUSES.includes((order.status ?? '').toLowerCase())
                                  ? 'bg-blue-300 cursor-not-allowed'
                                  : 'bg-blue-600 hover:bg-blue-700'
                              }`}
                            >
                              <i className="ri-download-line"></i>
                              {isDownloading
                                ? t('myOrders.actions.downloading')
                                : DOWNLOADABLE_STATUSES.includes((order.status ?? '').toLowerCase())
                                ? t('myOrders.actions.download')
                                : t('myOrders.actions.downloadNotAvailable')}
                            </button>
                            <a
                              href={`/drum-sheet/${item.drum_sheets?.slug || item.sheet_id}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                            >
                              <i className="ri-file-music-line"></i>
                              {t('myOrders.actions.viewDetails')}
                            </a>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  {statusMeta.description && (
                    <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
                      {statusMeta.description}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
          </div>
        </div>

        {/* 장바구니 버튼 */}
        <button
          onClick={() => router.push('/cart')}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-blue-600 text-white px-5 py-3 shadow-lg hover:bg-blue-700"
        >
          <i className="ri-shopping-cart-line text-lg" />
          {t('myOrders.actions.cart')}
          {cartItems.length > 0 ? (
            <span className="ml-2 rounded-full bg-white text-blue-600 text-xs font-bold px-2 py-0.5">
              {cartItems.length}
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
};

export default MyOrdersPage;
