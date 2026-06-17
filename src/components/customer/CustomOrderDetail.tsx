import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { useTranslation } from 'react-i18next';
import { getSiteCurrency, convertFromKrw, formatCurrency as formatCurrencyUtil } from '../../lib/currency';
import CustomOrderPayPalButton from './CustomOrderPayPalButton';
import CustomOrderKoreanPayButton from './CustomOrderKoreanPayButton';

type StatusValue = 'pending' | 'quoted' | 'payment_confirmed' | 'in_progress' | 'completed';

interface OrderDetail {
  id: string;
  user_id: string;
  song_title: string;
  artist: string;
  song_url: string | null;
  requirements: string | null;
  status: StatusValue;
  estimated_price: number | null;
  completed_pdf_url: string | null;
  completed_pdf_filename: string | null;
  download_count: number | null;
  max_download_count: number | null;
  download_expires_at: string | null;
  locale: string | null;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  custom_order_id: string;
  sender_id: string | null;
  sender_type: 'admin' | 'customer';
  message: string;
  created_at: string;
}

interface CustomOrderDetailProps {
  orderId: string;
}

const STATUS_BADGE: Record<StatusValue, string> = {
  pending: 'bg-amber-100 text-amber-700 border border-amber-200',
  quoted: 'bg-sky-100 text-sky-700 border border-sky-200',
  payment_confirmed: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  in_progress: 'bg-indigo-100 text-indigo-700 border border-indigo-200',
  completed: 'bg-purple-100 text-purple-700 border border-purple-200',
};

const formatDateTime = (value: string | null | undefined, localeTag = 'en-US') => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString(localeTag);
};

const normalizeCompletedFiles = (order: Pick<OrderDetail, 'completed_pdf_url' | 'completed_pdf_filename'>) => {
  const encoded = order.completed_pdf_filename?.trim();
  if (encoded && encoded.startsWith('[')) {
    try {
      const parsed = JSON.parse(encoded) as Array<{ url?: string; filename?: string; uploaded_at?: string }>;
      const files = Array.isArray(parsed)
        ? parsed
          .filter((file) => file && typeof file.url === 'string' && file.url.trim())
          .map((file) => ({
            url: file.url as string,
            filename: file.filename || '완성된 악보.pdf',
            uploaded_at: file.uploaded_at,
          }))
        : [];

      if (files.length > 0) {
        return files;
      }
    } catch (error) {
      console.warn('completed_pdf_filename JSON 파싱 실패:', error);
    }
  }

  if (order.completed_pdf_url) {
    return [
      {
        url: order.completed_pdf_url,
        filename: order.completed_pdf_filename || '완성된 악보.pdf',
      },
    ];
  }

  return [];
};

