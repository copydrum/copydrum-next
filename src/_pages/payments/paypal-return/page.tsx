'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { approvePayPalPayment } from '../../../lib/payments/paypal';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../lib/supabase';

// 결제 실패 사유를 DB에 기록
async function logPaymentNote(orderId: string, note: string, noteType: 'error' | 'cancel' | 'system_error') {
  try {
    await fetch('/api/orders/update-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, note, noteType }),
    });
  } catch (e) {
    console.warn('[PayPal Return] payment_note 기록 실패:', e);
  }
}

export default function PayPalReturnPage() {
  const searchParams = useSearchParams();
  const router = useLocaleRouter();
  const { t } = useTranslation();
  const [processing, setProcessing] = useState(true);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    orderId?: string;
  } | null>(null);

  useEffect(() => {
    const processPaymentReturn = async () => {
      try {
        // PayPal은 returnUrl로 리다이렉트되며 token과 PayerID를 전달
        const token = searchParams.get('token') || '';
        const payerId = searchParams.get('PayerID') || '';

        // sessionStorage에서 저장된 주문 정보 확인
        const savedOrderId = sessionStorage.getItem('paypal_order_id');
        const savedPayPalOrderId = sessionStorage.getItem('paypal_paypal_order_id');

        const orderId = savedOrderId || '';
        const paypalOrderId = savedPayPalOrderId || token || '';

        if (!orderId || !paypalOrderId) {
          setResult({
            success: false,
            message: t('payment.failed') || 'Payment information not found.',
          });
          // 결제 정보 누락 기록
          if (orderId) {
            logPaymentNote(orderId, '결제 정보 누락 (paypalOrderId 없음)', 'system_error');
          }
          setProcessing(false);
          return;
        }

        // PayPal 결제 승인
        const approvalResult = await approvePayPalPayment({
          orderId,
          paypalOrderId,
          payerId: payerId || undefined,
        });

        if (approvalResult.success) {
          // sessionStorage 정리
          sessionStorage.removeItem('paypal_order_id');
          sessionStorage.removeItem('paypal_paypal_order_id');

          // 장바구니 아이템 정리: 결제된 주문의 악보를 장바구니에서 제거
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
              // 주문에 포함된 악보 ID 조회
              const { data: orderItems } = await supabase
                .from('order_items')
                .select('drum_sheet_id')
                .eq('order_id', orderId);

              if (orderItems && orderItems.length > 0) {
                const sheetIds = orderItems.map((item: any) => item.drum_sheet_id);
                // 해당 악보들을 장바구니에서 삭제
                const { error: deleteError } = await supabase
                  .from('cart_items')
                  .delete()
                  .eq('user_id', session.user.id)
                  .in('sheet_id', sheetIds);

                if (deleteError) {
                  console.warn('[PayPal Return] 장바구니 정리 실패 (치명적이지 않음):', deleteError);
                } else {
                  console.log('[PayPal Return] 장바구니 아이템 정리 완료:', sheetIds);
                }
              }
            }
          } catch (cartError) {
            console.warn('[PayPal Return] 장바구니 정리 중 오류 (치명적이지 않음):', cartError);
          }

          setResult({
            success: true,
            message: t('payment.success') || 'Payment successful!',
            orderId: approvalResult.orderId,
          });

          // 1초 후 결제 성공 페이지로 이동 (다운로드 가능한 페이지)
          setTimeout(() => {
            router.push(`/payment/success?orderId=${orderId}&method=paypal`);
          }, 1000);
        } else {
          // 승인 실패 기록
          logPaymentNote(orderId, 'PayPal 결제 승인 실패 (approvalResult.success = false)', 'error');
          setResult({
            success: false,
            message: t('payment.failed') || 'Payment failed. Please try again.',
          });
        }
      } catch (error) {
        console.error('PayPal payment return error:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        // 에러 사유 기록
        const savedOrderId = sessionStorage.getItem('paypal_order_id');
        if (savedOrderId) {
          logPaymentNote(savedOrderId, `PayPal 승인 처리 중 에러: ${errorMessage}`, 'system_error');
        }
        setResult({
          success: false,
          message: error instanceof Error ? error.message : t('payment.failed') || 'Payment processing error.',
        });
      } finally {
        setProcessing(false);
      }
    };

    processPaymentReturn();
  }, [searchParams, router, t]);

  if (processing) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('payment.processing') || 'Processing payment...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
        {result?.success ? (
          <>
            <div className="mb-4">
              <i className="ri-checkbox-circle-line text-6xl text-green-500"></i>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {t('payment.success') || 'Payment Successful!'}
            </h2>
            <p className="text-gray-600 mb-4">{result.message}</p>
            <p className="text-sm text-gray-500 mb-4">
              {t('payment.redirectingToSuccess') || t('payment.redirecting') || 'Redirecting to download page...'}
            </p>
          </>
        ) : (
          <>
            <div className="mb-4">
              <i className="ri-error-warning-line text-6xl text-red-500"></i>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {t('payment.failed') || 'Payment Failed'}
            </h2>
            <p className="text-gray-600 mb-4">{result?.message || 'An error occurred during payment processing.'}</p>
            <button
              onClick={() => router.push('/my-orders')}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {t('button.back') || 'Go to My Orders'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

