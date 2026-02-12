'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/currency';
import { supabase } from '@/lib/supabase';

interface PointsPaymentItem {
  id: string;
  sheet_id: string;
  title: string;
  price: number;
}

interface PointsPaymentFormProps {
  orderId: string;
  amount: number;
  availablePoints: number;
  userId: string;
  items: PointsPaymentItem[];
  onSuccess: (dbOrderId?: string) => void;
  onError: (error: Error) => void;
  onProcessing: () => void;
}

export default function PointsPaymentForm({
  orderId,
  amount,
  availablePoints,
  userId,
  items,
  onSuccess,
  onError,
  onProcessing,
}: PointsPaymentFormProps) {
  const { t } = useTranslation();
  const [pointsToUse, setPointsToUse] = useState(Math.min(amount, availablePoints));
  const [loading, setLoading] = useState(false);

  const handlePayWithPoints = async () => {
    if (loading) return;

    if (pointsToUse > availablePoints) {
      alert(t('checkout.insufficientPoints'));
      return;
    }

    if (pointsToUse < amount) {
      alert(t('checkout.insufficientPoints'));
      return;
    }

    setLoading(true);
    onProcessing();

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
        // orderId가 유효한 UUID가 아니면 에러 → 주문 없음으로 처리
        orderExists = false;
      }

      // ============================================================
      // 2단계: 주문이 없으면 DB에 먼저 생성
      // ============================================================
      if (!orderExists) {
        console.log('[Points] 주문이 DB에 없음 → 새 주문 생성 시작');

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
            paymentMethod: 'points', // ✅ 결제수단 명시
          }),
        });

        const createResult = await createResponse.json();

        if (!createResult.success || !createResult.orderId) {
          throw new Error(createResult.error || '주문 생성에 실패했습니다.');
        }

        dbOrderId = createResult.orderId;
        console.log('[Points] 새 주문 생성 완료:', {
          dbOrderId,
          orderNumber: createResult.orderNumber,
        });
      } else {
        console.log('[Points] 기존 주문 확인 완료:', dbOrderId);
      }

      // ============================================================
      // 3단계: 포인트 결제 API 호출
      // ============================================================
      const response = await fetch('/api/payments/points/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: dbOrderId,
          amount,
          pointsToUse,
          userId,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to pay with points');
      }

      onSuccess(dbOrderId);
    } catch (error) {
      console.error('[Points] Payment error:', error);
      setLoading(false);
      onError(error as Error);
    }
  };

  const canPay = pointsToUse >= amount && pointsToUse <= availablePoints;
  const remainingPoints = availablePoints - pointsToUse;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <i className="ri-coins-line text-2xl text-yellow-600"></i>
        <h3 className="text-lg font-semibold text-gray-900">{t('checkout.usePoints')}</h3>
      </div>

      <div className="p-6 border-2 border-gray-200 rounded-xl bg-gradient-to-br from-yellow-50 to-orange-50 space-y-4">
        {/* 사용 가능 포인트 */}
        <div className="flex justify-between items-center p-4 bg-white rounded-lg">
          <span className="text-sm font-medium text-gray-700">{t('checkout.availablePoints')}</span>
          <span className="text-lg font-bold text-yellow-600">
            {formatCurrency(availablePoints, 'KRW')}
          </span>
        </div>

        {/* 결제 금액 */}
        <div className="flex justify-between items-center p-4 bg-white rounded-lg">
          <span className="text-sm font-medium text-gray-700">{t('checkout.total')}</span>
          <span className="text-lg font-bold text-gray-900">
            {formatCurrency(amount, 'KRW')}
          </span>
        </div>

        {/* 사용할 포인트 입력 */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            {t('checkout.pointsToUse')}
          </label>
          <div className="relative">
            <input
              type="number"
              value={pointsToUse}
              onChange={(e) => setPointsToUse(Math.min(parseInt(e.target.value) || 0, availablePoints))}
              max={availablePoints}
              min={0}
              className="w-full pl-4 pr-20 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-yellow-500 text-right font-semibold"
            />
            <button
              onClick={() => setPointsToUse(Math.min(amount, availablePoints))}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200 transition-colors"
            >
              {t('checkout.total')}
            </button>
          </div>
        </div>

        {/* 잔여 포인트 */}
        <div className="flex justify-between items-center p-4 bg-yellow-100 rounded-lg">
          <span className="text-sm font-medium text-gray-700">잔여 포인트</span>
          <span className="text-lg font-bold text-yellow-700">
            {formatCurrency(remainingPoints, 'KRW')}
          </span>
        </div>

        {/* 포인트 부족 경고 */}
        {!canPay && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-2">
              <i className="ri-error-warning-line text-red-600 text-lg mt-0.5"></i>
              <div className="text-sm text-red-700">
                <p className="font-medium">{t('checkout.insufficientPoints')}</p>
                <p className="mt-1 text-xs">
                  부족한 금액: {formatCurrency(amount - pointsToUse, 'KRW')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 결제 버튼 */}
        <button
          onClick={handlePayWithPoints}
          disabled={!canPay || loading}
          className="w-full py-4 px-6 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
              <span>{t('checkout.processing')}</span>
            </>
          ) : (
            <>
              <i className="ri-coins-line text-xl"></i>
              <span>{formatCurrency(pointsToUse, 'KRW')} {t('checkout.payNow')}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
