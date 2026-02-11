'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { requestKakaoPayPayment } from '@/lib/payments/portone';
import { useAuthStore } from '@/stores/authStore';

interface KakaoPayButtonProps {
  orderId: string;
  amount: number;
  orderName: string;
  userEmail?: string;
  onSuccess: (paymentId: string) => void;
  onError: (error: Error) => void;
  onProcessing: () => void;
  compact?: boolean;
}

export default function KakaoPayButton({
  orderId,
  amount,
  orderName,
  userEmail,
  onSuccess,
  onError,
  onProcessing,
  compact,
}: KakaoPayButtonProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const user = useAuthStore((state) => state.user);

  const handleKakaoPayClick = async () => {
    if (loading) return;

    setLoading(true);
    onProcessing();

    try {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      // PortOne 카카오페이 결제 요청
      const result = await requestKakaoPayPayment({
        userId: user.id,
        amount: amount, // KRW 금액
        orderId: orderId,
        buyerEmail: userEmail || user.email || undefined,
        buyerName: user.user_metadata?.name || undefined,
        buyerTel: user.user_metadata?.phone || undefined,
        description: orderName,
        returnUrl: `${window.location.origin}/payments/portone-paypal/return`,
        onSuccess: (paymentResult) => {
          console.log('[KakaoPay] Payment success:', paymentResult);
          onSuccess(paymentResult.paymentId || orderId);
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
