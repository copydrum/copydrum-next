import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';

type StatusOptionValue = 'pending' | 'quoted' | 'payment_confirmed' | 'in_progress' | 'completed' | 'cancelled';

interface StatusOption {
  value: StatusOptionValue;
  label: string;
  description: string;
}

interface OrderProfile {
  id: string;
  email: string | null;
  name: string | null;
}

interface OrderDetail {
  id: string;
  user_id: string;
  song_title: string;
  artist: string;
  song_url: string | null;
  requirements: string | null;
  status: StatusOptionValue;
  estimated_price: number | null;
  completed_pdf_url: string | null;
  completed_pdf_filename: string | null;
  download_count: number | null;
  max_download_count: number | null;
  download_expires_at: string | null;
  created_at: string;
  updated_at: string;
  profiles: OrderProfile | null;
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
  onClose: () => void;
  onUpdated?: () => void;
}

const STATUS_OPTIONS: StatusOption[] = [
  { value: 'pending', label: '견적중', description: '견적 검토 중입니다' },
  { value: 'quoted', label: '결제대기', description: '입금 대기 중입니다' },
  { value: 'payment_confirmed', label: '입금확인', description: '입금이 확인되었습니다' },
  { value: 'in_progress', label: '작업중', description: '악보 제작 중입니다' },
  { value: 'completed', label: '작업완료', description: '제작이 완료되었습니다' },
  { value: 'cancelled', label: '취소됨', description: '주문이 취소되었습니다' },
];

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR');
};

const getStatusMeta = (status: StatusOptionValue) => {
  return STATUS_OPTIONS.find((option) => option.value === status) ?? STATUS_OPTIONS[0];
};

