'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// 취소 사유를 DB에 기록
async function logCancelNote(orderId: string) {
  try {
    await fetch('/api/orders/update-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId,
        note: '사용자가 PayPal 결제창에서 취소함',
        noteType: 'cancel',
      }),
    });
    console.log('[PayPal Cancel] ✅ 취소 사유 기록 완료:', orderId);
  } catch (e) {
    console.warn('[PayPal Cancel] 취소 사유 기록 실패 (치명적이지 않음):', e);
  }
}

export default function PayPalCancelPage() {
  const router = useLocaleRouter();
  const { t } = useTranslation();
  const [logged, setLogged] = useState(false);

  useEffect(() => {
    // 취소 사유를 DB에 기록
    const pendingOrderId =
      sessionStorage.getItem('paypal_pending_order_id') ||
      sessionStorage.getItem('paypal_order_id');

    if (pendingOrderId && !logged) {
      logCancelNote(pendingOrderId);
      setLogged(true);
    }

    // sessionStorage 정리
    sessionStorage.removeItem('paypal_order_id');
    sessionStorage.removeItem('paypal_paypal_order_id');
    // paypal_pending_order_id는 유지 (장바구니 복귀 후 재시도 가능)
  }, [logged]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
        <div className="mb-4">
          <i className="ri-close-circle-line text-6xl text-yellow-500"></i>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {t('payment.cancelled') || 'Payment Cancelled'}
        </h2>
        <p className="text-gray-600 mb-4">
          {t('payment.cancelledMessage') || 'You cancelled the payment. No charges were made.'}
        </p>
        <p className="text-sm text-gray-500 mb-6">
          {t('payment.cancelledRetryMessage') || 'Your cart items are preserved. You can try again anytime.'}
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => router.push('/cart')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t('payment.retryPayment') || 'Return to Cart & Retry'}
          </button>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            {t('button.home') || 'Go to Home'}
          </button>
        </div>
      </div>
    </div>
  );
}
