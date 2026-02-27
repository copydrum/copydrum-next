'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useTranslation } from 'react-i18next';
import {
  buildDownloadKey,
  getDownloadFileName,
  requestSignedDownloadUrl,
  downloadFile,
} from '@/utils/downloadHelpers';
import { generateDefaultThumbnail } from '@/lib/defaultThumbnail';

interface Order {
  id: string;
  order_number: string;
  total_amount: number;
  status: string;
  payment_status: string;
  payment_method: string | null;
  created_at: string;
}

interface OrderItem {
  id: string;
  drum_sheet_id: string;
  title: string;
  artist: string;
  pdf_url: string | null;
  thumbnail_url: string | null;
  preview_image_url: string | null;
}

const METHOD_KEY_MAP: Record<string, string> = {
  points: 'methodPoints',
  point: 'methodPoints',
  kakaopay: 'methodKakaopay',
  card: 'methodCard',
  inicis: 'methodInicis',
  paypal: 'methodPaypal',
  dodo: 'methodDodo',
};

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const router = useLocaleRouter();
  const { user, loading: authLoading } = useAuthStore();
  const { t, i18n } = useTranslation();

  // URL에서 orderId를 가져오되, 없으면 sessionStorage에서 fallback
  // (Dodo Payments는 return URL의 query string을 자체 파라미터로 교체할 수 있음)
  const urlOrderId = searchParams.get('orderId');
  const sessionOrderId = typeof window !== 'undefined' ? sessionStorage.getItem('dodo_order_id') : null;
  const orderId = urlOrderId || sessionOrderId;
  
  const urlMethod = searchParams.get('method') || (typeof window !== 'undefined' ? sessionStorage.getItem('dodo_payment_method') : null);
  // Dodo Payments는 결제 완료 후 payment_id와 status 파라미터를 추가함
  const dodoPaymentId = searchParams.get('payment_id');
  const dodoStatus = searchParams.get('status');

  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Download state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [downloadingKeys, setDownloadingKeys] = useState<string[]>([]);
  const [bulkDownloading, setBulkDownloading] = useState(false);

  useEffect(() => {
    // 인증 상태가 아직 초기화 중이면 기다림
    // (외부 결제 페이지에서 리다이렉트 후 세션 복원에 시간이 필요)
    if (authLoading) {
      console.log('[payment-success] 인증 상태 초기화 대기 중...');
      return;
    }

    const verifyAndLoadOrder = async () => {
      // Dodo 결제에서 sessionStorage로 받은 orderId가 있으면 로그 출력
      if (!urlOrderId && sessionOrderId) {
        console.log('[payment-success] URL에 orderId 없음 → sessionStorage에서 가져옴:', sessionOrderId);
      }

      if (!orderId) {
        setError(t('paymentSuccess.noOrderId', '주문 ID가 없습니다.'));
        setLoading(false);
        return;
      }

      if (!user) {
        alert(t('paymentSuccess.loginRequired', '로그인이 필요합니다.'));
        router.push('/auth/login');
        return;
      }

      try {
        // 주문 정보 조회
        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .eq('user_id', user.id)
          .single();

        if (orderError || !orderData) {
          setError(t('paymentSuccess.orderNotFound', '주문을 찾을 수 없습니다.'));
          setLoading(false);
          return;
        }

        // 결제 수단 결정 (우선순위: URL 파라미터 > sessionStorage > DB 기존 값)
        const sessionMethod = typeof window !== 'undefined' ? sessionStorage.getItem('dodo_payment_method') : null;
        const resolvedMethod = urlMethod || sessionMethod || orderData.payment_method || '';

        console.log('[payment-success] 결제 수단 확인:', {
          urlMethod,
          sessionMethod,
          dbMethod: orderData.payment_method,
          resolvedMethod,
          dodoPaymentId,
          dodoStatus,
          orderStatus: orderData.status,
        });

        // ━━━ Dodo Payments 결제 완료 처리 ━━━
        // Dodo는 return URL에 자체 query string(?payment_id=&status=)을 추가함
        // orderId/method가 유실될 수 있으므로 sessionStorage에서도 확인
        const isDodoPayment = resolvedMethod === 'dodo' || (dodoPaymentId && dodoStatus);
        
        if (isDodoPayment && orderData.status !== 'completed') {
          const isDodoSucceeded = dodoStatus === 'succeeded';
          
          if (isDodoSucceeded && dodoPaymentId) {
            console.log('[payment-success] Dodo 결제 완료 → completeOrderAfterPayment 호출', {
              orderId,
              dodoPaymentId,
              dodoStatus,
            });

            // completeOrderAfterPayment를 API를 통해 호출 (예상 완료일 계산 포함)
            try {
              const response = await fetch('/api/orders/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  orderId,
                  paymentMethod: 'dodo',
                  transactionId: dodoPaymentId,
                  paymentConfirmedAt: new Date().toISOString(),
                  paymentProvider: 'dodo',
                }),
              });

              const result = await response.json();

              if (!result.success) {
                console.error('[payment-success] completeOrderAfterPayment 실패:', result.error);
                // Fallback: 직접 업데이트 시도
                const { error: updateError } = await supabase
                  .from('orders')
                  .update({
                    status: 'completed',
                    payment_status: 'paid',
                    payment_method: 'dodo',
                    transaction_id: dodoPaymentId,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', orderId)
                  .eq('user_id', user.id);

                if (updateError) {
                  console.error('[payment-success] Dodo 주문 상태 업데이트 실패:', updateError);
                }
              } else {
                console.log('[payment-success] ✅ completeOrderAfterPayment 성공');
              }
            } catch (error) {
              console.error('[payment-success] completeOrderAfterPayment 호출 실패:', error);
              // Fallback: 직접 업데이트 시도
              const { error: updateError } = await supabase
                .from('orders')
                .update({
                  status: 'completed',
                  payment_status: 'paid',
                  payment_method: 'dodo',
                  transaction_id: dodoPaymentId,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', orderId)
                .eq('user_id', user.id);

              if (updateError) {
                console.error('[payment-success] Dodo 주문 상태 업데이트 실패:', updateError);
              } else {
                // 구매 내역(purchases) 테이블에도 기록
                try {
                  const { data: orderItemsForPurchase } = await supabase
                    .from('order_items')
                    .select('id, drum_sheet_id, price')
                    .eq('order_id', orderId);

                  if (orderItemsForPurchase && orderItemsForPurchase.length > 0) {
                    const purchaseRecords = orderItemsForPurchase.map((item: any) => ({
                      user_id: user.id,
                      drum_sheet_id: item.drum_sheet_id,
                      order_id: orderId,
                      price_paid: item.price ?? 0,
                    }));

                    const { error: purchasesError } = await supabase
                      .from('purchases')
                      .insert(purchaseRecords);

                    if (purchasesError && purchasesError.code !== '23505') {
                      // 23505 = unique violation (이미 기록됨) → 무시
                      console.warn('[payment-success] purchases 기록 실패 (치명적이지 않음):', purchasesError);
                    } else {
                      console.log('[payment-success] purchases 기록 완료');
                    }
                  }
                } catch (purchaseErr) {
                  console.warn('[payment-success] purchases 기록 중 오류:', purchaseErr);
                }
              }
            }
          } else {
            console.warn('[payment-success] Dodo 결제 미완료 상태:', { dodoStatus, dodoPaymentId });
          }

          // sessionStorage 정리
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('dodo_order_id');
            sessionStorage.removeItem('dodo_payment_method');
          }

          // 업데이트된 주문 정보 재조회
          const { data: updatedOrderData } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

          if (updatedOrderData) {
            setOrder(updatedOrderData);
          } else {
            setOrder(orderData);
          }
        } else if (orderData.status !== 'completed') {
          // ━━━ PortOne (카드/카카오페이) 결제 검증 ━━━
          const actualMethod = resolvedMethod;
          if (actualMethod !== 'point' && actualMethod !== 'points' && actualMethod !== 'dodo') {
            const verifyResponse = await fetch('/api/payments/portone/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                paymentId: orderData.transaction_id,
                orderId: orderData.id,
                paymentMethod: actualMethod || 'card', // 결제 수단도 전달
              }),
            });

            if (!verifyResponse.ok) {
              setError(t('paymentSuccess.verifyFailed', '결제 검증에 실패했습니다.'));
              setLoading(false);
              return;
            }

            // 업데이트된 주문 정보 재조회
            const { data: updatedOrderData } = await supabase
              .from('orders')
              .select('*')
              .eq('id', orderId)
              .single();

            if (updatedOrderData) {
              setOrder(updatedOrderData);
            }
          } else {
            setOrder(orderData);
          }
        } else {
          // 이미 completed인데 payment_method가 null인 경우 → 보정
          if (!orderData.payment_method && resolvedMethod) {
            console.log('[payment-success] payment_method 보정:', resolvedMethod);
            await supabase
              .from('orders')
              .update({ payment_method: resolvedMethod })
              .eq('id', orderId);
          }
          setOrder(orderData);
        }

        // 주문 아이템 및 악보 정보 조회
        const { data: itemsData, error: itemsError } = await supabase
          .from('order_items')
          .select(`
            id,
            drum_sheet_id,
            drum_sheets:drum_sheet_id (
              title,
              artist,
              pdf_url,
              thumbnail_url,
              preview_image_url
            )
          `)
          .eq('order_id', orderId);

        if (!itemsError && itemsData) {
          const formattedItems = itemsData.map((item: any) => ({
            id: item.id,
            drum_sheet_id: item.drum_sheet_id,
            title: item.drum_sheets?.title || t('paymentSuccess.unknown', '알 수 없음'),
            artist: item.drum_sheets?.artist || t('paymentSuccess.unknown', '알 수 없음'),
            pdf_url: item.drum_sheets?.pdf_url || null,
            thumbnail_url: item.drum_sheets?.thumbnail_url || null,
            preview_image_url: item.drum_sheets?.preview_image_url || null,
          }));
          setOrderItems(formattedItems);
        }
      } catch (err) {
        console.error('[payment-success] 데이터 로드 오류:', err);
        setError(t('paymentSuccess.loadError', '주문 정보를 불러오는 중 오류가 발생했습니다.'));
      } finally {
        setLoading(false);
      }
    };

    verifyAndLoadOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, urlMethod, user, authLoading]);

  // ========== Download helpers ==========
  const downloadableItems = orderItems.filter((item) => !!item.pdf_url);

  const downloadSingleItem = async (item: OrderItem) => {
    if (!orderId) return;
    const key = buildDownloadKey(orderId, item.id);
    setDownloadingKeys((prev) => [...prev, key]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert(t('paymentSuccess.loginRequired', '로그인이 필요합니다.'));
        return;
      }

      const fileName = getDownloadFileName({
        title: item.title,
        artist: item.artist,
        orderId,
      });

      const signedUrl = await requestSignedDownloadUrl({
        orderId,
        orderItemId: item.id,
        accessToken: session.access_token,
      });

      await downloadFile(signedUrl, fileName);
    } catch (err) {
      console.error('[download] error:', err);
      alert(err instanceof Error ? err.message : t('paymentSuccess.downloadError', '다운로드 중 오류가 발생했습니다.'));
    } finally {
      setDownloadingKeys((prev) => prev.filter((k) => k !== key));
    }
  };

  const downloadMultipleItems = async (items: OrderItem[]) => {
    if (!orderId || items.length === 0) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      alert(t('paymentSuccess.loginRequired', '로그인이 필요합니다.'));
      return;
    }

    setBulkDownloading(true);
    const failed: OrderItem[] = [];

    try {
      for (const item of items) {
        const key = buildDownloadKey(orderId, item.id);
        setDownloadingKeys((prev) => [...prev, key]);
        try {
          const fileName = getDownloadFileName({
            title: item.title,
            artist: item.artist,
            orderId,
          });
          const signedUrl = await requestSignedDownloadUrl({
            orderId,
            orderItemId: item.id,
            accessToken: session.access_token,
          });
          await downloadFile(signedUrl, fileName);
        } catch {
          failed.push(item);
        } finally {
          setDownloadingKeys((prev) => prev.filter((k) => k !== key));
        }
      }
    } finally {
      setBulkDownloading(false);
    }

    if (failed.length > 0) {
      alert(t('paymentSuccess.downloadFailedCount', { count: failed.length, defaultValue: `${failed.length}개 파일 다운로드에 실패했습니다.` }));
    }
  };

  const toggleSelect = (itemId: string) => {
    const key = buildDownloadKey(orderId!, itemId);
    setSelectedIds((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === downloadableItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(downloadableItems.map((item) => buildDownloadKey(orderId!, item.id)));
    }
  };

  const handleClearSelection = () => setSelectedIds([]);

  const handleDownloadSelected = async () => {
    const items = downloadableItems.filter((item) =>
      selectedIds.includes(buildDownloadKey(orderId!, item.id))
    );
    await downloadMultipleItems(items);
  };

  const handleDownloadAll = async () => {
    await downloadMultipleItems(downloadableItems);
  };

  // ========== Determine payment method label ==========
  const resolvedMethod = (order?.payment_method || urlMethod || 'card').toLowerCase();
  const methodKey = METHOD_KEY_MAP[resolvedMethod] || 'methodCard';
  const methodLabel = t(`paymentSuccess.${methodKey}`);

  // ========== Render ==========
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600 mx-auto"></div>
          <p className="mt-4 text-lg text-gray-600" suppressHydrationWarning>
            {t('paymentSuccess.verifying', '결제 확인 중입니다...')}
          </p>
          <p className="mt-2 text-sm text-gray-500" suppressHydrationWarning>
            {t('paymentSuccess.pleaseWait', '잠시만 기다려주세요.')}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-md">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <i className="ri-error-warning-line text-3xl text-red-600"></i>
          </div>
          <h2 className="mt-4 text-2xl font-bold text-gray-900" suppressHydrationWarning>
            {t('paymentSuccess.errorTitle', '결제 오류')}
          </h2>
          <p className="mt-2 text-gray-600">{error}</p>
          <div className="mt-6 space-x-3">
            <button
              onClick={() => router.push('/')}
              className="inline-block bg-blue-600 text-white py-2 px-6 rounded-lg font-semibold hover:bg-blue-700"
              suppressHydrationWarning
            >
              {t('paymentSuccess.goHome', '홈으로')}
            </button>
            <button
              onClick={() => router.push('/purchases')}
              className="inline-block bg-gray-200 text-gray-700 py-2 px-6 rounded-lg font-semibold hover:bg-gray-300"
              suppressHydrationWarning
            >
              {t('paymentSuccess.viewPurchases', '구매내역')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        {/* 성공 메시지 */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-6 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100 mb-4">
            <i className="ri-checkbox-circle-line text-5xl text-green-600"></i>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2" suppressHydrationWarning>
            {t('paymentSuccess.title', '결제가 완료되었습니다!')}
          </h1>
          <p className="text-gray-600" suppressHydrationWarning>
            {methodLabel}{t('paymentSuccess.successSuffix', '가 성공적으로 처리되었습니다.')}
          </p>
          {order && (
            <div className="mt-6 inline-block bg-gray-100 rounded-lg px-6 py-3">
              <p className="text-sm text-gray-600" suppressHydrationWarning>
                {t('paymentSuccess.orderNumber', '주문번호')}
              </p>
              <p className="text-lg font-semibold text-gray-900">{order.order_number}</p>
            </div>
          )}
        </div>

        {/* 주문 상품 및 다운로드 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900" suppressHydrationWarning>
              {t('paymentSuccess.purchasedSheets', '구매한 악보')}
            </h2>
            <p className="text-sm text-gray-500" suppressHydrationWarning>
              {t('paymentSuccess.totalCount', { count: orderItems.length, defaultValue: `총 ${orderItems.length}건` })}
            </p>
          </div>

          {/* 일괄 다운로드 컨트롤 */}
          {downloadableItems.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleSelectAll}
                  disabled={downloadableItems.length === 0 || bulkDownloading}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition ${
                    downloadableItems.length === 0 || bulkDownloading
                      ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                  suppressHydrationWarning
                >
                  <i className="ri-checkbox-multiple-line text-base" />
                  {selectedIds.length === downloadableItems.length
                    ? t('paymentSuccess.deselectAll', '선택해제')
                    : t('paymentSuccess.selectAll', '전체선택')}
                </button>
                <button
                  onClick={handleClearSelection}
                  disabled={selectedIds.length === 0 || bulkDownloading}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition ${
                    selectedIds.length === 0 || bulkDownloading
                      ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                  suppressHydrationWarning
                >
                  <i className="ri-close-circle-line text-base" />
                  {t('paymentSuccess.clearSelection', '선택해제')}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleDownloadSelected}
                  disabled={selectedIds.length === 0 || bulkDownloading}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition ${
                    selectedIds.length === 0 || bulkDownloading
                      ? 'bg-blue-300 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                  suppressHydrationWarning
                >
                  <i className="ri-download-2-line text-base" />
                  {bulkDownloading
                    ? t('paymentSuccess.downloading', '다운로드 중...')
                    : t('paymentSuccess.downloadSelected', '선택 다운로드')}
                </button>
                <button
                  onClick={handleDownloadAll}
                  disabled={downloadableItems.length === 0 || bulkDownloading}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition ${
                    downloadableItems.length === 0 || bulkDownloading
                      ? 'bg-indigo-300 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                  suppressHydrationWarning
                >
                  <i className="ri-stack-line text-base" />
                  {bulkDownloading
                    ? t('paymentSuccess.downloading', '다운로드 중...')
                    : t('paymentSuccess.downloadAll', '전체 다운로드')}
                </button>
              </div>
            </div>
          )}

          {/* 선택된 항목 표시 */}
          {selectedIds.length > 0 && (
            <div className="text-right mb-2">
              <p className="text-xs text-blue-600" suppressHydrationWarning>
                {t('paymentSuccess.selectedCount', { count: selectedIds.length, defaultValue: `${selectedIds.length}개 선택됨` })}
              </p>
            </div>
          )}

          {/* 악보 목록 */}
          <div className="space-y-3">
            {orderItems.map((item) => {
              const key = buildDownloadKey(orderId!, item.id);
              const isSelected = selectedIds.includes(key);
              const isDownloading = downloadingKeys.includes(key) || bulkDownloading;
              const hasDownload = !!item.pdf_url;

              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-4 border rounded-lg transition ${
                    isSelected
                      ? 'border-blue-300 bg-blue-50/70 shadow-sm'
                      : 'border-gray-100 bg-white hover:border-blue-200'
                  }`}
                >
                  {hasDownload && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(item.id)}
                      disabled={bulkDownloading}
                      className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                    />
                  )}
                  <img
                    src={item.thumbnail_url || item.preview_image_url || generateDefaultThumbnail(80, 80)}
                    alt={item.title}
                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = generateDefaultThumbnail(80, 80);
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{item.title}</p>
                    <p className="text-sm text-gray-600">{item.artist}</p>
                  </div>
                  {hasDownload ? (
                    <button
                      onClick={() => downloadSingleItem(item)}
                      disabled={isDownloading}
                      className={`flex items-center gap-2 py-2 px-4 rounded-lg font-semibold text-sm text-white transition ${
                        isDownloading
                          ? 'bg-blue-300 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                      suppressHydrationWarning
                    >
                      <i className={isDownloading ? 'ri-loader-4-line animate-spin' : 'ri-download-line'} />
                      {isDownloading
                        ? t('paymentSuccess.downloading', '다운로드 중...')
                        : t('paymentSuccess.download', '다운로드')}
                    </button>
                  ) : (
                    <span className="text-sm text-gray-500" suppressHydrationWarning>
                      {t('paymentSuccess.preparing', '다운로드 준비 중')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 안내 메시지 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex gap-3">
            <i className="ri-information-line text-blue-600 text-xl"></i>
            <div className="flex-1" suppressHydrationWarning>
              <p className="font-semibold text-blue-900 mb-1">
                {t('paymentSuccess.guideTitle', '다운로드 안내')}
              </p>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• {t('paymentSuccess.guideRedownload', '구매하신 악보는 언제든지 ')}<a onClick={() => router.push('/purchases')} className="underline font-semibold cursor-pointer">{t('paymentSuccess.viewPurchases', '구매내역')}</a>{t('paymentSuccess.guideRedownloadSuffix', '에서 다시 다운로드하실 수 있습니다.')}</li>
                <li>• {t('paymentSuccess.guideUnlimited', 'PDF 파일은 다운로드 제한이 없으며, 개인 용도로 자유롭게 사용하실 수 있습니다.')}</li>
                <li>• {t('paymentSuccess.guideSupport', '문제가 발생하면 고객센터로 문의해주세요.')}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => router.push('/purchases')}
            className="flex-1 text-center bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            suppressHydrationWarning
          >
            {t('paymentSuccess.viewPurchases', '구매내역 보기')}
          </button>
          <button
            onClick={() => router.push('/categories')}
            className="flex-1 text-center bg-gray-200 text-gray-700 py-3 px-6 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            suppressHydrationWarning
          >
            {t('paymentSuccess.continueShopping', '계속 쇼핑하기')}
          </button>
        </div>
      </div>
    </div>
  );
}
