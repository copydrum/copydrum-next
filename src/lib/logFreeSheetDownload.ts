/**
 * 무료 드럼레슨 악보 다운로드를 로그에 기록하는 유틸리티.
 * 다운로드 실행 직전에 비동기로 호출 (실패해도 다운로드는 진행).
 */
export async function logFreeSheetDownload(params: {
  sheetId: string;
  userId?: string | null;
  downloadSource: 'free-sheets-page' | 'home-page' | 'sheet-detail';
}) {
  try {
    // 세션 ID 가져오기
    const sessionId = typeof window !== 'undefined'
      ? sessionStorage.getItem('copydrum_session_id') || localStorage.getItem('copydrum_session_id') || null
      : null;

    const referrer = typeof document !== 'undefined' ? document.referrer || null : null;
    const pageUrl = typeof window !== 'undefined' ? window.location.href : null;
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;

    await fetch('/api/free-sheets/log-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sheetId: params.sheetId,
        userId: params.userId || null,
        sessionId,
        referrer,
        pageUrl,
        userAgent,
        downloadSource: params.downloadSource,
      }),
    });
  } catch (e) {
    // 로그 기록 실패는 치명적이지 않으므로 경고만 출력
    console.warn('[logFreeSheetDownload] 기록 실패 (다운로드는 정상 진행):', e);
  }
}
