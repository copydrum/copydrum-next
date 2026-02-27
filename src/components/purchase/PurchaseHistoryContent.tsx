'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';
import { generateDefaultThumbnail } from '../../lib/defaultThumbnail';
import { buildDownloadKey, downloadFile, getDownloadFileName, requestSignedDownloadUrl } from '../../utils/downloadHelpers';
import { formatDateToKorean } from '../../utils/businessDays';

const DOWNLOADABLE_STATUSES = ['completed', 'payment_confirmed', 'paid'];

interface OrderItemDetail {
  id: string;
  sheet_slug: string;
  drum_sheet_id?: string;
  sheet_title?: string;
  price: number;
  created_at: string;
  drum_sheets: {
    id: string;
    title: string;
    artist: string;
    slug?: string;
    thumbnail_url: string | null;
    preview_image_url: string | null;
    pdf_url: string | null;
    sales_type: string | null;
    preorder_deadline: string | null;
    categories?: { name: string | null } | null;
  } | null;
}

interface DownloadableItem extends OrderItemDetail {
  order_id: string;
  order_status: string;
  order_created_at: string;
  order_expected_completion_date?: string | null;
}

interface OrderSummary {
  id: string;
  created_at: string;
  status: string;
  total_amount: number;
  payment_method?: string | null;
  order_items: OrderItemDetail[];
}

interface PurchaseHistoryContentProps {
  user: User;
}

