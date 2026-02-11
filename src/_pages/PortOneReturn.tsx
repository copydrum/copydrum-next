'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';

export default function PortOneReturn() {
  const router = useLocaleRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const [status, setStatus] = useState<'processing' | 'success' | 'fail'>('processing');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const processReturn = async () => {
      try {
        // PortOne V2 SDK REDIRECTION 후 URL 파라미터:
        // - paymentId: 결제 고유번호 (성공/실패 모두 포함)
        // - code: 에러 코드 (실패 시에만 존재)
        // - message: 에러 메시지 (실패 시에만 존재)
        const code = searchParams.get('code');
        const message = searchParams.get('message');
        const urlPaymentId = searchParams.get('paymentId');

        // sessionStorage에서 저장된 주문 정보 확인 (리다이렉트 전에 저장됨)
        const savedOrderId = sessionStorage.getItem('portone_order_id');
        const savedPaymentId = sessionStorage.getItem('portone_payment_id');
        const savedPaymentMethod = sessionStorage.getItem('portone_payment_method') || 'card';

        const paymentId = urlPaymentId || savedPaymentId || '';

        console.log('[PortOneReturn] 결제 반환 파라미터:', {
          code,
          message,
          urlPaymentId,
          savedOrderId,
          savedPaymentId,
          savedPaymentMethod,
        });

        // 결제 실패 시
        if (code && code !== '0') {
          console.error('[PortOneReturn] 결제 실패:', { code, message });
          setErrorMsg(message || '결제에 실패했습니다.');
          setStatus('fail');
          return;
        }

        // 결제 성공: orderId를 확인
        let orderId = savedOrderId || '';

        // sessionStorage에 orderId가 없으면 DB에서 paymentId(transaction_id)로 조회
        if (!orderId && paymentId) {
          console.log('[PortOneReturn] sessionStorage에 orderId 없음 → DB에서 paymentId로 조회:', paymentId);
          const { data: orderData } = await supabase
            .from('orders')
            .select('id')
            .eq('transaction_id', paymentId)
            .maybeSingle();

          if (orderData) {
            orderId = orderData.id;
            console.log('[PortOneReturn] DB에서 주문 찾음:', orderId);
          }
        }

        if (!orderId) {
          console.warn('[PortOneReturn] orderId를 확인할 수 없음 → 구매내역으로 이동');
          // orderId를 알 수 없는 경우 구매내역 페이지로 fallback
          sessionStorage.removeItem('portone_order_id');
          sessionStorage.removeItem('portone_payment_id');
          sessionStorage.removeItem('portone_payment_method');
          setStatus('success');
          setTimeout(() => {
            router.push('/my-orders');
          }, 1000);
          return;
        }

        // 장바구니 아이템 정리: 결제된 주문의 악보를 장바구니에서 제거
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
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
                console.warn('[PortOneReturn] 장바구니 정리 실패 (치명적이지 않음):', deleteError);
              } else {
                console.log('[PortOneReturn] 장바구니 아이템 정리 완료:', sheetIds);
              }
            }
          }
        } catch (cartError) {
          console.warn('[PortOneReturn] 장바구니 정리 중 오류 (치명적이지 않음):', cartError);
        }

        // sessionStorage 정리
        sessionStorage.removeItem('portone_order_id');
        sessionStorage.removeItem('portone_payment_id');
        sessionStorage.removeItem('portone_payment_method');

        setStatus('success');

        // 결제 성공 페이지로 이동 (다운로드 가능한 페이지)
        setTimeout(() => {
          router.push(`/payment/success?orderId=${orderId}&method=${savedPaymentMethod}`);
        }, 1000);

      } catch (error) {
        console.error('[PortOneReturn] 결제 반환 처리 오류:', error);
        setErrorMsg(error instanceof Error ? error.message : '결제 처리 중 오류가 발생했습니다.');
        setStatus('fail');
      }
    };

    processReturn();
  }, [router, searchParams, t]);

  if (status === 'fail') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
          <div className="mb-4">
            <i className="ri-error-warning-line text-6xl text-red-500"></i>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {t('payment.failed') || '결제 실패'}
          </h2>
          <p className="text-gray-600 mb-6">{errorMsg}</p>
          <div className="space-y-3">
            <button
              onClick={() => router.push('/my-orders')}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {t('button.back') || '주문 내역 보기'}
            </button>
            <button
              onClick={() => router.push('/')}
              className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              {t('button.home') || '홈으로 이동'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-white">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"></div>
      <p className="mt-4 text-gray-600 font-medium">
        {status === 'success'
          ? (t('payment.redirectingToSuccess') || '결제 성공! 다운로드 페이지로 이동 중...')
          : (t('payment.processing') || '결제 확인 중입니다...')}
      </p>
    </div>
  );
}