export default function CustomOrderDetail({ orderId }: CustomOrderDetailProps) {
  const { user } = useAuthStore();
  const { i18n, t } = useTranslation();
  
  // 통화 결정 (locale 기반)
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'copydrum.com';
  const currency = useMemo(() => getSiteCurrency(hostname, i18n.language), [hostname, i18n.language]);
  const localeTag = i18n.language === 'ko' ? 'ko-KR' : 'en-US';
  
  const formatCurrency = useCallback(
    (value: number) => {
      const convertedAmount = convertFromKrw(value, currency);
      return formatCurrencyUtil(convertedAmount, currency);
    },
    [currency],
  );

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [messageInput, setMessageInput] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [downloadingFileKey, setDownloadingFileKey] = useState<string | null>(null);
  const completedFiles = useMemo(() => (order ? normalizeCompletedFiles(order) : []), [order]);

  const loadDetail = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: orderError } = await supabase
        .from('custom_orders')
        .select(
          `
            id,
            user_id,
            song_title,
            artist,
            song_url,
            requirements,
            status,
            estimated_price,
            completed_pdf_url,
            completed_pdf_filename,
            download_count,
            max_download_count,
            download_expires_at,
            locale,
            created_at,
            updated_at
          `
        )
        .eq('id', orderId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (orderError) {
        throw orderError;
      }

      if (!data) {
        throw new Error(t('customOrders.detail.notFound'));
      }

      setOrder(data as OrderDetail);

      const { data: messagesData, error: messageError } = await supabase
        .from('custom_order_messages')
        .select('id, custom_order_id, sender_id, sender_type, message, created_at')
        .eq('custom_order_id', orderId)
        .order('created_at', { ascending: true });

      if (messageError) {
        throw messageError;
      }

      setMessages((messagesData ?? []) as Message[]);
    } catch (fetchError: any) {
      console.error('주문제작 상세 로드 실패:', fetchError);
      setError(fetchError?.message ?? t('customOrders.detail.notFound'));
    } finally {
      setLoading(false);
    }
  }, [orderId, user, t]);

  useEffect(() => {
    if (user) {
      void loadDetail();
    }
  }, [loadDetail, user]);

  const statusMeta = useMemo(() => {
    const rawStatus = order?.status ?? 'pending';
    const status: StatusValue =
      rawStatus === 'payment_confirmed' ? 'in_progress' : rawStatus;
    return {
      label: t(`customOrders.status.${status}.label`),
      description: t(`customOrders.status.${status}.message`),
      badgeClass: STATUS_BADGE[status] ?? STATUS_BADGE.pending,
    };
  }, [order, t]);

  const refreshMessages = useCallback(async () => {
    const { data, error: messageError } = await supabase
      .from('custom_order_messages')
      .select('id, custom_order_id, sender_id, sender_type, message, created_at')
      .eq('custom_order_id', orderId)
      .order('created_at', { ascending: true });

    if (messageError) {
      console.error('메시지 새로고침 실패:', messageError);
      return;
    }

    setMessages((data ?? []) as Message[]);
  }, [orderId]);

  const handleSendMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !order) return;

    const trimmed = messageInput.trim();
    if (!trimmed) return;

    setIsSendingMessage(true);
    try {
      const { error: insertError } = await supabase.from('custom_order_messages').insert({
        custom_order_id: order.id,
        sender_id: user.id,
        sender_type: 'customer',
        message: trimmed,
      });

      if (insertError) {
        throw insertError;
      }

      setMessageInput('');
      await refreshMessages();
    } catch (sendError: any) {
      console.error('메시지 전송 실패:', sendError);
      alert(sendError?.message ?? t('customOrders.detail.sendFailed'));
    } finally {
      setIsSendingMessage(false);
    }
  };

  const canDownload = useMemo(() => {
    if (!order || completedFiles.length === 0) return false;

    const downloadLimit = order.max_download_count;
    const usedCount = order.download_count ?? 0;
    const hasLimit = typeof downloadLimit === 'number' && downloadLimit > 0;
    if (hasLimit && usedCount >= downloadLimit) {
      return false;
    }

    if (order.download_expires_at) {
      const now = new Date();
      const expires = new Date(order.download_expires_at);
      if (Number.isNaN(expires.getTime()) || now > expires) {
        return false;
      }
    }

    return true;
  }, [completedFiles.length, order]);

  const downloadRestrictionMessage = useMemo(() => {
    if (!order) return '';
    if (completedFiles.length === 0) return t('customOrders.detail.noFileAvailable');

    const downloadLimit = order.max_download_count;
    const usedCount = order.download_count ?? 0;
    const hasLimit = typeof downloadLimit === 'number' && downloadLimit > 0;
    if (hasLimit && usedCount >= downloadLimit) {
      return t('customOrders.warnings.downloadLimitExceeded');
    }

    if (order.download_expires_at) {
      const now = new Date();
      const expires = new Date(order.download_expires_at);
      if (!Number.isNaN(expires.getTime()) && now > expires) {
        return t('customOrders.warnings.downloadPeriodExpired');
      }
    }

    return '';
  }, [completedFiles.length, order, t]);

  const downloadUsageText = useMemo(() => {
    if (!order) return '';

    const usedCount = order.download_count ?? 0;
    const limit = order.max_download_count;
    if (typeof limit === 'number' && limit > 0) {
      return t('customOrders.detail.downloadUsage', { used: usedCount, limit });
    }
    return t('customOrders.detail.downloadUsageUnlimited', { used: usedCount });
  }, [order, t]);

  const handleDownload = async (fileUrl: string, fileName: string, fileIndex: number) => {
    if (!order || !user) return;
    if (!canDownload) {
      const message = downloadRestrictionMessage || t('customOrders.detail.downloadUnavailable');
      alert(message);
      return;
    }

    const fileKey = `${fileUrl}-${fileIndex}`;
    setDownloadingFileKey(fileKey);
    try {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      if (isMobile) {
        // Mobile: Open directly in new tab to avoid blob issues
        const { error: updateError } = await supabase
          .from('custom_orders')
          .update({
            download_count: (order.download_count ?? 0) + 1,
          })
          .eq('id', order.id)
          .eq('user_id', user.id);

        if (updateError) throw updateError;

        window.open(fileUrl, '_blank');

        setOrder((prev) =>
          prev
            ? {
              ...prev,
              download_count: (prev.download_count ?? 0) + 1,
            }
            : prev
        );
      } else {
        // PC: Fetch blob to force download with correct filename
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(t('customOrders.detail.downloadFetchFailed'));
        }

        const blob = await response.blob();

        // Increment count ONLY after successful fetch
        const { error: updateError } = await supabase
          .from('custom_orders')
          .update({
            download_count: (order.download_count ?? 0) + 1,
          })
          .eq('id', order.id)
          .eq('user_id', user.id);

        if (updateError) throw updateError;

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName || `${order.song_title}_${fileIndex + 1}_${t('customOrders.order.sheetMusicSuffix')}.pdf`;
        document.body.appendChild(link);
        link.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);

        setOrder((prev) =>
          prev
            ? {
              ...prev,
              download_count: (prev.download_count ?? 0) + 1,
            }
            : prev
        );
      }
    } catch (downloadError: any) {
      console.error('다운로드 실패:', downloadError);
      alert(downloadError?.message ?? t('customOrders.alerts.downloadFailed'));
    } finally {
      setDownloadingFileKey(null);
    }
  };

  if (!user) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-500">{t('customOrders.detail.loginRequired')}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <div className="mx-auto h-10 w-10 rounded-full border-b-2 border-blue-600 animate-spin" />
        <p className="mt-3 text-sm text-gray-500">{t('customOrders.detail.loadingOrder')}</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-red-600">
        {error ?? t('customOrders.detail.notFound')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs text-gray-400">{t('customOrders.detail.orderNumber')}</p>
            <h2 className="mt-1 text-2xl font-bold text-gray-900">{order.song_title}</h2>
            <p className="text-sm text-gray-600">{order.artist}</p>
          </div>
          <div className="flex items-start gap-3">
            <div
              className={`rounded-full px-4 py-2 text-sm font-semibold ${statusMeta.badgeClass}`}
            >
              {statusMeta.label}
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t('customOrders.order.applicationDate')}
            </p>
            <p className="mt-1 text-sm text-gray-700">{formatDateTime(order.created_at, localeTag)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t('customOrders.order.recentUpdate')}
            </p>
            <p className="mt-1 text-sm text-gray-700">{formatDateTime(order.updated_at, localeTag)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t('customOrders.order.requirements')}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
              {order.requirements?.trim() || t('customOrders.order.noRequirements')}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t('customOrders.detail.referenceLink')}
            </p>
            {order.song_url ? (
              <a
                href={order.song_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
              >
                {t('customOrders.detail.watchVideo')} <i className="ri-external-link-line" />
              </a>
            ) : (
              <p className="mt-1 text-sm text-gray-500">{t('customOrders.detail.noLink')}</p>
            )}
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {statusMeta.description}
        </div>
        {order.estimated_price != null && typeof order.estimated_price === 'number' && order.estimated_price > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
            <i className="ri-price-tag-3-line text-lg" />
            <div>
              <p className="font-semibold">{t('customOrders.order.proposedQuote', '제안된 견적 금액')}</p>
              <p className="text-xs">
                {order.locale && order.locale !== 'ko'
                  ? `$${order.estimated_price} (${t('customOrders.detail.taxIncluded')})`
                  : `${formatCurrency(order.estimated_price)} (${t('customOrders.detail.taxIncluded')})`}
              </p>
            </div>
          </div>
        )}

        {/* 견적 결제 (글로벌 주문: PayPal) — 견적 완료 & USD 견적일 때만 노출 */}
        {order.status === 'quoted' &&
          typeof order.estimated_price === 'number' &&
          order.estimated_price > 0 &&
          order.locale != null &&
          order.locale !== 'ko' && (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">{t('customOrders.detail.payTitle')}</h3>
                <span className="text-sm font-bold text-blue-700">
                  {t('customOrders.detail.payAmount')}: ${order.estimated_price}
                </span>
              </div>
              <p className="mb-4 text-xs text-gray-600">{t('customOrders.detail.paySubtitle')}</p>
              <CustomOrderPayPalButton
                customOrderId={order.id}
                amountUSD={order.estimated_price}
                songTitle={order.song_title}
                onConfirmed={() => {
                  void loadDetail();
                }}
              />
            </div>
          )}

        {/* 견적 결제 (한국 주문: 카드 / 카카오페이) — 견적 완료 & 한국 주문일 때만 노출 */}
        {order.status === 'quoted' &&
          typeof order.estimated_price === 'number' &&
          order.estimated_price > 0 &&
          (order.locale == null || order.locale === 'ko') && (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">{t('customOrders.detail.payTitle')}</h3>
                <span className="text-sm font-bold text-blue-700">
                  {t('customOrders.detail.payAmount')}: {formatCurrency(order.estimated_price)}
                </span>
              </div>
              <p className="mb-4 text-xs text-gray-600">{t('customOrders.detail.paySubtitleKr')}</p>
              <CustomOrderKoreanPayButton
                customOrderId={order.id}
                amountKRW={order.estimated_price}
                songTitle={order.song_title}
                onConfirmed={() => {
                  void loadDetail();
                }}
              />
            </div>
          )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900">{t('customOrders.detail.resultTitle')}</h3>
        <p className="mt-1 text-sm text-gray-500">
          {t('customOrders.detail.resultDesc')}
        </p>

        {completedFiles.length > 0 ? (
          <div className="mt-4 rounded-lg border border-purple-200 bg-purple-50 p-4">
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-semibold text-purple-800">
                  {t('customOrders.detail.downloadableFiles', { count: completedFiles.length })}
                </p>
                <p className="text-xs text-purple-700">
                  {downloadUsageText} · {t('customOrders.order.expiryDate')} {formatDateTime(order.download_expires_at, localeTag)}
                </p>
                {downloadRestrictionMessage && !canDownload ? (
                  <p className="mt-2 text-xs text-red-600">{downloadRestrictionMessage}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                {completedFiles.map((file, index) => {
                  const fileKey = `${file.url}-${index}`;
                  const isDownloading = downloadingFileKey === fileKey;

                  return (
                    <div
                      key={fileKey}
                      className="flex flex-col gap-2 rounded-md bg-white/80 px-3 py-2 md:flex-row md:items-center md:justify-between"
                    >
                      <p className="text-sm text-purple-800">
                        {index + 1}. {file.filename || `${t('customOrders.order.completedSheet')}_${index + 1}.pdf`}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleDownload(file.url, file.filename || '', index)}
                        disabled={!canDownload || isDownloading}
                        className="inline-flex items-center justify-center rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:bg-purple-300"
                      >
                        {isDownloading ? t('customOrders.detail.downloadPreparing') : t('customOrders.detail.downloadPdf')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
            {t('customOrders.detail.noFilesYet')}
          </div>
        )}
      </section>

      <section className="flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm">
        <header className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">{t('customOrders.detail.chatTitle')}</h3>
          <p className="text-xs text-gray-500">
            {t('customOrders.detail.chatDesc')}
          </p>
        </header>

        <div className="max-h-[420px] flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              {t('customOrders.detail.chatEmpty')}
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => {
                const isCustomer = message.sender_type === 'customer';
                return (
                  <div
                    key={message.id}
                    className={`flex ${isCustomer ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-md rounded-2xl px-4 py-3 text-sm shadow-sm ${isCustomer
                          ? 'bg-blue-600 text-white rounded-br-sm'
                          : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                        }`}
                    >
                      <div className="flex items-center gap-2 text-xs opacity-80">
                        <span>{isCustomer ? t('customOrders.detail.me') : t('customOrders.detail.admin')}</span>
                        <span>{formatDateTime(message.created_at, localeTag)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap">{message.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <footer className="border-t border-gray-200 bg-gray-50 px-6 py-4">
          <form className="flex flex-col gap-3 md:flex-row" onSubmit={handleSendMessage}>
            <textarea
              className="min-h-[100px] flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={t('customOrders.detail.messagePlaceholder')}
              value={messageInput}
              onChange={(event) => setMessageInput(event.target.value)}
            />
            <button
              type="submit"
              disabled={!messageInput.trim() || isSendingMessage}
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
            >
              {isSendingMessage ? t('customOrders.detail.sending') : t('customOrders.detail.sendMessage')}
            </button>
          </form>
          <p className="mt-2 text-xs text-gray-500">
            {t('customOrders.detail.chatFooterNote')}
          </p>
        </footer>
      </section>
    </div>
  );
}