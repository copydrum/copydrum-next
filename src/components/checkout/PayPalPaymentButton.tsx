'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import * as PortOne from '@portone/browser-sdk/v2';
import { v4 as uuidv4 } from 'uuid';
import { convertFromKrw } from '@/lib/currency';
import { getLocaleFromHost } from '@/i18n/getLocaleFromHost';
import { isJapaneseSiteHost } from '@/config/hostType';
import type { CheckoutItem } from './OnePageCheckout';


interface PayPalPaymentButtonProps {
  orderId: string;
  amount: number; // KRW 금액
  items: CheckoutItem[];
  onSuccess: (paymentId: string, dbOrderId?: string) => void;
  onError: (error: Error) => void;
  onProcessing: () => void;
  compact?: boolean;
}

export default function PayPalPaymentButton({
  orderId,
  amount,
  items,
  onSuccess,
  onError,
  onProcessing,
  compact,
}: PayPalPaymentButtonProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const user = useAuthStore((state) => state.user);
  const paymentIdRef = useRef<string>('');
  const loadedRef = useRef(false);
  const dbOrderIdRef = useRef<string>(orderId);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🟢 PortOne V2 SDK PayPal SPB 방식으로 결제 버튼 렌더링
  // - 참고: 포트원 페이팔 연동 문서
  // - loadPaymentUI로 PayPal 버튼을 portone-ui-container에 렌더링
  // - 사용자가 PayPal 버튼 클릭 → 팝업 → 콜백으로 결과 처리
  // - windowType, redirectUrl 사용하지 않음 (PayPal은 항상 팝업)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const loadPayPalButton = useCallback(async () => {
    if (!user?.id || !orderId || !amount || loadedRef.current) return;
    if (typeof window === 'undefined') return;

    loadedRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID!;
      const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_PAYPAL!;

      // ─── 결제 고유 ID 생성 ───
      const newPaymentId = `pay_${uuidv4()}`;
      paymentIdRef.current = newPaymentId;

      // ─── 통화 결정 (일본 사이트: JPY, 그 외: USD) ───
      const hostname = window.location.hostname;
      const locale = getLocaleFromHost(window.location.host);
      const isJapanSite = locale === 'ja' || isJapaneseSiteHost(hostname);
      const paypalCurrency = isJapanSite ? 'JPY' : 'USD';

      // ─── 금액 변환 (KRW → USD/JPY) ───
      // 포트원 문서: currency별 scale factor 적용
      // USD: scale factor 2 → 1.50달러 = 150 전달
      // JPY: scale factor 0 → 100엔 = 100 전달
      const convertedAmount = convertFromKrw(amount, paypalCurrency);
      let finalAmount: number;
      if (paypalCurrency === 'USD') {
        finalAmount = Math.round(Number(convertedAmount.toFixed(2)) * 100);
      } else {
        finalAmount = Math.round(convertedAmount);
      }
      const portOneCurrency = paypalCurrency === 'USD' ? 'CURRENCY_USD' : 'CURRENCY_JPY';

      console.log('[PayPal-SDK] 금액 변환:', {
        originalKRW: amount,
        convertedAmount,
        finalAmount,
        currency: portOneCurrency,
      });

      // ─── 상품명 생성 ───
      const description = items.length === 1
        ? items[0].title
        : `${items[0].title} 외 ${items.length - 1}건`;

      // ─── PortOne loadPaymentUI 호출 ───
      // ⚠️ PayPal 연동 핵심 사항:
      //   - uiType: 'PAYPAL_SPB' 필수
      //   - payMethod: 생략 (PayPal은 자동)
      //   - windowType: 생략 또는 { pc: 'UI', mobile: 'UI' } (POPUP/REDIRECT 사용 불가!)
      //   - redirectUrl: 무시됨 (PayPal은 항상 팝업 → 콜백 처리)
      const requestData: any = {
        uiType: 'PAYPAL_SPB',
        storeId,
        channelKey,
        paymentId: newPaymentId,
        orderName: description,
        totalAmount: finalAmount,
        currency: portOneCurrency,
        customer: {
          customerId: user.id,
          email: user.email || undefined,
          fullName: user.user_metadata?.name || undefined,
        },
        metadata: {
          clientOrderId: orderId,
        },
      };

      console.log('[PayPal-SDK] loadPaymentUI 호출:', requestData);

      // PortOne SDK가 portone-ui-container 클래스를 가진 DOM 요소를 찾아
      // PayPal 결제 버튼을 렌더링합니다.
      await PortOne.loadPaymentUI(requestData, {
        // ━━━ 결제 성공 콜백 ━━━
        onPaymentSuccess: async (paymentResult: any) => {
          console.log('[PayPal-SDK] ✅ onPaymentSuccess', JSON.stringify(paymentResult, null, 2));
          onProcessing();

          try {
            // paymentId 추출 (SDK 응답 구조에 따라 다양한 필드명 시도)
            const confirmedPaymentId =
              paymentResult.paymentId ||
              paymentResult.txId ||
              paymentResult.tx_id ||
              paymentResult.id ||
              newPaymentId;

            console.log('[PayPal-SDK] 확인된 paymentId:', confirmedPaymentId);

            // ─── 기존 주문의 transaction_id를 업데이트 ───
            // ⚠️ 새 주문을 생성하지 않음! 결제 페이지 진입 시 이미 생성된 주문(orderId)을 사용
            dbOrderIdRef.current = orderId;

            // ─── 서버 측 결제 검증 → 주문 상태를 completed로 업데이트 ───
            // /api/payments/portone/verify에서:
            //   1. transaction_id 저장
            //   2. status → completed, payment_status → paid
            //   3. payment_method → paypal
            //   4. purchases 테이블에 구매 기록 삽입
            try {
              const verifyResponse = await fetch('/api/payments/portone/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  paymentId: confirmedPaymentId,
                  orderId: orderId,
                  paymentMethod: 'paypal',
                }),
              });

              if (!verifyResponse.ok) {
                console.warn('[PayPal-SDK] 서버 검증 응답 실패, 성공 페이지에서 재시도 예정');
              } else {
                const verifyResult = await verifyResponse.json();
                console.log('[PayPal-SDK] ✅ 서버 검증 성공 (주문 completed):', verifyResult);
              }
            } catch (verifyErr) {
              console.warn('[PayPal-SDK] 서버 검증 호출 실패 (성공 페이지에서 재시도):', verifyErr);
            }

            // 성공 콜백 → OnePageCheckout에서 결제 성공 페이지로 이동
            // 기존 orderId를 그대로 전달 (중복 주문 방지)
            onSuccess(confirmedPaymentId, orderId);
          } catch (err) {
            console.error('[PayPal-SDK] 결제 후 처리 오류:', err);
            // 결제 자체는 이미 성공했으므로 onSuccess 호출 (성공 페이지에서 재검증)
            onSuccess(newPaymentId, orderId);
          }
        },

        // ━━━ 결제 실패 콜백 ━━━
        onPaymentFail: (err: any) => {
          console.error('[PayPal-SDK] ❌ onPaymentFail', err);
          const errorMessage = err?.message || 'PayPal 결제가 실패했습니다.';
          console.warn('[PayPal-SDK] 결제 실패:', errorMessage);
          onError(new Error(errorMessage));
        },
      });

      // PayPal 버튼 렌더링 완료
      setLoading(false);
      console.log('[PayPal-SDK] ✅ PayPal SPB 버튼 렌더링 완료');
    } catch (err) {
      console.error('[PayPal-SDK] PayPal UI 로드 오류:', err);
      const errorMsg = err instanceof Error ? err.message : 'PayPal 버튼 로드에 실패했습니다.';
      setError(errorMsg);
      setLoading(false);
      loadedRef.current = false; // 재시도 허용
    }
  }, [user?.id, orderId, amount, items, onSuccess, onError, onProcessing]);

  useEffect(() => {
    loadPayPalButton();
  }, [loadPayPalButton]);

  // ━━━ 컴팩트 모드: OnePageCheckout에서 사용 ━━━
  if (compact) {
    return (
      <div className="w-full">
        {/* 로딩 상태 */}
        {loading && (
          <div className="w-full py-4 px-6 bg-gray-100 rounded-xl flex items-center justify-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent"></div>
            <span className="text-sm text-gray-500">PayPal {t('checkout.loading', '로딩 중...')}</span>
          </div>
        )}

        {/* 에러 상태 */}
        {error && (
          <div className="w-full py-3 px-4 bg-red-50 rounded-xl text-center">
            <p className="text-red-500 text-sm mb-1">{error}</p>
            <button
              onClick={() => {
                loadedRef.current = false;
                loadPayPalButton();
              }}
              className="text-sm underline text-blue-600 hover:text-blue-800"
            >
              {t('common.retry', '재시도')}
            </button>
          </div>
        )}

        {/* 🟢 포트원 PayPal SPB 버튼이 렌더링되는 컨테이너 */}
        {/* PortOne SDK가 class="portone-ui-container"를 찾아 PayPal 버튼을 렌더링 */}
        <div
          className="portone-ui-container"
          style={{ display: loading || error ? 'none' : 'block' }}
        />
      </div>
    );
  }

  // ━━━ 풀 모드 ━━━
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <i className="ri-paypal-line text-2xl text-blue-600"></i>
        <h3 className="text-lg font-semibold text-gray-900">{t('checkout.paypal')}</h3>
      </div>

      <div className="p-6 border-2 border-gray-200 rounded-xl bg-white space-y-4">
        {/* 로딩 상태 */}
        {loading && (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto mb-2"></div>
            <p className="text-sm text-gray-500">PayPal {t('checkout.loading', '결제 버튼 로딩 중...')}</p>
          </div>
        )}

        {/* 에러 상태 */}
        {error && (
          <div className="text-center py-4">
            <p className="text-red-500 text-sm mb-2">{error}</p>
            <button
              onClick={() => {
                loadedRef.current = false;
                loadPayPalButton();
              }}
              className="text-sm underline text-blue-600 hover:text-blue-800"
            >
              {t('common.retry', '재시도')}
            </button>
          </div>
        )}

        {/* 🟢 포트원 PayPal SPB 버튼이 렌더링되는 컨테이너 */}
        <div
          className="portone-ui-container"
          style={{ display: loading || error ? 'none' : 'block' }}
        />

        <div className="text-xs text-gray-600 text-center">
          {t('checkout.poweredBy', { provider: 'PortOne + PayPal' })}
        </div>
      </div>
    </div>
  );
}
