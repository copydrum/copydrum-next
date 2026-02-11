'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useEffect } from 'react';

/**
 * KG이니시스 결제창 닫기 처리 페이지
 * closeUrl로 호출되며 결제창을 닫는 스크립트를 제공합니다.
 */
export default function InicisClosePage() {
  const router = useLocaleRouter();

  useEffect(() => {
    // KG이니시스 close 스크립트 로드
    const script = document.createElement('script');
    script.src = 'https://stdpay.inicis.com/stdjs/INIStdPay_close.js';
    script.charset = 'UTF-8';
    script.async = true;
    
    script.onload = () => {
      // 스크립트 로드 후 약간의 지연 후 홈으로 이동
      setTimeout(() => {
        router.push('/');
      }, 1000);
    };
    
    script.onerror = () => {
      // 스크립트 로드 실패 시에도 홈으로 이동
      console.error('KG이니시스 close 스크립트 로드 실패');
      router.push('/');
    };

    document.head.appendChild(script);

    return () => {
      // 컴포넌트 언마운트 시 스크립트 제거
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">결제창을 닫는 중...</p>
      </div>
    </div>
  );
}

