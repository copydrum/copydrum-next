'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatWalletAmount } from '@/lib/wallet/display';
import { ensureCheckoutOrder } from './ensureCheckoutOrder';

interface CashPaymentItem {
  id: string;
  sheet_id: string;
  title: string;
  price: number;
}

interface CashPaymentFormProps {
  orderId: string;
  /** 포인트 차감 전 주문 총액 */
  orderTotal: number;
  /** 캐쉬로 결제할 금액 (포인트 차감 후) */
  amount: number;
  availableCash: number;
  userId: string;
  items: CashPaymentItem[];
  /** 결제 직전 주문에 포인트를 적용하고 결제할 금액을 돌려준다 */
  prepareOrder?: (dbOrderId: string) => Promise<number>;
  /** 캐쉬가 부족할 때 "충전하고 바로 결제" */
  onChargeShortfall?: () => void;
  charging?: boolean;
  /** true 가 되면(충전 직후) 바로 결제한다 */
  autoPay?: boolean;
  notice?: string;
  onSuccess: (dbOrderId?: string) => void;
  onError: (error: Error) => void;
  onProcessing: () => void;
}

/** 보유 캐쉬로 남은 금액 결제 (포인트를 먼저 쓰고 나머지를 캐쉬로) */
export default function CashPaymentForm({
  orderId,
  orderTotal,
  amount,
  availableCash,
  userId,
  items,
  prepareOrder,
  onChargeShortfall,
  charging,
  autoPay,
  notice,
  onSuccess,
  onError,
  onProcessing,
}: CashPaymentFormProps) {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const autoPaidRef = useRef(false);
  const canPay = amount > 0 && availableCash >= amount;
  const money = (krw: number) => formatWalletAmount(krw, i18n.language);

  const handlePay = async () => {
    if (loading || !canPay) return;
    setLoading(true);
    onProcessing();

    try {
      const { orderId: dbOrderId, alreadyPaid } = await ensureCheckoutOrder({
        orderId,
        userId,
        amount: orderTotal,
        paymentMethod: 'points',
        items,
      });
      if (alreadyPaid) {
        onSuccess(dbOrderId);
        return;
      }

      const payable = prepareOrder ? await prepareOrder(dbOrderId) : amount;

      const response = await fetch('/api/payments/points/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: dbOrderId, amount: payable, pointsToUse: payable, userId }),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(
          result.error === 'Insufficient points' ? t('checkout.insufficientPoints') : result.error || t('checkout.paymentError'),
        );
      }

      onSuccess(dbOrderId);
    } catch (error) {
      console.error('[Cash] Payment error:', error);
      setLoading(false);
      onError(error as Error);
    }
  };

  useEffect(() => {
    if (autoPay && canPay && !autoPaidRef.current) {
      autoPaidRef.current = true;
      handlePay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPay, canPay]);

  return (
    <div className="p-4 border-2 border-gray-200 rounded-xl bg-gradient-to-br from-yellow-50 to-orange-50 space-y-3">
      {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      <div className="flex justify-between items-center text-sm">
        <span className="text-gray-700">{t('checkout.availablePoints')}</span>
        <span className="font-bold text-yellow-700">{money(availableCash)}</span>
      </div>
      <div className="flex justify-between items-center text-sm">
        <span className="text-gray-700">{t('checkout.pointsToUse')}</span>
        <span className="font-bold text-gray-900">{money(amount)}</span>
      </div>
      {canPay ? (
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-700">{t('checkout.cashRemaining')}</span>
          <span className="font-semibold text-gray-700">{money(availableCash - amount)}</span>
        </div>
      ) : (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <p className="font-medium">{t('checkout.insufficientPoints')}</p>
          <p className="mt-1 text-xs">{t('checkout.cashShortBy', { amount: money(amount - availableCash) })}</p>
        </div>
      )}

      {canPay || !onChargeShortfall ? (
        <button
          onClick={handlePay}
          disabled={!canPay || loading}
          className="w-full py-3 px-6 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
              <span>{t('checkout.processing')}</span>
            </>
          ) : (
            <>
              <i className="ri-coins-line text-xl"></i>
              <span>{money(amount)} {t('checkout.payNow')}</span>
            </>
          )}
        </button>
      ) : (
        <button
          onClick={onChargeShortfall}
          disabled={charging}
          className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
        >
          {charging ? (
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
          ) : (
            <i className="ri-add-circle-line text-xl"></i>
          )}
          <span>{t('checkout.cashPay.chargeAndPay')}</span>
        </button>
      )}
    </div>
  );
}
