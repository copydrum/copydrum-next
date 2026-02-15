'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { getCurrentLocale } from '@/lib/localeUrl';
import { requestPortonePayment } from '@/lib/payments/portone';
import type { CheckoutItem } from './OnePageCheckout';

interface DodoPaymentFormProps {
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

export default function DodoPaymentForm({
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
}: DodoPaymentFormProps) {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const user = useAuthStore((state) => state.user);

  // 현재 사이트 언어 감지
  const siteLocale = i18n.language || getCurrentLocale() || 'en';
  const isKorean = siteLocale === 'ko';

  /**
   * 🇰🇷 한국 결제 (PortOne + KG이니시스)
   * ⚠️ DB에 주문을 먼저 생성한 후 결제를 진행해야 합니다 (Dodo/PayPal과 동일한 패턴)
   */
  const handlePortonePayment = async () => {
    console.log('🇰🇷 한국 결제(PortOne) 실행');

    try {
      // ─── 1단계: DB에 주문이 없으면 먼저 생성 ───
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
        console.log('[PortOne-Card] 주문이 DB에 없음 → 새 주문 생성 시작');

        const description = items.length === 1
          ? items[0].title
          : `${items[0].title} 외 ${items.length - 1}건`;

        const createResponse = await fetch('/api/orders/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user?.id,
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
        console.log('[PortOne-Card] 새 주문 생성 완료:', {
          dbOrderId,
          orderNumber: createResult.orderNumber,
        });
      } else {
        console.log('[PortOne-Card] 기존 주문 확인 완료:', dbOrderId);
      }

      // ─── 2단계: PortOne 카드 결제 요청 ───
      const result = await requestPortonePayment({
        userId: user?.id,
        amount,
        orderId: dbOrderId, // DB에 실제 존재하는 주문 ID 사용
        description: orderName,
        buyerEmail: customerEmail,
        buyerName: customerName,
        returnUrl: `${window.location.origin}/payments/portone/return`,
        payMethod: 'CARD',
      });

      if (result.success && (result.paymentId || result.imp_uid)) {
        console.log('[PortOne V2] Payment success:', result);
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

  /**
   * 🌍 해외 결제 (Dodo Payments)
   * 1) DB에 주문 생성 → 2) 서버에서 동적으로 상품 생성 → 3) 체크아웃 세션 생성 → 리다이렉트
   */
  const handleDodoPayment = async () => {
    console.log('🌍 해외 결제(Dodo) 실행, 금액:', amount, 'KRW');

    try {
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
        orderExists = false;
      }

      // ============================================================
      // 2단계: 주문이 없으면 DB에 먼저 생성
      // ============================================================
      if (!orderExists) {
        console.log('[Dodo] 주문이 DB에 없음 → 새 주문 생성 시작');

        const description = items.length === 1
          ? items[0].title
          : `${items[0].title} 외 ${items.length - 1}건`;

        const createResponse = await fetch('/api/orders/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            items: items.map((item) => ({
              sheetId: item.sheet_id,
              title: item.title,
              price: item.price,
            })),
            amount,
            description,
            paymentMethod: 'dodo', // ✅ 결제수단 명시
          }),
        });

        const createResult = await createResponse.json();

        if (!createResult.success || !createResult.orderId) {
          throw new Error(createResult.error || '주문 생성에 실패했습니다.');
        }

        dbOrderId = createResult.orderId;
        console.log('[Dodo] 새 주문 생성 완료:', {
          dbOrderId,
          orderNumber: createResult.orderNumber,
        });
      } else {
        console.log('[Dodo] 기존 주문 확인 완료:', dbOrderId);
      }

      // ============================================================
      // 3단계: Dodo Payments 체크아웃 세션 생성
      // ============================================================
      const response = await fetch('/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-site-locale': siteLocale,
        },
        body: JSON.stringify({
          amount,
          orderName,
          orderId: dbOrderId,  // DB 주문 ID를 return_url에 포함시키기 위해 전달
          customer: {
            email: customerEmail,
            name: customerName,
          },
          metadata: {
            orderId: dbOrderId,
            source: 'copydrum_checkout',
            orderName,
          },
          locale: siteLocale,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.message || 'Checkout session creation failed');
      }

      // Dodo 리다이렉트 전에 sessionStorage에 orderId 저장
      // (Dodo가 return URL의 query string을 덮어쓸 경우를 대비한 백업)
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('dodo_order_id', dbOrderId);
        sessionStorage.setItem('dodo_payment_method', 'dodo');
        console.log('[Dodo] sessionStorage에 orderId 저장:', dbOrderId);
      }

      // checkout_url이 있으면 해당 주소로 리다이렉트
      if (result.checkout_url) {
        console.log('[Dodo] Redirecting to checkout:', result.checkout_url);
        window.location.href = result.checkout_url;
        return;
      }

      // payment_link가 있으면 해당 주소로 리다이렉트
      if (result.payment_link) {
        console.log('[Dodo] Redirecting to payment link:', result.payment_link);
        window.location.href = result.payment_link;
        return;
      }

      // 세션 ID가 반환된 경우 성공 콜백
      if (result.session_id) {
        console.log('[Dodo] Session created:', result.session_id);
        onSuccess(result.session_id, dbOrderId);
        return;
      }

      throw new Error('No checkout URL or session ID received from server');
    } catch (error) {
      console.error('[Dodo] Payment error:', error);
      setLoading(false);
      onError(error as Error);
    }
  };

  /**
   * 결제 버튼 클릭 → locale에 따라 분기 처리
   */
  const handleCardPayment = async () => {
    if (loading) return;

    setLoading(true);
    onProcessing();

    try {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      if (isKorean) {
        await handlePortonePayment();
      } else {
        await handleDodoPayment();
      }
    } catch (error) {
      console.error('[Payment] Error:', error);
      setLoading(false);
      onError(error as Error);
    }
  };

  // ━━━ 컴팩트 모드: 버튼만 렌더링 (OnePageCheckout에서 사용) ━━━
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

  // ━━━ 풀 모드: 헤더 + 설명 + 버튼 (단독 사용 시) ━━━
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <i className="ri-bank-card-line text-2xl text-blue-600"></i>
        <h3 className="text-lg font-semibold text-gray-900">{t('checkout.creditCard')}</h3>
      </div>

      <div className="p-6 border-2 border-gray-200 rounded-xl bg-white space-y-4">
        <div className="text-center space-y-4">
          <div className="text-sm text-gray-700">
            {t('checkout.creditCardDesc')}
          </div>

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
            {isKorean
              ? t('checkout.poweredBy', { provider: 'PortOne + KG이니시스' })
              : t('checkout.poweredBy', { provider: 'Dodo Payments' })}
          </div>
        </div>
      </div>
    </div>
  );
}
