'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

// 주문제작(custom_orders) 한국 결제(카드/카카오페이) 모바일 REDIRECTION 전용 리턴 페이지.
// 시트 구매용 /payments/portone/return 과 분리되어 있으며, custom_orders 만 검증/전이한다.
export default function CustomOrderPaymentReturn() {
  const router = useLocaleRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const [status, setStatus] = useState<'processing' | 'success' | 'fail'>('processing');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const run = async () => {
      try {
        const code = searchParams.get('code');
        const message = searchParams.get('message');
        const urlPaymentId = searchParams.get('paymentId');
        const urlCustomOrderId = searchParams.get('customOrderId');

        const savedCustomOrderId =
          typeof window !== 'undefined' ? sessionStorage.getItem('copay_custom_order_id') : null;
        const savedPaymentId =
          typeof window !== 'undefined' ? sessionStorage.getItem('copay_payment_id') : null;

        const customOrderId = urlCustomOrderId || savedCustomOrderId || '';
        const paymentId = urlPaymentId || savedPaymentId || '';

        // 결제 실패(에러 코드 존재)
        if (code && code !== '0') {
          setErrorMsg(message || t('customOrders.detail.payFailed'));
          setStatus('fail');
          return;
        }

        if (!customOrderId || !paymentId) {
          setErrorMsg(t('customOrders.detail.payFailed'));
          setStatus('fail');
          return;
        }

        // 검증(재시도 포함) — 해외 지연은 아니지만 PG 반영 지연 대비 짧게 재시도
        const RETRY_MS = [1500, 2500, 3500, 5000];
        let confirmed = false;
        let failed = false;
        for (let attempt = 0; attempt < RETRY_MS.length; attempt++) {
          const res = await fetch('/api/payments/portone/verify-custom-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId, customOrderId }),
          });
          const json = await res.json();
          if (res.ok && json.success) {
            confirmed = true;
            break;
          }
          if (json.pending) {
            await new Promise((r) => setTimeout(r, RETRY_MS[attempt]));
            continue;
          }
          failed = true;
          setErrorMsg(json.error || t('customOrders.detail.payFailed'));
          break;
        }

        // 정리
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('copay_custom_order_id');
          sessionStorage.removeItem('copay_payment_id');
          sessionStorage.removeItem('copay_method');
        }

        if (confirmed || !failed) {
          // 확정되었거나(또는 PG 반영 대기 중) 상세 페이지로 이동 — 상세에서 최신 상태 표시
          setStatus('success');
          setTimeout(() => {
            router.push(`/custom-order-detail/${customOrderId}`);
          }, 1000);
        } else {
          setStatus('fail');
        }
      } catch (e) {
        console.error('[CustomOrderPaymentReturn] 처리 오류:', e);
        setErrorMsg(e instanceof Error ? e.message : t('customOrders.detail.payFailed'));
        setStatus('fail');
      }
    };
    run();
  }, [router, searchParams, t]);

  if (status === 'fail') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-lg bg-white p-6 text-center shadow-lg">
          <i className="ri-error-warning-line text-6xl text-red-500" />
          <h2 className="mt-3 text-2xl font-bold text-gray-900">{t('payment.failed') || '결제 실패'}</h2>
          <p className="mt-2 text-gray-600">{errorMsg}</p>
          <button
            onClick={() => router.push('/custom-orders')}
            className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            {t('customOrders.title') || '주문제작 신청내역'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-white">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
      <p className="mt-4 font-medium text-gray-600">
        {status === 'success'
          ? t('payment.redirectingToSuccess') || '결제 완료! 이동 중...'
          : t('payment.processing') || '결제 확인 중입니다...'}
      </p>
    </div>
  );
}