export default function PurchaseHistoryContent({ user }: PurchaseHistoryContentProps) {
  const router = useLocaleRouter();
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [downloads, setDownloads] = useState<DownloadableItem[]>([]);
  const [selectedDownloadIds, setSelectedDownloadIds] = useState<string[]>([]);
  const [downloadingKeys, setDownloadingKeys] = useState<string[]>([]);
  const [bulkDownloading, setBulkDownloading] = useState(false);

  const formatDate = (value: string | null | undefined) => {
    if (!value) return '-';
    try {
      return new Date(value).toLocaleDateString(i18n.language || 'ko');
    } catch {
      return '-';
    }
  };

  const loadOrders = useCallback(async () => {
    try {
      // 결제 완료된 주문만 조회 (payment_status = 'paid')
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(
          `
          id,
          created_at,
          status,
          total_amount,
          payment_method,
          payment_status,
          order_type,
          expected_completion_date,
          order_items (
            id,
            drum_sheet_id,
            sheet_title,
            price,
            created_at,
            drum_sheets (
              id,
              title,
              artist,
              slug,
              thumbnail_url,
              preview_image_url,
              pdf_url,
              sales_type,
              preorder_deadline,
              categories (
                name
              )
            )
          )
        `
        )
        .eq('user_id', user.id)
        .eq('payment_status', 'paid')  // 결제 완료된 주문만 필터링
        .order('created_at', { ascending: false });

      if (ordersError) {
        // 상세한 에러 정보 출력
        console.error('[PurchaseHistoryContent] Supabase 쿼리 에러:', {
          code: ordersError.code,
          message: ordersError.message,
          details: ordersError.details,
          hint: ordersError.hint,
        });
        throw ordersError;
      }

      const normalizedOrders = (ordersData || []).map((order: any) => {
        try {
          return {
            ...order,
            // expected_completion_date: null 체크 및 유효성 검증
            expected_completion_date: order.expected_completion_date && 
              typeof order.expected_completion_date === 'string' &&
              order.expected_completion_date.trim() !== ''
              ? order.expected_completion_date
              : null,
            order_items: (order.order_items || []).map((item: any) => ({
              ...item,
              // drum_sheets.slug을 우선 사용, 없으면 drum_sheet_id로 폴백
              sheet_slug: item.drum_sheets?.slug ?? item.drum_sheet_id ?? '',
              drum_sheets: item.drum_sheets
                ? {
                    ...item.drum_sheets,
                    pdf_url: item.drum_sheets.pdf_url ?? null,
                    sales_type: item.drum_sheets.sales_type ?? null,
                    preorder_deadline: item.drum_sheets.preorder_deadline ?? null,
                    categories: item.drum_sheets.categories
                      ? { name: item.drum_sheets.categories.name }
                      : null,
                  }
                : null,
            })),
          };
        } catch (mapError) {
          console.error('[PurchaseHistoryContent] 주문 데이터 정규화 오류:', {
            orderId: order?.id,
            error: mapError,
          });
          // 에러가 발생한 주문은 기본값으로 반환
          return {
            ...order,
            expected_completion_date: null,
            order_items: [],
          };
        }
      });

      // order_items가 있고, order_type이 'product'인 주문만 필터링 (악보 구매만)
      // order_type이 없어도 order_items가 있으면 악보 구매로 간주
      const filteredOrders = normalizedOrders.filter(
        (order) => 
          (order.order_items?.length ?? 0) > 0 && 
          (order.order_type === 'product' || !order.order_type)
      );

      const downloadItems: DownloadableItem[] = filteredOrders.flatMap((order) =>
        DOWNLOADABLE_STATUSES.includes((order.status ?? '').toLowerCase())
          ? order.order_items
            .filter((item) => item.sheet_slug)
            .map((item) => {
              const mappedItem = {
                ...item,
                order_id: order.id,
                order_status: order.status,
                order_created_at: order.created_at,
                order_expected_completion_date: order.expected_completion_date ?? null,
              };
              
              // 디버깅: 선주문 상품인 경우 로그 출력
              if (item.drum_sheets?.sales_type === 'PREORDER') {
                console.log('[PurchaseHistoryContent] 선주문 상품 발견:', {
                  orderId: order.id,
                  sheetTitle: item.drum_sheets?.title,
                  salesType: item.drum_sheets?.sales_type,
                  expectedCompletionDate: order.expected_completion_date,
                  hasPdf: !!item.drum_sheets?.pdf_url,
                });
              }
              
              return mappedItem;
            })
          : []
      );

      // 디버깅: 선주문 상품이 있는지 확인
      const preorderItems = downloadItems.filter(
        (item) => item.drum_sheets?.sales_type === 'PREORDER' && !item.drum_sheets?.pdf_url
      );
      if (preorderItems.length > 0) {
        console.log('[PurchaseHistoryContent] ✅ 선주문 제작 진행 중 상품 발견:', preorderItems.map((item) => ({
          orderId: item.order_id,
          sheetTitle: item.drum_sheets?.title,
          salesType: item.drum_sheets?.sales_type,
          expectedCompletionDate: item.order_expected_completion_date,
          hasPdf: !!item.drum_sheets?.pdf_url,
        })));
      }

      console.log('[PurchaseHistoryContent] 📊 주문 내역 로드 완료:', {
        totalOrders: filteredOrders.length,
        totalDownloadItems: downloadItems.length,
        preorderItemsCount: preorderItems.length,
      });

      setDownloads(downloadItems);
      setSelectedDownloadIds((prev) => {
        const validKeys = new Set(
          downloadItems.map((item) => buildDownloadKey(item.order_id, item.id))
        );
        return prev.filter((key) => validKeys.has(key));
      });
    } catch (error) {
      console.error('[PurchaseHistoryContent] ❌ 주문 내역 로드 오류:', {
        message: error instanceof Error ? error.message : String(error),
        error: error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      setDownloads([]);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const toggleDownloadSelection = (item: DownloadableItem) => {
    if (!DOWNLOADABLE_STATUSES.includes((item.order_status ?? '').toLowerCase())) {
      return;
    }

    // 선주문 상품이면서 PDF가 없는 경우 선택 불가
    const isPreorderInProgress = item.drum_sheets?.sales_type === 'PREORDER' && !item.drum_sheets?.pdf_url;
    if (isPreorderInProgress) {
      return;
    }

    const key = buildDownloadKey(item.order_id, item.id);
    setSelectedDownloadIds((prev) =>
      prev.includes(key) ? prev.filter((value) => value !== key) : [...prev, key]
    );
  };

  const handleToggleSelectAllDownloads = () => {
    setSelectedDownloadIds((prev) => {
      if (downloads.length === 0) {
        return [];
      }
      return prev.length === downloads.length
        ? []
        : downloads.map((item) => buildDownloadKey(item.order_id, item.id));
    });
  };

  const clearDownloadSelection = () => {
    setSelectedDownloadIds([]);
  };

  const startDownloading = (key: string) => {
    setDownloadingKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  const finishDownloading = (key: string) => {
    setDownloadingKeys((prev) => prev.filter((value) => value !== key));
  };

  const downloadSheetItem = async (item: DownloadableItem, accessToken: string) => {
    if (!item.sheet_slug) {
      throw new Error(t('mypage.errors.sheetInfoNotFound'));
    }

    if (!item.drum_sheets) {
      throw new Error(t('mypage.errors.downloadLinkNotFound'));
    }

    const fileName = getDownloadFileName({
      title: item.drum_sheets?.title,
      artist: item.drum_sheets?.artist,
      orderId: item.order_id,
    });

    const signedUrl = await requestSignedDownloadUrl({
      orderId: item.order_id,
      orderItemId: item.id,
      accessToken,
    });

    await downloadFile(signedUrl, fileName);
  };

  const handleDownloadMultiple = async (items: DownloadableItem[]) => {
    if (items.length === 0) {
      alert(t('mypage.errors.selectDownloadItems'));
      return;
    }

    const invalidItems = items.filter(
      (item) => !DOWNLOADABLE_STATUSES.includes((item.order_status ?? '').toLowerCase())
    );
    if (invalidItems.length > 0) {
      alert(t('mypage.errors.downloadRestrictedMultiple'));
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      alert(t('mypage.errors.loginRequiredForDownload'));
      return;
    }

    setBulkDownloading(true);
    const failed: DownloadableItem[] = [];

    try {
      for (const item of items) {
        const key = buildDownloadKey(item.order_id, item.id);
        startDownloading(key);
        try {
          await downloadSheetItem(item, session.access_token);
        } catch (error) {
          failed.push(item);
        } finally {
          finishDownloading(key);
        }
      }
    } finally {
      setBulkDownloading(false);
    }

    if (failed.length > 0) {
      alert(t('mypage.errors.downloadFailed', { count: failed.length }));
    }
  };

  const handleDownloadSelected = async () => {
    const selectedItems = downloads.filter(
      (item) => {
        const key = buildDownloadKey(item.order_id, item.id);
        if (!selectedDownloadIds.includes(key)) return false;
        if (!DOWNLOADABLE_STATUSES.includes((item.order_status ?? '').toLowerCase())) return false;
        // 선주문 상품이면서 PDF가 없는 경우 제외
        const isPreorderInProgress = item.drum_sheets?.sales_type === 'PREORDER' && !item.drum_sheets?.pdf_url;
        if (isPreorderInProgress) return false;
        return true;
      }
    );
    await handleDownloadMultiple(selectedItems);
  };

  const handleDownloadAll = async () => {
    const downloadableItems = downloads.filter((item) => {
      if (!DOWNLOADABLE_STATUSES.includes((item.order_status ?? '').toLowerCase())) return false;
      // 선주문 상품이면서 PDF가 없는 경우 제외
      const isPreorderInProgress = item.drum_sheets?.sales_type === 'PREORDER' && !item.drum_sheets?.pdf_url;
      if (isPreorderInProgress) return false;
      return true;
    });
    await handleDownloadMultiple(downloadableItems);
  };

  const handleDownload = async (item: DownloadableItem) => {
    if (!DOWNLOADABLE_STATUSES.includes((item.order_status ?? '').toLowerCase())) {
      alert(t('mypage.errors.downloadRestrictedMultiple'));
      return;
    }

    // 선주문 상품이면서 PDF가 없는 경우 다운로드 불가
    const isPreorderInProgress = item.drum_sheets?.sales_type === 'PREORDER' && !item.drum_sheets?.pdf_url;
    if (isPreorderInProgress) {
      alert(t('mypage.errors.downloadRestrictedMultiple'));
      return;
    }

    const key = buildDownloadKey(item.order_id, item.id);
    startDownloading(key);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error(t('mypage.errors.loginRequiredForDownload'));
      }

      await downloadSheetItem(item, session.access_token);
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message);
      } else {
        alert(t('mypage.errors.downloadFailed', { count: 1 }));
      }
    } finally {
      finishDownloading(key);
    }
  };

  const handlePreview = (item: DownloadableItem) => {
    if (!item.sheet_slug) {
      alert(t('mypage.errors.sheetInfoNotFound'));
      return;
    }
    router.push(`/drum-sheet/${item.sheet_slug}`);
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-gray-500">
        <i className="ri-loader-4-line text-4xl animate-spin text-blue-500 mb-4" />
        <p className="font-medium">{t('purchaseHistory.loading')}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xl font-bold text-gray-900">{t('purchaseHistory.listTitle')}</h3>
        <p className="text-sm text-gray-500">{t('purchaseHistory.totalCount', { count: downloads.length })}</p>
      </div>
      {selectedDownloadIds.length > 0 && (
        <div className="text-right">
          <p className="text-xs text-blue-600">{t('mypage.downloads.selectedItems', { count: selectedDownloadIds.length })}</p>
        </div>
      )}

      {downloads.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleToggleSelectAllDownloads}
              disabled={downloads.length === 0 || bulkDownloading}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition ${downloads.length === 0 || bulkDownloading
                ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
            >
              <i className="ri-checkbox-multiple-line text-base" />
              {downloads.length > 0 && selectedDownloadIds.length === downloads.length ? t('mypage.downloads.deselectAll') : t('mypage.downloads.selectAll')}
            </button>
            <button
              onClick={clearDownloadSelection}
              disabled={selectedDownloadIds.length === 0 || bulkDownloading}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition ${selectedDownloadIds.length === 0 || bulkDownloading
                ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
            >
              <i className="ri-close-circle-line text-base" />
              {t('mypage.downloads.deselectAll')}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleDownloadSelected}
              disabled={selectedDownloadIds.length === 0 || bulkDownloading}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition ${selectedDownloadIds.length === 0 || bulkDownloading
                ? 'bg-blue-300 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
                }`}
            >
              <i className="ri-download-2-line text-base" />
              {bulkDownloading ? t('mypage.downloads.downloading') : t('mypage.downloads.downloadSelected')}
            </button>
            <button
              onClick={handleDownloadAll}
              disabled={downloads.length === 0 || bulkDownloading}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition ${downloads.length === 0 || bulkDownloading
                ? 'bg-indigo-300 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
            >
              <i className="ri-stack-line text-base" />
              {bulkDownloading ? t('mypage.downloads.downloading') : t('mypage.downloads.downloadAll')}
            </button>
          </div>
        </div>
      ) : null}

      {downloads.length === 0 ? (
        <div className="py-16 text-center text-gray-500">
          <i className="ri-download-2-line text-4xl text-gray-300 mb-4" />
          <p className="font-medium">{t('purchaseHistory.emptyMessage')}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {downloads.map((item) => {
            const itemKey = buildDownloadKey(item.order_id, item.id);
            const isSelected = selectedDownloadIds.includes(itemKey);
            const isDownloading = bulkDownloading || downloadingKeys.includes(itemKey);
            const isDownloadableStatus = DOWNLOADABLE_STATUSES.includes(
              (item.order_status ?? '').toLowerCase()
            );
            
            // 선주문 상품이면서 PDF가 없는 경우 (제작 진행 중)
            const isPreorderInProgress = item.drum_sheets?.sales_type === 'PREORDER' && !item.drum_sheets?.pdf_url;
            // 선주문 상품이지만 PDF가 있는 경우 (제작 완료)
            const isPreorderCompleted = item.drum_sheets?.sales_type === 'PREORDER' && item.drum_sheets?.pdf_url;
            
            // 체크박스 비활성화 조건: 다운로드 불가능한 상태이거나 선주문 제작 진행 중인 경우
            const isCheckboxDisabled = bulkDownloading || !isDownloadableStatus || isPreorderInProgress;
            
            // 미리보기 버튼 비활성화 조건: 선주문 제작 진행 중인 경우
            const isPreviewDisabled = bulkDownloading || isPreorderInProgress;
            
            // 다운로드 버튼 비활성화 조건: 다운로드 중이거나 다운로드 불가능한 상태이거나 선주문 제작 진행 중인 경우
            const isDownloadDisabled = isDownloading || !isDownloadableStatus || isPreorderInProgress;

            // 제작 진행 중 텍스트 생성
            let progressText = t('mypage.downloads.preorderInProgress');
            let expectedCompletionText = '';
            
            // 예상 완료일 표시 (선주문 제작 진행 중인 경우)
            if (isPreorderInProgress) {
              if (item.order_expected_completion_date) {
                try {
                  const formattedDate = formatDateToKorean(item.order_expected_completion_date);
                  if (formattedDate) {
                    expectedCompletionText = t('mypage.downloads.expectedCompletionDate', {
                      date: formattedDate,
                    });
                  } else {
                    console.warn('[PurchaseHistoryContent] 예상 완료일 포맷팅 결과가 비어있음:', {
                      orderId: item.order_id,
                      rawDate: item.order_expected_completion_date,
                    });
                  }
                } catch (e) {
                  // 날짜 파싱 실패 시 기본 텍스트 사용
                  console.warn('[PurchaseHistoryContent] 예상 완료일 포맷팅 오류:', {
                    error: e,
                    rawDate: item.order_expected_completion_date,
                    orderId: item.order_id,
                    sheetTitle: item.drum_sheets?.title,
                  });
                }
              } else {
                // 예상 완료일이 없는 경우 디버깅 로그
                console.warn('[PurchaseHistoryContent] 선주문 제작 진행 중이지만 예상 완료일이 없음:', {
                  orderId: item.order_id,
                  sheetTitle: item.drum_sheets?.title,
                  salesType: item.drum_sheets?.sales_type,
                  hasPdf: !!item.drum_sheets?.pdf_url,
                  orderExpectedCompletionDate: item.order_expected_completion_date,
                });
              }
            }

            return (
              <div
                key={itemKey}
                className={`rounded-xl border p-4 space-y-3 transition ${isSelected
                  ? 'border-blue-300 bg-blue-50/70 shadow-sm'
                  : 'border-gray-100 bg-white hover:border-blue-200'
                  }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleDownloadSelection(item)}
                    disabled={isCheckboxDisabled}
                    className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex flex-1 items-center gap-3">
                    <img
                      src={
                        item.drum_sheets?.thumbnail_url ||
                        generateDefaultThumbnail(96, 96)
                      }
                      alt={item.drum_sheets?.title ?? t('mypage.downloads.noDownloads')}
                      className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                      onError={(event) => {
                        (event.target as HTMLImageElement).src = generateDefaultThumbnail(96, 96);
                      }}
                    />
                    <div>
                      <h4 className="font-semibold text-gray-900">
                        {item.drum_sheets?.title ?? t('mypage.favorites.deletedSheet')}
                      </h4>
                      <p className="text-sm text-gray-500">{item.drum_sheets?.artist ?? '-'}</p>
                      <p className="text-xs text-gray-400">{t('mypage.downloads.purchaseDate')} {formatDate(item.order_created_at)}</p>
                    </div>
                  </div>
                </div>
                {isPreorderInProgress && (
                  <div className="px-2 py-1.5 rounded-md bg-blue-50 border border-blue-200">
                    {expectedCompletionText ? (
                      <p className="text-sm font-medium text-blue-700">{expectedCompletionText}</p>
                    ) : (
                      <p className="text-sm font-medium text-blue-600">
                        {t('mypage.downloads.preorderInProgress')}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {isPreorderInProgress ? (
                    // 제작 진행 중: 미리보기와 다운로드 버튼 대신 상태 뱃지 표시
                    <div className="flex-1 min-w-[120px] px-3 py-2 rounded-lg text-sm font-semibold text-white bg-gray-400 cursor-not-allowed text-center">
                      {progressText}
                    </div>
                  ) : (
                    // 제작 완료 또는 일반 상품: 일반 버튼 표시
                    <>
                      <button
                        onClick={() => handlePreview(item)}
                        disabled={isPreviewDisabled}
                        className={`flex-1 min-w-[120px] px-3 py-2 rounded-lg text-sm font-semibold transition ${isPreviewDisabled
                          ? 'border border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                      >
                        {t('mypage.downloads.preview')}
                      </button>
                      <button
                        onClick={() => handleDownload(item)}
                        disabled={isDownloadDisabled}
                        className={`flex-1 min-w-[120px] px-3 py-2 rounded-lg text-sm font-semibold text-white transition ${isDownloadDisabled
                          ? 'bg-blue-300 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700'
                          }`}
                      >
                        {isDownloading
                          ? t('mypage.downloads.downloading')
                          : isDownloadableStatus
                            ? t('mypage.downloads.download')
                            : t('mypage.downloads.downloadUnavailable')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

