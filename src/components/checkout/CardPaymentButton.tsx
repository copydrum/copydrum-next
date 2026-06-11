'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { requestPortonePayment } from '@/lib/payments/portone';
import type { CheckoutItem } from './OnePageCheckout';

interface CardPaymentButtonProps {
  orderId: string;
  amount: number;
  orderName: string;
  items: CheckoutItem[];
  userId: string;
  customerEmail?: string;
  customerName?: string;
  onSuccess: (paymentId: string, dbOrderId?: string) => void;
  onError: (error: Error) => void;
  onProcessing: () => void;
  compact?: boolean;
}

/**
 * 신용카드 결제 버튼 (PortOne + KG이니시스).
 * 주문을 먼저 DB에 생성한 뒤 PortOne 카드 결제를 요청한다.
 */
export default function CardPaymentButton({
  orderId,
  amount,
  orderName,
  items,
  userId,
  customerEmail,
  customerName,
  onSuccess,
  onError,
  onProcessing,
  compact,
}: CardPaymentButtonProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const user = useAuthStore((state) => state.user);

  const handlePortonePayment = async () => {
    try {
      // 1단계: DB에 주문이 없으면 먼저 생성
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
        orderExists = false;
      }

      if (!orderExists) {
        const description =
          items.length === 1
            ? items[0].title
            : `${items[0].title} 외 ${items.length - 1}건`;

        const createResponse = await fetch('/api/orders/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user?.id ?? userId,
            items: items.map((item) => ({
              sheetId: item.sheet_id,
              title: item.title,
              price: item.price,
            })),
            amount,
            description,
            paymentMethod: 'card',
          }),
        });

        const createResult = await createResponse.json();

        if (!createResult.success || !createResult.orderId) {
          throw new Error(createResult.error || '주문 생성에 실패했습니다.');
        }

        dbOrderId = createResult.orderId;
      }

      // 2단계: PortOne 카드 결제 요청
      const result = await requestPortonePayment({
        userId: user?.id ?? userId,
        amount,
        orderId: dbOrderId,
        description: orderName,
        buyerEmail: customerEmail,
        buyerName: customerName,
        returnUrl: `${window.location.origin}/payments/portone/return`,
        payMethod: 'CARD',
      });

      if (result.success && (result.paymentId || result.imp_uid)) {
        onSuccess(result.paymentId || result.imp_uid!, dbOrderId);
      } else {
        throw new Error(result.error_msg || 'Card payment failed');
      }
    } catch (error) {
      console.error('[PortOne] Payment error:', error);
      setLoading(false);
      onError(error as Error);
    }
  };

  const handleCardPayment = async () => {
    if (loading) return;
    setLoading(true);
    onProcessing();

    try {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }
      await handlePortonePayment();
    } catch (error) {
      console.error('[Payment] Error:', error);
      setLoading(false);
      onError(error as Error);
    }
  };

  // 컴팩트 모드: 버튼만 (OnePageCheckout)
  if (compact) {
    return (
      <button
        onClick={handleCardPayment}
        disabled={loading}
        className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg hover:shadow-xl"
      >
        {loading ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
            <span>{t('checkout.processing')}</span>
          </>
        ) : (
          <>
            <i className="ri-bank-card-line text-xl"></i>
            <span>{t('checkout.creditCard')}</span>
          </>
        )}
      </button>
    );
  }

  // 풀 모드
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <i className="ri-bank-card-line text-2xl text-blue-600"></i>
        <h3 className="text-lg font-semibold text-gray-900">{t('checkout.creditCard')}</h3>
      </div>

      <div className="p-6 border-2 border-gray-200 rounded-xl bg-white space-y-4">
        <div className="text-center space-y-4">
          <div className="text-sm text-gray-700">{t('checkout.creditCardDesc')}</div>

          <button
            onClick={handleCardPayment}
            disabled={loading}
            className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                <span>{t('checkout.processing')}</span>
              </>
            ) : (
              <>
                <i className="ri-bank-card-line text-xl"></i>
                <span>{t('checkout.payNow')}</span>
              </>
            )}
          </button>

          <div className="text-xs text-gray-600">
            {t('checkout.poweredBy', { provider: 'PortOne + KG이니시스' })}
          </div>
        </div>
      </div>
    </div>
  );
}
