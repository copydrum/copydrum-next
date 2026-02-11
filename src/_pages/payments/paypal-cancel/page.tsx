'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export default function PayPalCancelPage() {
  const router = useLocaleRouter();
  const { t } = useTranslation();

  useEffect(() => {
    // sessionStorage 정리
    sessionStorage.removeItem('paypal_order_id');
    sessionStorage.removeItem('paypal_paypal_order_id');
  }, []);

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
        <button
          onClick={() => router.push('/cart')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {t('button.back') || 'Back to Cart'}
        </button>
      </div>
    </div>
  );
}