export default function CustomOrderDetail({ orderId, onClose, onUpdated }: CustomOrderDetailProps) {
  const { user } = useAuthStore();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [messageInput, setMessageInput] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  const [selectedStatus, setSelectedStatus] = useState<StatusOptionValue>('pending');
  const [isSavingStatus, setIsSavingStatus] = useState(false);

  const [estimatedPrice, setEstimatedPrice] = useState<string>('');
  const [isSavingPrice, setIsSavingPrice] = useState(false);

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);

  const loadOrderDetail = useCallback(async () => {
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
            updated_at,
            profiles (
              id,
              email,
              name
            )
          `
        )
        .eq('id', orderId)
        .maybeSingle();

      if (orderError) {
        throw orderError;
      }

      if (!data) {
        throw new Error('주문 정보를 찾을 수 없습니다.');
      }

      setOrder(data as OrderDetail);
      setSelectedStatus((data.status as StatusOptionValue) ?? 'pending');
      setEstimatedPrice(
        typeof data.estimated_price === 'number' ? data.estimated_price.toString() : ''
      );

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
      console.error('주문제작 상세 정보 로드 실패:', fetchError);
      setError(fetchError?.message ?? '주문 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void loadOrderDetail();
  }, [loadOrderDetail]);

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
    const trimmedMessage = messageInput.trim();
    if (!trimmedMessage || !order) return;

    setIsSendingMessage(true);
    try {
      const { error: invokeError } = await supabase.functions.invoke('admin-send-custom-order-message', {
        body: {
          customOrderId: order.id,
          message: trimmedMessage,
        },
      });

      if (invokeError) {
        throw invokeError;
      }

      setMessageInput('');
      await refreshMessages();
      onUpdated?.();
    } catch (sendError: any) {
      console.error('메시지 전송 실패:', sendError);
      alert(sendError?.message ?? '메시지를 전송하지 못했습니다.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleStatusChange = async () => {
    if (!order || !selectedStatus) return;
    if (selectedStatus === order.status) return;

    setIsSavingStatus(true);
    try {
      const { error: updateError } = await supabase
        .from('custom_orders')
        .update({ status: selectedStatus })
        .eq('id', order.id);

      if (updateError) {
        throw updateError;
      }

      setOrder((prev) => (prev ? { ...prev, status: selectedStatus } : prev));
      alert('상태가 변경되었습니다.');
      onUpdated?.();
    } catch (err: any) {
      console.error('상태 변경 실패:', err);
      alert(err?.message ?? '상태 변경 중 오류가 발생했습니다.');
    } finally {
      setIsSavingStatus(false);
    }
  };

  const handlePriceChange = async () => {
    if (!order) return;

    const priceNum = parseInt(estimatedPrice.replace(/,/g, ''), 10);
    if (Number.isNaN(priceNum)) {
      alert('유효한 금액을 입력해주세요.');
      return;
    }

    setIsSavingPrice(true);
    try {
      const { error: updateError } = await supabase
        .from('custom_orders')
        .update({ estimated_price: priceNum })
        .eq('id', order.id);

      if (updateError) {
        throw updateError;
      }

      setOrder((prev) => (prev ? { ...prev, estimated_price: priceNum } : prev));
      alert('견적 금액이 저장되었습니다.');
      onUpdated?.();
    } catch (err: any) {
      console.error('금액 저장 실패:', err);
      alert(err?.message ?? '금액 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingPrice(false);
    }
  };

  const handlePdfUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!order || !pdfFile) return;

    // Client-side file size validation (max 20MB)
    const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB in bytes
    if (pdfFile.size > MAX_FILE_SIZE) {
      alert('파일 크기는 20MB를 초과할 수 없습니다.');
      return;
    }

    setIsUploadingPdf(true);
    try {
      const fileExt = pdfFile.name.split('.').pop() ?? 'pdf';
      const filePath = `${order.user_id}/${order.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('custom-orders')
        .upload(filePath, pdfFile);

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage
        .from('custom-orders')
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;

      const { error: updateError } = await supabase
        .from('custom_orders')
        .update({
          completed_pdf_url: publicUrl,
          completed_pdf_filename: pdfFile.name,
          status: 'completed', // PDF 업로드 시 자동으로 완료 상태로 변경
        })
        .eq('id', order.id);

      if (updateError) {
        throw updateError;
      }

      setOrder((prev) =>
        prev
          ? {
            ...prev,
            completed_pdf_url: publicUrl,
            completed_pdf_filename: pdfFile.name,
            status: 'completed',
          }
          : prev
      );
      setSelectedStatus('completed');
      setPdfFile(null);
      alert('악보 파일이 업로드되었습니다.');
      onUpdated?.();
    } catch (err: any) {
      console.error('PDF 업로드 실패:', err);
      alert(err?.message ?? '파일 업로드 중 오류가 발생했습니다.');
    } finally {
      setIsUploadingPdf(false);
    }
  };

  const handleResetDownloadCount = async () => {
    if (!order) return;
    if (!confirm('다운로드 횟수를 초기화하시겠습니까? (횟수 0, 최대 20회로 설정됩니다)')) return;

    try {
      const { error: updateError } = await supabase
        .from('custom_orders')
        .update({
          download_count: 0,
          max_download_count: 20,
        })
        .eq('id', order.id);

      if (updateError) throw updateError;

      setOrder((prev) =>
        prev
          ? {
            ...prev,
            download_count: 0,
            max_download_count: 20,
          }
          : prev
      );
      alert('다운로드 횟수가 초기화되었습니다.');
    } catch (err: any) {
      console.error('초기화 실패:', err);
      alert('초기화 중 오류가 발생했습니다.');
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4 text-red-600">
        <p>{error ?? '주문 정보를 불러올 수 없습니다.'}</p>
        <button onClick={onClose} className="text-sm text-gray-500 underline">
          닫기
        </button>
      </div>
    );
  }

  const statusMeta = getStatusMeta(selectedStatus);

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">주문 상세 정보</h2>
          <p className="text-sm text-gray-500">ID: {order.id}</p>
        </div>
        <button onClick={onClose} className="rounded-md p-2 hover:bg-gray-100">
          <i className="ri-close-line text-xl" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Left Column: Order Info & Status */}
          <div className="space-y-6">
            <section className="rounded-lg border border-gray-200 p-4">
              <h3 className="mb-4 font-semibold text-gray-900">기본 정보</h3>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">신청자</dt>
                  <dd className="font-medium text-gray-900">
                    {order.profiles?.name} ({order.profiles?.email})
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">곡 제목</dt>
                  <dd className="font-medium text-gray-900">{order.song_title}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">아티스트</dt>
                  <dd className="font-medium text-gray-900">{order.artist}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">신청일시</dt>
                  <dd className="text-gray-700">{formatDateTime(order.created_at)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">참고 링크</dt>
                  <dd>
                    {order.song_url ? (
                      <a
                        href={order.song_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        링크 열기
                      </a>
                    ) : (
                      '-'
                    )}
                  </dd>
                </div>
              </dl>
              <div className="mt-4">
                <p className="mb-1 text-xs font-medium text-gray-500">요청사항</p>
                <div className="rounded bg-gray-50 p-3 text-sm text-gray-700">
                  {order.requirements || '없음'}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 p-4">
              <h3 className="mb-4 font-semibold text-gray-900">상태 관리</h3>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    진행 상태
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value as StatusOptionValue)}
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleStatusChange}
                      disabled={selectedStatus === order.status || isSavingStatus}
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
                    >
                      변경
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{statusMeta.description}</p>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    견적 금액 (원)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={estimatedPrice}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setEstimatedPrice(Number(val).toLocaleString());
                      }}
                      placeholder="0"
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                    <button
                      onClick={handlePriceChange}
                      disabled={isSavingPrice}
                      className="rounded-md bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:bg-gray-400"
                    >
                      저장
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 p-4">
              <h3 className="mb-4 font-semibold text-gray-900">파일 업로드</h3>
              {order.completed_pdf_url ? (
                <div className="mb-4 rounded bg-green-50 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-green-800">
                        파일이 등록되어 있습니다
                      </p>
                      <a
                        href={order.completed_pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-green-600 hover:underline"
                      >
                        {order.completed_pdf_filename}
                      </a>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      <p>다운로드: {order.download_count ?? 0} / {order.max_download_count ?? '무제한'}</p>
                      <button
                        onClick={handleResetDownloadCount}
                        className="mt-1 text-blue-600 underline hover:text-blue-800"
                      >
                        횟수 초기화
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mb-4 text-sm text-gray-500">
                  작업이 완료되면 악보 PDF 파일을 업로드해주세요.
                </p>
              )}

              <form onSubmit={handlePdfUpload} className="space-y-3">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
                />
                <button
                  type="submit"
                  disabled={!pdfFile || isUploadingPdf}
                  className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
                >
                  {isUploadingPdf ? '업로드 중...' : 'PDF 파일 등록'}
                </button>
              </form>
            </section>
          </div>

          {/* Right Column: Messages */}
          <div className="flex flex-col rounded-lg border border-gray-200 bg-gray-50">
            <div className="border-b border-gray-200 bg-white px-4 py-3">
              <h3 className="font-semibold text-gray-900">대화 내역</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4" style={{ minHeight: '400px' }}>
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
                  대화 내역이 없습니다.
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg) => {
                    const isAdmin = msg.sender_type === 'admin';
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-4 py-2 text-sm shadow-sm ${isAdmin
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-gray-800 border border-gray-200'
                            }`}
                        >
                          <p className="whitespace-pre-wrap">{msg.message}</p>
                          <p
                            className={`mt-1 text-xs ${isAdmin ? 'text-blue-100' : 'text-gray-400'
                              }`}
                          >
                            {formatDateTime(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="border-t border-gray-200 bg-white p-4">
              <form onSubmit={handleSendMessage} className="flex flex-col gap-2">
                <textarea
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="메시지를 입력하세요..."
                  rows={4}
                  className="min-h-[100px] flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={!messageInput.trim() || isSendingMessage}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
                >
                  전송
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}