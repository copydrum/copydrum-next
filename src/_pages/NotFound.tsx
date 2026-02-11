'use client';

import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';

export default function NotFound() {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 하이드레이션 불일치 방지: 클라이언트 마운트 전까지는 정적 텍스트 표시
  if (!mounted) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-center px-4">
        <h1 className="text-5xl md:text-5xl font-semibold text-gray-100">404</h1>
        <h1 className="text-2xl md:text-3xl font-semibold mt-6">&nbsp;</h1>
        <p className="mt-4 text-xl md:text-2xl text-gray-500">&nbsp;</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen text-center px-4">
      <h1 className="text-5xl md:text-5xl font-semibold text-gray-100">{t('notFound.errorCode')}</h1>
      <h1 className="text-2xl md:text-3xl font-semibold mt-6">{t('notFound.title')}</h1>
      <p className="mt-4 text-xl md:text-2xl text-gray-500">{t('notFound.message')}</p>
    </div>
  );
}