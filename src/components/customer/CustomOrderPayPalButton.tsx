'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as PortOne from '@portone/browser-sdk/v2';
import { v4 as uuidv4 } from 'uuid';
import { useAuthStore } from '../../stores/authStore';

interface CustomOrderPayPalButtonProps {
  customOrderId: string;
  amountUSD: number; // 견적 금액(USD)
  songTitle: string;
  onConfirmed: () => void;
}

// 주문제작 견적 결제 전용 PayPal(PAYPAL_SPB) 버튼.
// 시트 구매용 PayPalPaymentButton 과 분리되어 있으며, 결제 성공 시
// 전용 검증 엔드포인트(/api/payments/portone/verify-custom-order)로 PAID + 금액 대조 후
// custom_orders.status 를 payment_confirmed 로 전이시킨다.
export default function CustomOrderPayPalButton({
  customOrderId,
  amountUSD,
  songTitle,
  onConfirmed,
}: CustomOrderPayPalButtonProps) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const loadedRef = useRef(false);
  const processingRef = useRef(false);

  const loadButton = useCallback(async () => {
    if (!user?.id || !customOrderId || !amountUSD || loadedRef.current) return;
    if (typeof window === 'undefined') return;

    loadedRef.current = true;
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID!;
      const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_PAYPAL!;
      const paymentId = `copay_${uuidv4()}`;
      const totalAmount = Math.round(Number(amountUSD.toFixed(2)) * 100); // USD 센트

      await PortOne.loadPaymentUI(
        {
          uiType: 'PAYPAL_SPB',
          storeId,
          channelKey,
          paymentId,
          orderName: songTitle || 'Custom drum transcription',
          totalAmount,
          currency: 'CURRENCY_USD',
          customer: {
            customerId: user.id,
            email: user.email || undefined,
            fullName: user.user_metadata?.name || undefined,
          },
          metadata: {
            customOrderId,
            userId: user.id,
            type: 'custom_order',
          },
        } as any,
        {
          onPaymentSuccess: async (result: any) => {
            const confirmedPaymentId =
              result.paymentId || result.txId || result.tx_id || result.id || paymentId;

            if (processingRef.current) return;
            processingRef.current = true;
            setIsProcessing(true);

            try {
              const RETRY_MS = [2000, 3000, 3000, 5000, 5000, 7000, 10000, 10000];
              let confirmed = false;
              let failed = false;

              for (let attempt = 0; attempt < RETRY_MS.length; attempt++) {
                const res = await fetch('/api/payments/portone/verify-custom-order', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ paymentId: confirmedPaymentId, customOrderId }),
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
                // 명백한 실패 → 중단
                setError(json.error || t('customOrders.detail.payFailed'));
                failed = true;
                break;
              }

              if (confirmed) {
                onConfirmed();
              } else if (!failed) {
                // 아직 PAID 미확정(해외 결제 지연) → 잠시 후 새로고침 안내
                setInfo(t('customOrders.detail.payPending'));
              }
            } catch (e) {
              console.error('[CustomOrderPayPal] 검증 호출 실패:', e);
              setError(t('customOrders.detail.payFailed'));
            } finally {
              setIsProcessing(false);
              processingRef.current = false;
            }
          },
          onPaymentFail: (err: any) => {
            console.warn('[CustomOrderPayPal] 결제 실패:', err);
            setError(t('customOrders.detail.payFailed'));
            loadedRef.current = false; // 새 paymentId 로 재렌더 허용
          },
        }
      );

      setLoading(false);
    } catch (e) {
      console.error('[CustomOrderPayPal] 버튼 로드 오류:', e);
      setError(t('customOrders.detail.payFailed'));
      setLoading(false);
      loadedRef.current = false;
    }
  }, [user?.id, user?.email, user?.user_metadata?.name, customOrderId, amountUSD, songTitle, onConfirmed, t]);

  useEffect(() => {
    loadButton();
  }, [loadButton]);

  const handleRetry = useCallback(() => {
    loadedRef.current = false;
    setError(null);
    setInfo(null);
    loadButton();
  }, [loadButton]);

  return (
    <div className="space-y-3">
      {isProcessing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-w-sm rounded-xl bg-white p-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            <p className="text-lg font-semibold text-gray-900">{t('customOrders.detail.payProcessing')}</p>
            <p className="mt-1 text-sm text-gray-600">{t('customOrders.detail.payDoNotClose')}</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-3 rounded-xl bg-gray-100 px-6 py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <span className="text-sm text-gray-500">PayPal {t('customOrders.detail.payLoading')}</span>
        </div>
      )}

      {info && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{info}</div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={handleRetry}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <i className="ri-refresh-line" />
            {t('customOrders.detail.payRetry')}
          </button>
        </div>
      )}

      {/* PortOne PayPal SPB 버튼 컨테이너 */}
      <div
        className="portone-ui-container"
        style={{ display: loading || error || isProcessing ? 'none' : 'block' }}
      />
    </div>
  );
}
