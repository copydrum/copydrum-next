'use client';

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as PortOne from '@portone/browser-sdk/v2';
import { v4 as uuidv4 } from 'uuid';
import { useAuthStore } from '../../stores/authStore';
import { isMobileDevice } from '../../utils/device';

interface CustomOrderKoreanPayButtonProps {
  customOrderId: string;
  amountKRW: number; // 견적 금액(KRW)
  songTitle: string;
  onConfirmed: () => void;
}

type Method = 'card' | 'kakaopay';

// 주문제작 견적 결제 전용 한국 결제 버튼(KG이니시스 카드 / 카카오페이).
// 시트 구매 결제 함수(requestPortonePayment 등)와 달리 orders 테이블을 전혀 건드리지 않으며,
// PC(IFRAME) 콜백 또는 모바일(REDIRECTION) 리턴 페이지에서
// /api/payments/portone/verify-custom-order 로 검증 후 custom_orders 를 payment_confirmed 로 전이한다.
export default function CustomOrderKoreanPayButton({
  customOrderId,
  amountKRW,
  songTitle,
  onConfirmed,
}: CustomOrderKoreanPayButtonProps) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [processing, setProcessing] = useState<Method | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const verifyWithRetry = useCallback(
    async (paymentId: string): Promise<'confirmed' | 'pending' | 'failed'> => {
      const RETRY_MS = [2000, 3000, 3000, 5000, 5000];
      for (let attempt = 0; attempt < RETRY_MS.length; attempt++) {
        try {
          const res = await fetch('/api/payments/portone/verify-custom-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId, customOrderId }),
          });
          const json = await res.json();
          if (res.ok && json.success) return 'confirmed';
          if (json.pending) {
            await new Promise((r) => setTimeout(r, RETRY_MS[attempt]));
            continue;
          }
          return 'failed';
        } catch {
          await new Promise((r) => setTimeout(r, RETRY_MS[attempt]));
        }
      }
      return 'pending';
    },
    [customOrderId]
  );

  const pay = useCallback(
    async (method: Method) => {
      if (!user?.id || processing) return;
      setError(null);
      setInfo(null);
      setProcessing(method);

      try {
        const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID!;
        const channelKey =
          method === 'kakaopay'
            ? process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_KAKAOPAY!
            : process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_INICIS!;

        const paymentId = `copay_${uuidv4()}`;
        const origin = window.location.origin;
        const returnUrl = `${origin}/payments/custom-order/return?customOrderId=${encodeURIComponent(
          customOrderId
        )}&method=${method}`;

        // 모바일 REDIRECTION 대비: 리턴 페이지에서 사용할 정보 저장
        sessionStorage.setItem('copay_custom_order_id', customOrderId);
        sessionStorage.setItem('copay_payment_id', paymentId);
        sessionStorage.setItem('copay_method', method);

        const windowType = { pc: 'IFRAME', mobile: 'REDIRECTION' } as const;

        const requestData: any = {
          storeId,
          channelKey,
          paymentId,
          orderId: customOrderId,
          orderName: songTitle || '맞춤 드럼 악보 제작',
          totalAmount: Math.round(amountKRW),
          currency: 'CURRENCY_KRW',
          payMethod: method === 'kakaopay' ? 'EASY_PAY' : 'CARD',
          customer: {
            customerId: user.id,
            email: user.email || undefined,
            fullName: user.user_metadata?.name || '고객',
            phoneNumber: '010-0000-0000',
          },
          redirectUrl: returnUrl,
          windowType,
          metadata: { customOrderId, userId: user.id, type: 'custom_order' },
          locale: 'KO_KR',
        };

        const isMobile = isMobileDevice();

        await PortOne.requestPayment(requestData, {
          onPaymentSuccess: async (result: any) => {
            // PC(IFRAME) 경로: 콜백에서 직접 검증. (모바일은 리턴 페이지가 처리)
            const confirmedPaymentId =
              result.paymentId || result.txId || result.tx_id || result.id || paymentId;
            const outcome = await verifyWithRetry(confirmedPaymentId);
            if (outcome === 'confirmed') {
              onConfirmed();
            } else if (outcome === 'pending') {
              setInfo(t('customOrders.detail.payPending'));
            } else {
              setError(t('customOrders.detail.payFailed'));
            }
            setProcessing(null);
          },
          onPaymentFail: (err: any) => {
            console.warn('[CustomOrderKoreanPay] 결제 실패:', err);
            // 모바일에서는 이 콜백이 실행되지 않을 수 있음(리다이렉트). PC만 여기서 처리.
            if (!isMobile) {
              setError(t('customOrders.detail.payFailed'));
              setProcessing(null);
            }
          },
        });

        // 모바일 REDIRECTION 은 위 호출에서 페이지가 이동하므로 이 지점에 도달하지 않음.
        // PC IFRAME 은 콜백에서 처리되므로 여기서 별도 처리 없음.
      } catch (e) {
        console.error('[CustomOrderKoreanPay] 결제 요청 오류:', e);
        setError(t('customOrders.detail.payFailed'));
        setProcessing(null);
      }
    },
    [user?.id, user?.email, user?.user_metadata?.name, processing, customOrderId, songTitle, amountKRW, onConfirmed, t, verifyWithRetry]
  );

  return (
    <div className="space-y-3">
      {processing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-w-sm rounded-xl bg-white p-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            <p className="text-lg font-semibold text-gray-900">{t('customOrders.detail.payProcessing')}</p>
            <p className="mt-1 text-sm text-gray-600">{t('customOrders.detail.payDoNotClose')}</p>
          </div>
        </div>
      )}

      {info && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{info}</div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <button
        onClick={() => pay('card')}
        disabled={!!processing}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        <i className="ri-bank-card-line text-lg" />
        {t('customOrders.detail.payCard')}
      </button>
      <button
        onClick={() => pay('kakaopay')}
        disabled={!!processing}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#FEE500] py-3 text-sm font-semibold text-[#191600] hover:brightness-95 disabled:opacity-50"
      >
        <i className="ri-kakao-talk-fill text-lg" />
        {t('customOrders.detail.payKakao')}
      </button>
    </div>
  );
}
