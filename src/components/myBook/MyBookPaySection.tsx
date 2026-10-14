'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { useUserCashBalance } from '../../hooks/useUserCashBalance';
import { useRewardPoints } from '../../hooks/useRewardPoints';
import {
  notifyCashBalanceChanged,
  openCashChargeModal,
  subscribeCashBalanceChanged,
} from '../../lib/cashChargeModal';
import { getMaxBonusPercent } from '../../lib/payments/cashPackages';
import CustomOrderKoreanPayButton from '../customer/CustomOrderKoreanPayButton';

interface MyBookPaySectionProps {
  orderId: string;
  price: number;
  bookTitle: string;
  paymentOrderId?: string | null;
  onConfirmed: () => void;
}

const formatWon = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;

/** 나만의 악보집 결제: 적립 포인트 → 캐쉬 → 카드·카카오페이 순으로 고를 수 있다 */
export default function MyBookPaySection({ orderId, price, bookTitle, paymentOrderId, onConfirmed }: MyBookPaySectionProps) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const { credits, refresh: refreshCash } = useUserCashBalance(user);
  const { balance: pointProfileBalance, refresh: refreshPoints } = useRewardPoints(user?.id);

  /** 충전·결제 직후 받은 최신 잔액. 없으면 조회한 잔액을 쓴다 */
  const [latestCash, setLatestCash] = useState<number | null>(null);
  const [appliedPoints, setAppliedPoints] = useState(0);
  const [pointsInput, setPointsInput] = useState(0);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cashBalance = latestCash ?? credits;

  useEffect(() => subscribeCashBalanceChanged((balance) => setLatestCash(balance)), []);

  // 이전 결제 시도에서 결제용 주문에 묶어 둔 포인트는 보유 포인트에 더해 보여 준다
  useEffect(() => {
    if (!paymentOrderId) return;
    let cancelled = false;
    void supabase
      .from('orders')
      .select('points_used, status')
      .eq('id', paymentOrderId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || data?.status !== 'pending') return;
        const used = Number(data.points_used) || 0;
        setAppliedPoints(used);
        setPointsInput(used);
      });
    return () => {
      cancelled = true;
    };
  }, [paymentOrderId]);

  const pointBalance = pointProfileBalance + appliedPoints;
  const maxUsablePoints = Math.min(pointBalance, price);
  const pointsToUse = Math.min(Math.max(0, Math.floor(pointsInput) || 0), maxUsablePoints);
  const payable = price - pointsToUse;
  const coveredByPoints = payable === 0;
  const cashShortfall = Math.max(0, payable - cashBalance);

  const errorMessage = useCallback(
    (code?: string) => t(`myBook.pay.errors.${code ?? 'default'}`, { defaultValue: t('myBook.pay.errors.default') }),
    [t]
  );

  const afterWalletChange = useCallback(
    (newCredits?: number | null) => {
      if (typeof newCredits === 'number') {
        setLatestCash(newCredits);
        notifyCashBalanceChanged(newCredits);
      } else {
        void refreshCash();
      }
      refreshPoints();
    },
    [refreshCash, refreshPoints]
  );

  const payWithWallet = useCallback(async () => {
    if (paying) return;
    setPaying(true);
    setError(null);
    try {
      const response = await fetch('/api/my-book/pay/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customOrderId: orderId, points: pointsToUse }),
      });
      const result = await response.json().catch(() => null);

      if (result?.success) {
        afterWalletChange(result.newCredits);
        onConfirmed();
        return;
      }
      if (result?.reason === 'INSUFFICIENT_CREDIT') {
        setLatestCash(Number(result.currentCredits) || 0);
        setAppliedPoints(pointsToUse);
        refreshPoints();
        setError(t('myBook.pay.cashShort', { amount: formatWon(Number(result.shortfall) || 0) }));
        return;
      }
      setError(errorMessage(result?.error));
    } catch {
      setError(errorMessage());
    } finally {
      setPaying(false);
    }
  }, [paying, orderId, pointsToUse, afterWalletChange, onConfirmed, refreshPoints, t, errorMessage]);

  const payWithWalletRef = useRef(payWithWallet);
  useEffect(() => {
    payWithWalletRef.current = payWithWallet;
  }, [payWithWallet]);

  const chargeAndPay = () => {
    setError(null);
    openCashChargeModal({
      shortfall: cashShortfall,
      returnTo: `/custom-order-detail/${orderId}`,
      closeOnCharged: true,
      onCharged: (balance) => {
        setLatestCash(balance);
        if (balance >= payable) {
          setTimeout(() => void payWithWalletRef.current(), 0);
        }
      },
    });
  };

  /** 카드·카카오페이 결제창을 열기 전에 포인트를 적용하고 카드로 낼 금액을 받는다 */
  const prepareCardPayment = useCallback(async (): Promise<number> => {
    const response = await fetch('/api/my-book/pay/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customOrderId: orderId, points: pointsToUse }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
      throw new Error(errorMessage(result?.error));
    }
    setAppliedPoints(Number(result.pointsUsed) || 0);
    refreshPoints();
    return Number(result.payable);
  }, [orderId, pointsToUse, errorMessage, refreshPoints]);

  return (
    <div className="space-y-4">
      {pointBalance > 0 && (
        <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
            <span className="whitespace-nowrap text-sm font-semibold text-gray-800">{t('myBook.pay.pointsTitle')}</span>
            <span className="whitespace-nowrap text-xs text-gray-600">
              {t('myBook.pay.pointsBalance', { points: pointBalance.toLocaleString('ko-KR') })}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={maxUsablePoints}
              value={pointsInput === 0 ? '' : pointsInput}
              placeholder={t('myBook.pay.pointsPlaceholder')}
              onChange={(e) => {
                const next = Math.floor(Number(e.target.value) || 0);
                setPointsInput(Math.min(Math.max(0, next), maxUsablePoints));
              }}
              disabled={paying}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-right font-semibold focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setPointsInput(pointsToUse === maxUsablePoints ? 0 : maxUsablePoints)}
              disabled={paying}
              className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {pointsToUse === maxUsablePoints && pointsToUse > 0 ? t('myBook.pay.pointsCancel') : t('myBook.pay.pointsUseAll')}
            </button>
          </div>
          {pointsToUse > 0 && (
            <div className="flex items-center justify-between border-t border-emerald-100 pt-2 text-sm">
              <span className="font-semibold text-gray-800">{t('myBook.pay.payable')}</span>
              <span className="text-lg font-bold text-blue-700">{formatWon(payable)}</span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {coveredByPoints ? (
        <button
          type="button"
          onClick={() => void payWithWallet()}
          disabled={paying}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <i className={paying ? 'ri-loader-4-line animate-spin text-lg' : 'ri-coins-line text-lg'} />
          {paying ? t('myBook.pay.processing') : t('myBook.pay.payWithPoints')}
        </button>
      ) : (
        <>
          <div className="rounded-xl border border-violet-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
              <span className="flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-gray-800">
                <i className="ri-wallet-3-line text-violet-600" />
                {t('myBook.pay.cashTitle')}
              </span>
              <span className="whitespace-nowrap text-xs text-gray-600">{t('myBook.pay.cashBalance', { amount: formatWon(cashBalance) })}</span>
            </div>
            {cashShortfall === 0 ? (
              <button
                type="button"
                onClick={() => void payWithWallet()}
                disabled={paying}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                <i className={paying ? 'ri-loader-4-line animate-spin text-lg' : 'ri-wallet-3-fill text-lg'} />
                {paying ? t('myBook.pay.processing') : t('myBook.pay.payWithCash', { amount: formatWon(payable) })}
              </button>
            ) : (
              <>
                <p className="mt-2 text-xs text-gray-600">
                  {t('myBook.pay.cashChargeHint', {
                    amount: formatWon(cashShortfall),
                    percent: getMaxBonusPercent('kr'),
                  })}
                </p>
                <button
                  type="button"
                  onClick={chargeAndPay}
                  disabled={paying}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-violet-300 bg-violet-50 py-3 text-sm font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                >
                  <i className="ri-add-circle-line text-lg" />
                  {t('myBook.pay.chargeAndPay')}
                </button>
              </>
            )}
          </div>

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-blue-50/60 px-2 text-gray-500">{t('myBook.pay.orCard')}</span>
            </div>
          </div>

          <CustomOrderKoreanPayButton
            customOrderId={orderId}
            amountKRW={payable}
            songTitle={bookTitle}
            allowBankTransfer={false}
            prepare={prepareCardPayment}
            onConfirmed={() => {
              refreshPoints();
              onConfirmed();
            }}
          />
        </>
      )}
    </div>
  );
}
