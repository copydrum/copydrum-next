'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../lib/supabase';

/**
 * PortOne V2 결제 완료 후 리다이렉트 페이지
 * 
 * - KakaoPay 모바일 REDIRECTION 방식 결제 후 리다이렉트됨
 * - PayPal은 팝업 방식이라 이 페이지로 오지 않음 (콜백으로 처리)
 * - PortOne V2 SDK는 리다이렉트 시 paymentId를 쿼리 파라미터로 전달
 * 
 * URL 예시: /payments/portone-paypal/return?paymentId=pay_xxx
 */
export default function PortOnePayPalReturnPage() {
  const searchParams = useSearchParams();
  const router = useLocaleRouter();
  const { t } = useTranslation();
  const [processing, setProcessing] = useState(true);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    orderId?: string;
    paymentId?: string;
  } | null>(null);

  useEffect(() => {
    const processPaymentReturn = async () => {
      try {
        // 🟢 세션 확인
        console.log('[portone-return] 세션 확인 시작');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('[portone-return] 세션 확인 오류:', sessionError);
        } else if (!session?.user) {
          console.warn('[portone-return] 세션 없음 → 로그인 페이지로 이동');
          const currentUrl = window.location.pathname + window.location.search;
          router.push(`/auth/login?from=${encodeURIComponent(currentUrl)}`);
          return;
        } else {
          console.log('[portone-return] 세션 확인 성공:', session.user.id);
        }

        // ━━━ PortOne V2 파라미터 확인 ━━━
        // V2 SDK 리다이렉트 시: paymentId 쿼리 파라미터
        const paymentId = searchParams.get('paymentId') || '';
        
        // V1 레거시 호환 (혹시 모를 경우)
        const imp_uid = searchParams.get('imp_uid') || '';
        const merchant_uid = searchParams.get('merchant_uid') || '';

        console.log('[portone-return] 결제 반환 파라미터:', {
          paymentId,
          imp_uid,
          merchant_uid,
        });

        // ━━━ paymentId로 주문 조회 (V2 방식) ━━━
        const effectivePaymentId = paymentId || imp_uid;
        
        if (effectivePaymentId) {
          // transaction_id로 주문 찾기
          const { data: orderData } = await supabase
            .from('orders')
            .select('id, status, payment_status')
            .eq('transaction_id', effectivePaymentId)
            .maybeSingle();

          const orderId = orderData?.id || merchant_uid;

          if (orderId) {
            // ─── 서버 측 결제 검증 호출 ───
            try {
              const verifyResponse = await fetch('/api/payments/portone/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  paymentId: effectivePaymentId,
                  orderId,
                }),
              });

              if (verifyResponse.ok) {
                console.log('[portone-return] 서버 검증 성공');
              } else {
                console.warn('[portone-return] 서버 검증 실패, 웹훅에서 처리 예정');
              }
            } catch (verifyErr) {
              console.warn('[portone-return] 서버 검증 호출 오류:', verifyErr);
            }

            // ─── 장바구니 정리 ───
            if (session?.user) {
              try {
                const { data: orderItems } = await supabase
                  .from('order_items')
                  .select('drum_sheet_id')
                  .eq('order_id', orderId);

                if (orderItems && orderItems.length > 0) {
                  const sheetIds = orderItems.map((item: any) => item.drum_sheet_id);
                  const { error: deleteError } = await supabase
                    .from('cart_items')
                    .delete()
                    .eq('user_id', session.user.id)
                    .in('sheet_id', sheetIds);

                  if (deleteError) {
                    console.warn('[portone-return] 장바구니 정리 실패:', deleteError);
                  } else {
                    console.log('[portone-return] 장바구니 정리 완료:', sheetIds);
                  }
                }
              } catch (cartError) {
                console.warn('[portone-return] 장바구니 정리 중 오류:', cartError);
              }
            }

            setResult({
              success: true,
              message: t('payment.success') || 'Payment successful!',
              orderId,
              paymentId: effectivePaymentId,
            });

            // 결제 성공 페이지로 이동
            setTimeout(() => {
              router.push(`/payment/success?orderId=${orderId}&method=kakaopay&paymentId=${effectivePaymentId}`);
            }, 1000);
          } else {
            // 주문을 찾을 수 없음
            console.error('[portone-return] 주문을 찾을 수 없음:', { effectivePaymentId });
            setResult({
              success: false,
              message: t('payment.orderNotFound') || 'Order not found. The payment may still be processing.',
            });
          }
        } else {
          // paymentId가 없음 → 결제 실패 또는 취소
          const errorMsg = searchParams.get('error_msg') || searchParams.get('error_message') || '';
          console.warn('[portone-return] paymentId 없음, 결제 실패/취소:', errorMsg);
          setResult({
            success: false,
            message: errorMsg || t('payment.failed') || 'Payment failed. Please try again.',
          });
        }
      } catch (error) {
        console.error('[portone-return] 결제 반환 처리 오류:', error);
        setResult({
          success: false,
          message:
            error instanceof Error
              ? error.message
              : t('payment.failed') || 'Payment processing error.',
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
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto mb-4"></div>
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
            {result.paymentId && (
              <p className="text-xs text-gray-500 mb-4">
                Transaction ID: {result.paymentId}
              </p>
            )}
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
            <p className="text-gray-600 mb-4">
              {result?.message || 'An error occurred during payment processing.'}
            </p>
            <div className="space-y-3 mt-6">
              <button
                onClick={() => router.push('/my-orders')}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {t('button.back') || 'Go to My Orders'}
              </button>
              <button
                onClick={() => router.push('/')}
                className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                {t('button.home') || 'Go to Home'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
