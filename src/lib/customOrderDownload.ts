import { supabase } from './supabase';

export interface CustomOrderCompletedFile {
  url: string;
  filename: string;
  uploaded_at?: string;
}

interface CompletedFileFields {
  completed_pdf_url: string | null;
  completed_pdf_filename: string | null;
}

interface DownloadLimitFields {
  download_count: number | null;
  max_download_count: number | null;
  download_expires_at: string | null;
}

/** completed_pdf_filename 에 JSON 배열로 저장된 여러 파일 또는 단일 completed_pdf_url 을 목록으로 만든다 */
export function normalizeCompletedFiles(order: CompletedFileFields): CustomOrderCompletedFile[] {
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
}

export type CustomOrderDownloadBlock = 'no_file' | 'limit' | 'expired' | null;

export function getCustomOrderDownloadBlock(order: DownloadLimitFields, fileCount: number): CustomOrderDownloadBlock {
  if (fileCount === 0) return 'no_file';

  const limit = order.max_download_count;
  if (typeof limit === 'number' && limit > 0 && (order.download_count ?? 0) >= limit) {
    return 'limit';
  }

  if (order.download_expires_at) {
    const expires = new Date(order.download_expires_at);
    if (Number.isNaN(expires.getTime()) || Date.now() > expires.getTime()) {
      return 'expired';
    }
  }

  return null;
}

/**
 * 주문제작 완성 파일을 받고 다운로드 횟수를 1 올린다.
 * 모바일은 blob 저장이 불안정해 새 탭으로 열고, PC 는 파일명을 지정해 저장한다.
 */
export async function downloadCustomOrderFile(params: {
  orderId: string;
  userId: string;
  currentCount: number;
  fileUrl: string;
  fileName: string;
  fetchFailedMessage: string;
}) {
  const { orderId, userId, currentCount, fileUrl, fileName, fetchFailedMessage } = params;
  const increment = async () => {
    const { error } = await supabase
      .from('custom_orders')
      .update({ download_count: currentCount + 1 })
      .eq('id', orderId)
      .eq('user_id', userId);
    if (error) throw error;
  };

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobile) {
    await increment();
    window.open(fileUrl, '_blank');
    return;
  }

  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(fetchFailedMessage);
  }
  const blob = await response.blob();

  // 파일을 실제로 받은 뒤에만 횟수를 올린다
  await increment();

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(link);
}
