import { useState, useEffect, useMemo } from 'react';

const getHostInfo = () => {
  if (typeof window === 'undefined') {
    return { isEnglish: false };
  }
  const host = window.location.hostname.toLowerCase();
  return { isEnglish: host.startsWith('en.') };
};

export default function LoginIssueNotice() {
  const [isVisible, setIsVisible] = useState(false);
  const { isEnglish } = getHostInfo();

  useEffect(() => {
    // localStorage에서 닫힘 상태 확인
    const isDismissed = localStorage.getItem('loginIssueNoticeDismissed');
    // 임시: 항상 표시 (테스트용)
    setIsVisible(true);
    // 원래 코드: if (!isDismissed) { setIsVisible(true); }
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    // 24시간 동안 다시 보지 않기
    localStorage.setItem('loginIssueNoticeDismissed', 'true');
    // 24시간 후 자동으로 다시 표시되도록 설정 (선택사항)
    const expiryTime = Date.now() + 24 * 60 * 60 * 1000;
    localStorage.setItem('loginIssueNoticeExpiry', expiryTime.toString());
  };

  // 만료 시간 확인 (24시간 후 다시 표시)
  useEffect(() => {
    const expiry = localStorage.getItem('loginIssueNoticeExpiry');
    if (expiry && Date.now() > parseInt(expiry)) {
      localStorage.removeItem('loginIssueNoticeDismissed');
      localStorage.removeItem('loginIssueNoticeExpiry');
    }
  }, []);

  const copy = useMemo(() => {
    if (isEnglish) {
      return {
        title: 'Notice',
        message1: 'Currently, there are errors with',
        message2: 'Kakao login and Google login',
        message3: 'and we are working to restore them.',
        message4: 'We are working to restore these functions as soon as possible.',
        message5: 'We apologize for the inconvenience. We will restore normal service shortly.',
        button: 'OK',
        closeLabel: 'Close',
      };
    }

    return {
      title: '공지사항',
      message1: '현재',
      message2: '카카오 로그인, 구글 로그인',
      message3: '에 오류가 발생하여 복구 중에 있습니다.',
      message4: '빠른 시일 내에 복구하도록 조치 중입니다.',
      message5: '불편을 드려 죄송합니다. 곧 정상적으로 이용하실 수 있도록 하겠습니다.',
      button: '확인',
      closeLabel: '닫기',
    };
  }, [isEnglish]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label={copy.closeLabel}
        >
          <i className="ri-close-line text-2xl" aria-hidden />
        </button>
        
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <i className="ri-information-line text-2xl text-blue-600" aria-hidden />
            <h2 className="text-xl font-bold text-gray-900">{copy.title}</h2>
          </div>
          
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <p>
              {copy.message1} <strong className="text-red-600">{copy.message2}</strong>{copy.message3}
            </p>
            <p>
              {copy.message4}
            </p>
            <p className="text-sm text-gray-600 pt-2">
              {copy.message5}
            </p>
          </div>
          
          <button
            onClick={handleClose}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            {copy.button}
          </button>
        </div>
      </div>
    </div>
  );
}

