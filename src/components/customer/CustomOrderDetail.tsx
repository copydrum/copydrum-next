import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { useTranslation } from 'react-i18next';
import { getSiteCurrency, convertFromKrw, formatCurrency as formatCurrencyUtil } from '../../lib/currency';

type StatusValue = 'pending' | 'quoted' | 'payment_confirmed' | 'in_progress' | 'completed';

interface StatusMeta {
  label: string;
  badgeClass: string;
  description: string;
}

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

const STATUS_META: Record<StatusValue, StatusMeta> = {
  pending: {
    label: '견적중',
    badgeClass: 'bg-amber-100 text-amber-700 border border-amber-200',
    description: '견적 검토 중입니다. 요청 내용을 확인하고 있습니다.',
  },
  quoted: {
    label: '결제대기',
    badgeClass: 'bg-sky-100 text-sky-700 border border-sky-200',
    description: '입금 대기 중입니다. 안내된 견적을 확인하고 결제를 진행해주세요.',
  },
  payment_confirmed: {
    label: '입금확인',
    badgeClass: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    description: '입금이 확인되었습니다. 제작 일정이 곧 안내됩니다.',
  },
  in_progress: {
    label: '작업중',
    badgeClass: 'bg-indigo-100 text-indigo-700 border border-indigo-200',
    description: '악보 제작 중입니다. 완료되는 대로 알림을 드립니다.',
  },
  completed: {
    label: '작업완료',
    badgeClass: 'bg-purple-100 text-purple-700 border border-purple-200',
    description: '제작이 완료되었습니다. 아래에서 악보를 다운로드할 수 있습니다.',
  },
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR');
};

