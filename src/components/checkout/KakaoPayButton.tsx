'use client';

import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { requestKakaoPayPayment } from '@/lib/payments/portone';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';

interface KakaoPayButtonProps {
  orderId: string;
  amount: number;
  orderName: string;
  items?: { sheet_id: string; title: string; price: number }[];
  userEmail?: string;
  onSuccess: (paymentId: string, dbOrderId?: string) => void;
  onError: (error: Error) => void;
  onProcessing: () => void;
  compact?: boolean;
}

export default function KakaoPayButton({
  orderId,
  amount,
  orderName,
  items,
  userEmail,
  onSuccess,
  onError,
  onProcessing,
  compact,
}: KakaoPayButtonProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const user = useAuthStore((state) => state.user);
  const dbOrderIdRef = useRef<string>(orderId);

  const handleKakaoPayClick = async () => {
    if (loading) return;

    setLoading(true);
    onProcessing();

    try {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      // ─── 1단계: DB에 주문이 없으면 먼저 생성 (PayPal/Dodo와 동일한 패턴) ───
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

      if (!orderExists && items && items.length > 0) {
        console.log('[KakaoPay] 주문이 DB에 없음 → 새 주문 생성 시작');

        const description = items.length === 1
          ? items[0].title
          : `${items[0].title} 외 ${items.length - 1}건`;

        const createResponse = await fetch('/api/orders/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            items: items.map((item) => ({
              sheetId: item.sheet_id,
              title: item.title,
              price: item.price,
            })),
            amount,
            description,
            paymentMethod: 'kakaopay',
          }),
        });

        const createResult = await createResponse.json();

        if (createResult.success && createResult.orderId) {
          dbOrderId = createResult.orderId;
          dbOrderIdRef.current = dbOrderId;
          console.log('[KakaoPay] 새 주문 생성 완료:', {
            dbOrderId,
            orderNumber: createResult.orderNumber,
          });
        } else {
          console.warn('[KakaoPay] 주문 생성 실패, 기존 orderId 사용:', createResult.error);
        }
      } else {
        dbOrderIdRef.current = dbOrderId;
        console.log('[KakaoPay] 기존 주문 확인 완료:', dbOrderId);
      }

      // ─── 2단계: PortOne 카카오페이 결제 요청 ───
      const result = await requestKakaoPayPayment({
        userId: user.id,
        amount: amount,
        orderId: dbOrderId, // DB에 실제 존재하는 주문 ID 사용
        buyerEmail: userEmail || user.email || undefined,
        buyerName: user.user_metadata?.name || undefined,
        buyerTel: user.user_metadata?.phone || undefined,
        description: orderName,
        returnUrl: `${window.location.origin}/payments/portone-paypal/return`,
        onSuccess: (paymentResult) => {
          console.log('[KakaoPay] Payment success:', paymentResult);
          const finalOrderId = dbOrderIdRef.current || orderId;
          onSuccess(paymentResult.paymentId || orderId, finalOrderId);
        },
        onError: (error) => {
          console.error('[KakaoPay] Payment error:', error);
          setLoading(false);
          onError(new Error(error?.message || 'KakaoPay payment failed'));
        },
      });

      if (!result.success && result.error_msg) {
        // 결제창 오픈 메시지가 아닌 실제 에러인 경우만 표시
        if (!result.error_msg.includes('결제창이 열렸습니다')) {
          throw new Error(result.error_msg);
        }
      }
    } catch (error) {
      console.error('[KakaoPay] Payment error:', error);
      setLoading(false);
      onError(error as Error);
    }
  };

  // ━━━ 컴팩트 모드: 버튼만 렌더링 ━━━
  if (compact) {
    return (
      <button
        onClick={handleKakaoPayClick}
        disabled={loading}
        className="w-full py-4 px-6 bg-[#FEE500] hover:bg-[#FDD835] text-[#3C1E1E] font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg hover:shadow-xl"
      >
        {loading ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-700 border-t-transparent"></div>
            <span>{t('checkout.processing')}</span>
          </>
        ) : (
          <>
            <i className="ri-kakao-talk-fill text-xl"></i>
            <span>{t('checkout.kakaopay')}</span>
          </>
        )}
      </button>
    );
  }

  // ━━━ 풀 모드 ━━━
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <i className="ri-kakao-talk-fill text-2xl text-yellow-500"></i>
        <h3 className="text-lg font-semibold text-gray-900">{t('checkout.kakaopay')}</h3>
      </div>

      <div className="p-6 border-2 border-gray-200 rounded-xl bg-gradient-to-br from-yellow-50 to-yellow-100">
        <div className="text-center space-y-4">
          <div className="text-sm text-gray-700">
            {t('checkout.kakaopayDesc')}
          </div>

          <button
            onClick={handleKakaoPayClick}
            disabled={loading}
            className="w-full py-4 px-6 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-700 border-t-transparent"></div>
                <span>{t('checkout.processing')}</span>
              </>
            ) : (
              <>
                <i className="ri-kakao-talk-fill text-xl"></i>
                <span>{t('checkout.payNow')}</span>
              </>
            )}
          </button>

          <div className="text-xs text-gray-600">
            {t('checkout.poweredBy', { provider: 'PortOne + Kakao Pay' })}
          </div>
        </div>
      </div>
    </div>
  );
}
