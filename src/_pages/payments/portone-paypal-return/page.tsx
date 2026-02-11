'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../lib/supabase';

export default function PortOnePayPalReturnPage() {
  const searchParams = useSearchParams();
  const router = useLocaleRouter();
  const { t } = useTranslation();
  const [processing, setProcessing] = useState(true);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    orderId?: string;
    imp_uid?: string;
  } | null>(null);

  useEffect(() => {
    const processPaymentReturn = async () => {
      try {
        // 🟢 세션 확인: 리다이렉트 후에도 로그인 상태가 유지되는지 확인
        console.log('[portone-paypal-return] 세션 확인 시작');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('[portone-paypal-return] 세션 확인 오류:', sessionError);
        } else if (!session?.user) {
          console.warn('[portone-paypal-return] 세션이 없습니다. 로그인 페이지로 리다이렉트합니다.');
          // 세션이 없으면 로그인 페이지로 리다이렉트 (현재 URL을 저장하여 로그인 후 돌아올 수 있도록)
          const currentUrl = window.location.pathname + window.location.search;
          router.push(`/auth/login?from=${encodeURIComponent(currentUrl)}`);
          return;
        } else {
          console.log('[portone-paypal-return] 세션 확인 성공:', {
            userId: session.user.id,
            email: session.user.email,
          });
        }

        // 포트원은 결제 완료 후 m_redirect_url로 리다이렉트
        // URL 파라미터에서 결제 결과 확인
        const imp_uid = searchParams.get('imp_uid') || '';
        const merchant_uid = searchParams.get('merchant_uid') || '';
        const imp_success = searchParams.get('imp_success') || '';
        const error_code = searchParams.get('error_code') || '';
        const error_msg = searchParams.get('error_msg') || '';

        console.log('[portone-paypal-return] 결제 반환 파라미터', {
          imp_uid,
          merchant_uid,
          imp_success,
          error_code,
          error_msg,
        });

        // 결제 성공 여부 확인
        if (imp_success === 'true' && imp_uid && merchant_uid) {
          // 프론트엔드에서는 UI만 표시
          // 실제 결제 상태 검증 및 업데이트는 서버(Webhook 또는 서버 검증)에서 처리됨
          console.log('[portone-paypal-return] 결제 성공 UI 표시', {
            imp_uid,
            merchant_uid,
            note: '서버에서 결제 상태를 검증하고 업데이트합니다.',
          });

          // 장바구니 아이템 정리: 결제된 주문의 악보를 장바구니에서 제거
          if (session?.user) {
            try {
              const { data: orderItems } = await supabase
                .from('order_items')
                .select('drum_sheet_id')
                .eq('order_id', merchant_uid);

              if (orderItems && orderItems.length > 0) {
                const sheetIds = orderItems.map((item: any) => item.drum_sheet_id);
                const { error: deleteError } = await supabase
                  .from('cart_items')
                  .delete()
                  .eq('user_id', session.user.id)
                  .in('sheet_id', sheetIds);

                if (deleteError) {
                  console.warn('[portone-paypal-return] 장바구니 정리 실패:', deleteError);
                } else {
                  console.log('[portone-paypal-return] 장바구니 아이템 정리 완료:', sheetIds);
                }
              }
            } catch (cartError) {
              console.warn('[portone-paypal-return] 장바구니 정리 중 오류:', cartError);
            }
          }

          setResult({
            success: true,
            message: t('payment.success') || 'Payment successful!',
            orderId: merchant_uid,
            imp_uid,
          });

          // 1초 후 결제 성공 페이지로 이동 (다운로드 가능한 페이지)
          setTimeout(() => {
            router.push(`/payment/success?orderId=${merchant_uid}&method=kakaopay&paymentId=${imp_uid}`);
          }, 1000);
        } else {
          // 결제 실패 또는 취소
          const errorMessage =
            error_msg || t('payment.failed') || 'Payment failed. Please try again.';
          setResult({
            success: false,
            message: errorMessage,
            orderId: merchant_uid || undefined,
          });
        }
      } catch (error) {
        console.error('[portone-paypal-return] 결제 반환 처리 오류', error);
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
          <i className="ri-loader-4-line w-8 h-8 animate-spin text-blue-600 mx-auto mb-4"></i>
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
            {result.imp_uid && (
              <p className="text-xs text-gray-500 mb-4">
                Transaction ID: {result.imp_uid}
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