export default function CustomOrderDetail({ orderId }: CustomOrderDetailProps) {
  const { user } = useAuthStore();
  const { i18n } = useTranslation();
  
  // 통화 결정 (locale 기반)
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'copydrum.com';
  const currency = useMemo(() => getSiteCurrency(hostname, i18n.language), [hostname, i18n.language]);
  
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
  const [isDownloading, setIsDownloading] = useState(false);

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
        throw new Error('해당 주문을 찾을 수 없습니다.');
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
      setError(fetchError?.message ?? '주문 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [orderId, user]);

  useEffect(() => {
    if (user) {
      void loadDetail();
    }
  }, [loadDetail, user]);

  const statusMeta = useMemo(() => {
    if (!order) return STATUS_META.pending;
    return STATUS_META[order.status] ?? STATUS_META.pending;
  }, [order]);

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
      alert(sendError?.message ?? '메시지를 전송하지 못했습니다.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const canDownload = useMemo(() => {
    if (!order?.completed_pdf_url) return false;

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
  }, [order]);

  const downloadRestrictionMessage = useMemo(() => {
    if (!order) return '';
    if (!order.completed_pdf_url) return '아직 다운로드 가능한 파일이 없습니다.';

    const downloadLimit = order.max_download_count;
    const usedCount = order.download_count ?? 0;
    const hasLimit = typeof downloadLimit === 'number' && downloadLimit > 0;
    if (hasLimit && usedCount >= downloadLimit) {
      return '다운로드 횟수를 모두 사용하셨습니다. 추가 다운로드가 필요하시면 고객센터에 문의해주세요.';
    }

    if (order.download_expires_at) {
      const now = new Date();
      const expires = new Date(order.download_expires_at);
      if (!Number.isNaN(expires.getTime()) && now > expires) {
        return '다운로드 가능 기간이 만료되었습니다. 고객센터에 문의해주세요.';
      }
    }

    return '';
  }, [order]);

  const downloadUsageText = useMemo(() => {
    if (!order) return '';

    const usedCount = order.download_count ?? 0;
    const limit = order.max_download_count;
    if (typeof limit === 'number' && limit > 0) {
      return `다운로드 ${usedCount}/${limit}회 사용`;
    }
    return `다운로드 ${usedCount}회 사용 (무제한)`;
  }, [order]);

  const handleDownload = async () => {
    if (!order || !order.completed_pdf_url || !user) return;
    if (!canDownload) {
      const message = downloadRestrictionMessage || '현재는 다운로드할 수 없습니다.';
      alert(message);
      return;
    }

    setIsDownloading(true);
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

        window.open(order.completed_pdf_url, '_blank');

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
        const response = await fetch(order.completed_pdf_url);
        if (!response.ok) {
          throw new Error('파일 다운로드에 실패했습니다.');
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
        link.download = order.completed_pdf_filename || `${order.song_title}_악보.pdf`;
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
      alert(downloadError?.message ?? '다운로드 중 오류가 발생했습니다.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (!user) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-500">주문제작 내역을 확인하려면 로그인해주세요.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <div className="mx-auto h-10 w-10 rounded-full border-b-2 border-blue-600 animate-spin" />
        <p className="mt-3 text-sm text-gray-500">주문 정보를 불러오는 중입니다...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-red-600">
        {error ?? '주문 정보를 찾을 수 없습니다.'}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs text-gray-400">주문 번호</p>
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
              신청일
            </p>
            <p className="mt-1 text-sm text-gray-700">{formatDateTime(order.created_at)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              최근 업데이트
            </p>
            <p className="mt-1 text-sm text-gray-700">{formatDateTime(order.updated_at)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              요청사항
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
              {order.requirements?.trim() || '작성된 요청사항이 없습니다.'}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              참고 링크
            </p>
            {order.song_url ? (
              <a
                href={order.song_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
              >
                영상 바로가기 <i className="ri-external-link-line" />
              </a>
            ) : (
              <p className="mt-1 text-sm text-gray-500">등록된 링크가 없습니다.</p>
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
              <p className="font-semibold">제안된 견적 금액</p>
              <p className="text-xs">
                {formatCurrency(order.estimated_price)} (부가세 포함)
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900">작업 결과</h3>
        <p className="mt-1 text-sm text-gray-500">
          작업이 완료되면 아래에서 악보 PDF 파일을 다운로드할 수 있습니다.
        </p>

        {order.completed_pdf_url ? (
          <div className="mt-4 rounded-lg border border-purple-200 bg-purple-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-purple-800">
                  {order.completed_pdf_filename ?? '완성된 악보.pdf'}
                </p>
                <p className="text-xs text-purple-700">
                  {downloadUsageText} · 만료일 {formatDateTime(order.download_expires_at)}
                </p>
                {downloadRestrictionMessage && !canDownload ? (
                  <p className="mt-2 text-xs text-red-600">{downloadRestrictionMessage}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleDownload}
                disabled={!canDownload || isDownloading}
                className="inline-flex items-center justify-center rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:bg-purple-300"
              >
                {isDownloading ? '다운로드 준비 중...' : 'PDF 다운로드'}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
            아직 업로드된 파일이 없습니다. 작업이 완료되면 알림을 드립니다.
          </div>
        )}
      </section>

      <section className="flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm">
        <header className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">대화 내역</h3>
          <p className="text-xs text-gray-500">
            관리자와의 대화를 통해 진행 상황을 문의하고 추가 요청을 전달할 수 있습니다.
          </p>
        </header>

        <div className="max-h-[420px] flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              아직 대화가 없습니다. 궁금한 내용을 문의해보세요.
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
                        <span>{isCustomer ? '나' : '관리자'}</span>
                        <span>{formatDateTime(message.created_at)}</span>
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
              placeholder="관리자에게 전달할 메시지를 입력하세요."
              value={messageInput}
              onChange={(event) => setMessageInput(event.target.value)}
            />
            <button
              type="submit"
              disabled={!messageInput.trim() || isSendingMessage}
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
            >
              {isSendingMessage ? '전송 중...' : '메시지 보내기'}
            </button>
          </form>
          <p className="mt-2 text-xs text-gray-500">
            메시지는 관리자에게 실시간으로 전달되며, 답변은 이곳에서 확인할 수 있습니다.
          </p>
        </footer>
      </section>
    </div>
  );
}