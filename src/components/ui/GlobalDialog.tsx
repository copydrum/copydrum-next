'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialogStore } from '@/stores/dialogStore';

/**
 * 전역 Alert / Confirm 다이얼로그 컴포넌트
 * 브라우저 기본 confirm()/alert() 대신 사용하여, 버튼 텍스트가 사이트 언어에 맞게 번역됩니다.
 */
export default function GlobalDialog() {
  const { t } = useTranslation();
  const {
    alertOpen,
    alertMessage,
    closeAlert,
    confirmOpen,
    confirmMessage,
    closeConfirm,
  } = useDialogStore();

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmOpen) closeConfirm(false);
        if (alertOpen) closeAlert();
      }
    };

    if (alertOpen || confirmOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [alertOpen, confirmOpen, closeAlert, closeConfirm]);

  // 아무 다이얼로그도 열려있지 않으면 렌더링 안 함
  if (!alertOpen && !confirmOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* 오버레이 배경 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => {
          if (confirmOpen) closeConfirm(false);
          if (alertOpen) closeAlert();
        }}
      />

      {/* ━━━ Alert Dialog ━━━ */}
      {alertOpen && (
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-[90%] mx-auto overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="p-6">
            <p className="text-gray-800 text-base leading-relaxed whitespace-pre-line">
              {alertMessage}
            </p>
          </div>
          <div className="px-6 pb-5 flex justify-end">
            <button
              onClick={closeAlert}
              autoFocus
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {t('button.confirm')}
            </button>
          </div>
        </div>
      )}

      {/* ━━━ Confirm Dialog ━━━ */}
      {confirmOpen && (
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-[90%] mx-auto overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="p-6">
            <p className="text-gray-800 text-base leading-relaxed whitespace-pre-line">
              {confirmMessage}
            </p>
          </div>
          <div className="px-6 pb-5 flex justify-end gap-3">
            <button
              onClick={() => closeConfirm(false)}
              className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
            >
              {t('button.cancel')}
            </button>
            <button
              onClick={() => closeConfirm(true)}
              autoFocus
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {t('button.confirm')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
