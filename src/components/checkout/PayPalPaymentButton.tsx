'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { createPayPalPaymentIntent, getPayPalReturnUrl, getPayPalCancelUrl } from '@/lib/payments/paypal';
import type { CheckoutItem } from './OnePageCheckout';

interface PayPalPaymentButtonProps {
  orderId: string;
  amount: number;
  items: CheckoutItem[];
  onSuccess: (paymentId: string) => void;
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
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const user = useAuthStore((state) => state.user);

  // Supabase Edge Function을 통한 PayPal 결제
  const handlePayPalPayment = async () => {
    if (loading) return;

    setLoading(true);
    onProcessing();

    try {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      // 상품명 생성
      const description = items.length === 1
        ? items[0].title
        : `${items[0].title} ${items.length > 1 ? `외 ${items.length - 1}건` : ''}`;

      // ============================================================
      // 1단계: DB에 주문이 존재하는지 확인
      // ============================================================
      let dbOrderId = orderId;
      let orderExists = false;

      try {
        const { data } = await supabase
          .from('orders')
          .select('id')
          .eq('id', orderId)
          .maybeSingle();
        orderExists = !!data;
      } catch {
        // orderId가 유효한 UUID가 아니면 에러 발생 → 주문 없음으로 처리
        orderExists = false;
      }

      // ============================================================
      // 2단계: 주문이 없으면 DB에 먼저 생성
      // ============================================================
      if (!orderExists) {
        console.log('[PayPal] 주문이 DB에 없음 → 새 주문 생성 시작');

        const createResponse = await fetch('/api/orders/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            items: items.map((item) => ({
              sheetId: item.sheet_id,  // 실제 악보 ID (drum_sheets.id)
              title: item.title,
              price: item.price,
            })),
            amount,
            description,
            paymentMethod: 'paypal', // ✅ 결제수단 명시
          }),
        });

        const createResult = await createResponse.json();

        if (!createResult.success || !createResult.orderId) {
          throw new Error(createResult.error || '주문 생성에 실패했습니다.');
        }

        dbOrderId = createResult.orderId;
        console.log('[PayPal] 새 주문 생성 완료:', {
          dbOrderId,
          orderNumber: createResult.orderNumber,
        });
      } else {
        console.log('[PayPal] 기존 주문 확인 완료:', dbOrderId);
      }

      // ============================================================
      // 3단계: Supabase Edge Function 호출 (payments-paypal-init)
      // ============================================================
      const returnUrl = getPayPalReturnUrl();
      const cancelUrl = getPayPalCancelUrl();

      console.log('[PayPal] Edge Function 호출 시작', {
        dbOrderId,
        amount,
        description,
        returnUrl,
        cancelUrl,
      });

      const intent = await createPayPalPaymentIntent({
        userId: user.id,
        orderId: dbOrderId, // DB에 존재하는 실제 주문 ID 사용
        amount,
        description,
        buyerEmail: user.email || undefined,
        buyerName: user.user_metadata?.name || undefined,
        returnUrl,
        cancelUrl,
        locale: i18n.language, // 사이트 통화 변환에 사용
      });

      console.log('[PayPal] Edge Function 응답:', intent);

      // sessionStorage에 주문 정보 저장 (리다이렉트 후 return 페이지에서 사용)
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('paypal_order_id', dbOrderId);
        sessionStorage.setItem('paypal_paypal_order_id', intent.paypalOrderId);
      }

      // PayPal 승인 URL로 리다이렉트
      if (intent.approvalUrl) {
        console.log('[PayPal] PayPal 승인 페이지로 리다이렉트:', intent.approvalUrl);
        window.location.href = intent.approvalUrl;
        return;
      } else {
        throw new Error('PayPal 승인 URL을 받지 못했습니다.');
      }
    } catch (error) {
      console.error('[PayPal] 결제 요청 오류:', error);
      setLoading(false);
      onError(error instanceof Error ? error : new Error('PayPal 결제 요청 중 오류가 발생했습니다.'));
    }
  };

  // ━━━ 컴팩트 모드: 버튼만 렌더링 ━━━
  if (compact) {
    return (
      <button
        onClick={handlePayPalPayment}
        disabled={loading}
        className="w-full py-4 px-6 bg-[#0070ba] hover:bg-[#005ea6] text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg hover:shadow-xl"
      >
        {loading ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
            <span>{t('checkout.processing')}</span>
          </>
        ) : (
          <>
            <i className="ri-paypal-line text-xl"></i>
            <span>PayPal</span>
          </>
        )}
      </button>
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
        <div className="text-center space-y-4">
          <div className="text-sm text-gray-700">
            {t('checkout.paypalDesc', 'Pay securely with your PayPal account')}
          </div>

          <button
            onClick={handlePayPalPayment}
            disabled={loading}
            className="w-full py-4 px-6 bg-[#0070ba] hover:bg-[#005ea6] text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                <span>{t('checkout.processing')}</span>
              </>
            ) : (
              <>
                <i className="ri-paypal-line text-xl"></i>
                <span>Pay with PayPal</span>
              </>
            )}
          </button>

          <div className="text-xs text-gray-600">
            {t('checkout.poweredBy', { provider: 'PayPal' })}
          </div>
        </div>
      </div>
    </div>
  );
}
