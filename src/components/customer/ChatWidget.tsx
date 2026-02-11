import { useCallback, useEffect, useState } from 'react';

declare global {
  interface Window {
    Kakao?: {
      isInitialized?: () => boolean;
      init?: (key: string) => void;
      Channel?: {
        chat?: (options: { channelPublicId: string }) => void;
      };
    };
  }
}

const KAKAO_SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';
const KAKAO_SDK_INTEGRITY = 'sha384-TiCUE00h649CAMonG018J2ujOgDKW/kVWlChEuu4jK2vxfAAD0eZxzCKakxg55G4';
const KAKAO_JS_KEY = 'f8269368f9d501a595c3f3d6d99e4ff5';
const CHANNEL_PUBLIC_ID = '_Hbxezxl';

export default function ChatWidget() {
  const [isSdkReady, setIsSdkReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const initializeKakao = () => {
      try {
        const kakao = window.Kakao;
        if (!kakao) return;

        if (typeof kakao.isInitialized === 'function') {
          if (!kakao.isInitialized()) {
            kakao.init?.(KAKAO_JS_KEY);
          }
        } else {
          kakao.init?.(KAKAO_JS_KEY);
        }

        if (isMounted) {
          setIsSdkReady(true);
        }
      } catch (error) {
        console.error('카카오 SDK 초기화 실패:', error);
      }
    };

    if (window.Kakao) {
      initializeKakao();
      return () => {
        isMounted = false;
      };
    }

    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${KAKAO_SDK_URL}"]`);

    const handleLoad = () => {
      initializeKakao();
      if (existingScript) {
        existingScript.dataset.loaded = 'true';
      }
    };

    const handleError = (event: Event) => {
      console.error('카카오 SDK 로드 실패:', event);
      if (isMounted) {
        setIsSdkReady(false);
      }
    };

    if (existingScript) {
      if (existingScript.dataset.loaded === 'true') {
        handleLoad();
      } else {
        existingScript.addEventListener('load', handleLoad);
        existingScript.addEventListener('error', handleError);
      }

      return () => {
        isMounted = false;
        existingScript.removeEventListener('load', handleLoad);
        existingScript.removeEventListener('error', handleError);
      };
    }

    const script = document.createElement('script');
    script.src = KAKAO_SDK_URL;
    script.async = true;
    script.integrity = KAKAO_SDK_INTEGRITY;
    script.crossOrigin = 'anonymous';

    const loadListener = () => {
      script.dataset.loaded = 'true';
      handleLoad();
    };

    script.addEventListener('load', loadListener);
    script.addEventListener('error', handleError);

    document.head.appendChild(script);

    return () => {
      isMounted = false;
      script.removeEventListener('load', loadListener);
      script.removeEventListener('error', handleError);
    };
  }, []);

  const openChat = useCallback(() => {
    const channelUrl = `https://pf.kakao.com/${CHANNEL_PUBLIC_ID}/chat`;

    try {
      const kakao = window.Kakao;
      if (kakao) {
        if (typeof kakao.isInitialized === 'function' && !kakao.isInitialized()) {
          kakao.init?.(KAKAO_JS_KEY);
        }

        if (kakao.Channel?.chat) {
          kakao.Channel.chat({ channelPublicId: CHANNEL_PUBLIC_ID });
          return;
        }
      }
    } catch (error) {
      console.error('카카오 상담 연결 실패:', error);
    }

    window.open(channelUrl, '_blank', 'noopener,noreferrer');
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      <div className="rounded-lg bg-white px-4 py-2 text-sm text-gray-700 shadow-md">
        {isSdkReady ? '카카오톡으로 빠르게 문의해보세요!' : '카카오톡 채팅을 준비 중입니다...'}
      </div>
      <button
        type="button"
        onClick={openChat}
        className="inline-flex items-center gap-2 rounded-full bg-yellow-400 px-5 py-3 text-sm font-semibold text-gray-900 shadow-lg transition hover:bg-yellow-300 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2"
        aria-label="카카오톡 1:1 문의"
      >
        <i className="ri-chat-3-line text-lg" />
        <span>카카오톡 문의</span>
      </button>
    </div>
  );
}

