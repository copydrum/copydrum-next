export const buildDownloadKey = (orderId: string | null | undefined, itemId: string) =>
  `${orderId ?? 'unknown-order'}-${itemId}`;

const sanitizeFileName = (value: string) => value.replace(/[\\/:*?"<>|]+/g, '_').trim();

const ensurePdfExtension = (fileName: string) =>
  fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;

const createFallbackName = (orderId: string | null | undefined) =>
  `악보-${(orderId ?? 'NOORDER').slice(0, 8).toUpperCase()}`;

export const getDownloadFileName = ({
  title,
  artist,
  orderId,
}: {
  title?: string | null;
  artist?: string | null;
  orderId?: string | null;
}) => {
  const baseName = [artist?.trim(), title?.trim()].filter(Boolean).join(' - ');
  const fallbackName = createFallbackName(orderId ?? undefined);
  const sanitized = sanitizeFileName(baseName || title?.trim() || fallbackName);
  return ensurePdfExtension(sanitized || fallbackName);
};

export const requestSignedDownloadUrl = async ({
  orderId,
  orderItemId,
  accessToken,
}: {
  orderId: string;
  orderItemId: string;
  accessToken: string;
}): Promise<string> => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('다운로드 설정이 잘못되었습니다. 관리자에게 문의해주세요.');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/download`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ orderId, orderItemId }),
  });

  if (!response.ok) {
    let message = '다운로드가 제한된 주문입니다.';
    try {
      const raw = await response.text();
      if (raw) {
        message = raw;
        try {
          const payload = JSON.parse(raw);
          if (payload?.error) {
            message = payload.error;
          }
        } catch {
          // ignore parse error
        }
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const payload = await response.json();
  if (!payload?.url) {
    throw new Error('서명 URL을 발급하지 못했습니다. 잠시 후 다시 시도해주세요.');
  }
  return payload.url as string;
};

/**
 * 모바일 환경인지 감지
 */
const isMobileDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

/**
 * 현재 페이지가 보안 컨텍스트(HTTPS 또는 localhost)인지 확인
 */
const isSecureContext = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext ?? window.location.protocol === 'https:' ?? window.location.hostname === 'localhost';
};

export const downloadFile = async (url: string, fileName: string) => {
  try {
    // 모바일 환경: Supabase 서명 URL에 이미 download=파일명 쿼리가 포함되어
    // Content-Disposition: attachment 헤더가 설정되므로 직접 이동만으로 다운로드 가능.
    // anchor.download + cross-origin HTTPS URL은 모바일 브라우저에서 보안 오류 발생 가능.
    if (isMobileDevice()) {
      window.location.href = url;
      return;
    }

    // 비-HTTPS 환경 (개발 서버 등): 동일하게 직접 이동
    if (!isSecureContext()) {
      window.location.href = url;
      return;
    }

    // 데스크톱 HTTPS 환경: blob 방식으로 다운로드 (파일명 보장)
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error('파일 다운로드 실패:', error);
    // blob 방식 실패 시 직접 URL 열기로 fallback
    try {
      window.open(url, '_blank');
    } catch {
      throw new Error('파일 다운로드에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  }
};


