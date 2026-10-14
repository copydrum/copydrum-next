'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useLocaleRouter } from '../../hooks/useLocaleRouter';
import {
  downloadCustomOrderFile,
  getCustomOrderDownloadBlock,
  normalizeCompletedFiles,
} from '../../lib/customOrderDownload';
import MyBookCoverPreview from './MyBookCoverPreview';

const PAID_STATUSES = ['payment_confirmed', 'in_progress', 'completed'];
const LISTED_STATUSES = ['quoted', ...PAID_STATUSES];

interface MyBookPurchaseRow {
  id: string;
  status: string;
  book_title: string | null;
  song_title: string;
  book_item_count: number | null;
  book_page_count?: number | null;
  book_cover_theme?: string | null;
  cover_file_path: string | null;
  completed_pdf_url: string | null;
  completed_pdf_filename: string | null;
  download_count: number | null;
  max_download_count: number | null;
  download_expires_at: string | null;
  created_at: string;
}

const formatDate = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ko-KR');
};

/** 구매내역 상단: 결제한 나만의 악보집을 다시 받을 수 있게 모아 보여 준다 */
export default function MyBookPurchaseList({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const router = useLocaleRouter();
  const [orders, setOrders] = useState<MyBookPurchaseRow[]>([]);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('custom_orders')
        .select('*')
        .eq('user_id', userId)
        .eq('order_type', 'book')
        .in('status', LISTED_STATUSES)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error('[my-book] 구매내역 악보집 조회 실패:', error);
        return;
      }
      setOrders((data ?? []) as MyBookPurchaseRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (orders.length === 0) return null;

  const handleDownload = async (order: MyBookPurchaseRow, fileUrl: string, fileName: string, key: string) => {
    setDownloadingKey(key);
    try {
      await downloadCustomOrderFile({
        orderId: order.id,
        userId,
        currentCount: order.download_count ?? 0,
        fileUrl,
        fileName,
        fetchFailedMessage: t('customOrders.detail.downloadFetchFailed'),
      });
      setOrders((prev) =>
        prev.map((row) => (row.id === order.id ? { ...row, download_count: (row.download_count ?? 0) + 1 } : row))
      );
    } catch (error) {
      console.error('[my-book] 악보집 다운로드 실패:', error);
      alert(error instanceof Error ? error.message : t('customOrders.alerts.downloadFailed'));
    } finally {
      setDownloadingKey(null);
    }
  };

  return (
    <section className="mb-6 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50 p-5 shadow-sm md:p-6">
      <div className="mb-4">
        <h3 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <i className="ri-book-3-line text-indigo-600" />
          {t('myBook.purchases.title')}
          <span className="text-sm font-semibold text-indigo-600">{orders.length}</span>
        </h3>
        <p className="mt-1 break-keep text-sm text-gray-500">{t('myBook.purchases.desc')}</p>
      </div>

      <ul className="space-y-3">
        {orders.map((order) => {
          const unpaid = !PAID_STATUSES.includes(order.status);
          const files = unpaid ? [] : normalizeCompletedFiles(order);
          const block = getCustomOrderDownloadBlock(order, files.length);
          const title = order.book_title || order.song_title;
          const count = order.book_item_count ?? 0;
          const limit = order.max_download_count;
          const coverUrl =
            order.cover_file_path && /\.(jpe?g|png)$/i.test(order.cover_file_path)
              ? supabase.storage.from('custom-orders').getPublicUrl(order.cover_file_path).data.publicUrl
              : null;

          return (
            <li key={order.id} className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl} alt="" className="h-[68px] w-12 shrink-0 rounded object-cover shadow ring-1 ring-black/5" />
                ) : (
                  <MyBookCoverPreview title={title} songCount={count} themeId={order.book_cover_theme} width={48} className="shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{title}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {order.book_page_count
                      ? t('myBook.purchases.meta', { count, pages: order.book_page_count })
                      : t('myBook.purchases.metaNoPages', { count })}
                    {' · '}
                    {unpaid
                      ? t('myBook.purchases.orderedAt', { date: formatDate(order.created_at) })
                      : t('myBook.purchases.purchasedAt', { date: formatDate(order.created_at) })}
                  </p>
                  {files.length > 0 && typeof limit === 'number' && limit > 0 && (
                    <p className="mt-0.5 text-xs text-gray-400">
                      {t('myBook.purchases.usage', {
                        used: order.download_count ?? 0,
                        limit,
                        expires: formatDate(order.download_expires_at),
                      })}
                    </p>
                  )}
                  {block === 'limit' && (
                    <p className="mt-1 text-xs text-red-600">{t('customOrders.warnings.downloadLimitExceeded')}</p>
                  )}
                  {block === 'expired' && (
                    <p className="mt-1 text-xs text-red-600">{t('customOrders.warnings.downloadPeriodExpired')}</p>
                  )}
                  {unpaid ? (
                    <p className="mt-1 text-xs text-amber-600">{t('myBook.purchases.unpaidDesc')}</p>
                  ) : (
                    block === 'no_file' && (
                      <p className="mt-1 text-xs text-indigo-600">{t('myBook.purchases.buildingDesc')}</p>
                    )
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                {unpaid ? (
                  <button
                    type="button"
                    onClick={() => router.push(`/custom-order-detail/${order.id}`)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 sm:flex-none"
                  >
                    <i className="ri-bank-card-line" />
                    {t('myBook.purchases.pay')}
                  </button>
                ) : block === 'no_file' ? (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-100 px-3 py-2 text-sm font-semibold text-indigo-700">
                    <i className="ri-loader-4-line animate-spin" />
                    {t('myBook.purchases.building')}
                  </span>
                ) : (
                  files.map((file, index) => {
                    const key = `${order.id}-${index}`;
                    const busy = downloadingKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => void handleDownload(order, file.url, file.filename, key)}
                        disabled={block !== null || busy}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300 sm:flex-none"
                      >
                        <i className="ri-download-2-line" />
                        {busy ? t('myBook.purchases.downloading') : t('myBook.purchases.download')}
                        {files.length > 1 ? ` ${index + 1}` : ''}
                      </button>
                    );
                  })
                )}
                <button
                  type="button"
                  onClick={() => router.push(`/custom-order-detail/${order.id}`)}
                  className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  {t('myBook.purchases.detail')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
