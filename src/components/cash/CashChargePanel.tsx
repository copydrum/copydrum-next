'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import {
  CASH_CHARGE_PACKAGES,
  getCashChargeMethods,
  getCashChargeRegion,
  pickPackageForShortfall,
  type CashChargeMethod,
  type CashChargePackage,
} from '@/lib/payments/cashPackages';
import {
  CashChargeError,
  clearCashChargeContext,
  confirmPortOneCharge,
  createCashChargeOrder,
  fetchCashBalance,
  saveCashChargeContext,
  waitForChargeCompletion,
} from '@/lib/payments/cashChargeClient';
import { requestInicisPayment, requestKakaoPayPayment, requestPortonePayment } from '@/lib/payments/portone';
import { ensureLemonJs, openLemonCheckout } from '@/lib/payments/lemonJs';
import { formatWalletAmount } from '@/lib/wallet/display';
import PayPalPaymentButton from '@/components/checkout/PayPalPaymentButton';
import VirtualAccountInfoCard, { type VirtualAccountInfo } from './VirtualAccountInfoCard';

const TYPICAL_SHEET_PRICE = 3000;

const METHOD_ICONS: Record<CashChargeMethod, string> = {
  card: 'ri-bank-card-line',
  kakaopay: 'ri-kakao-talk-fill',
  virtual_account: 'ri-bank-line',
  lemonsqueezy: 'ri-bank-card-line',
  paypal: 'ri-paypal-fill',
};

const ERROR_KEYS: Record<string, string> = {
  AUTH_REQUIRED: 'checkout.cashCharge.error.authRequired',
  INVALID_AMOUNT: 'checkout.cashCharge.error.invalidAmount',
  INVALID_METHOD: 'checkout.cashCharge.error.invalidMethod',
};

type Step = 'select' | 'paying' | 'paypal' | 'confirming' | 'va_issued' | 'done';

interface ActiveCharge {
  orderId: string;
  pack: CashChargePackage;
  method: CashChargeMethod;
}

export interface CashChargePanelProps {
  /** 부족한 금액(KRW). 이 금액을 채우는 가장 작은 상품을 미리 고른다 */
  shortfall?: number;
  /** 모바일 리디렉션 후 결과 화면에서 돌아갈 경로 */
  returnTo?: string;
  /** 이 화면 안에서 충전이 끝났을 때 (새 잔액) */
  onCharged?: (balance: number) => void;
  onClose?: () => void;
}

export default function CashChargePanel({ shortfall, returnTo, onCharged, onClose }: CashChargePanelProps) {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const locale = i18n.language;
  const region = getCashChargeRegion(locale);
  const packages = CASH_CHARGE_PACKAGES[region];
  const methods = getCashChargeMethods(region);

  const initialPack =
    shortfall && shortfall > 0
      ? pickPackageForShortfall(region, shortfall)
      : packages.find((pkg) => pkg.badge === 'popular') ?? packages[0];

  const [selectedAmount, setSelectedAmount] = useState(initialPack.amount);
  const [method, setMethod] = useState<CashChargeMethod>(methods[0]);
  const [agreed, setAgreed] = useState(false);
  const [step, setStep] = useState<Step>('select');
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [active, setActive] = useState<ActiveCharge | null>(null);
  const [vaInfo, setVaInfo] = useState<VirtualAccountInfo | null>(null);

  const selectedPack = packages.find((pkg) => pkg.amount === selectedAmount) ?? initialPack;
  const money = useCallback((krw: number) => formatWalletAmount(krw, locale), [locale]);

  useEffect(() => {
    if (!user?.id) return;
    fetchCashBalance(user.id).then(setBalance);
  }, [user?.id]);

  useEffect(() => {
    if (region === 'intl' || region === 'intl_discount') {
      ensureLemonJs().catch(() => undefined);
    }
  }, [region]);

  const userId = user?.id;
  const finish = useCallback(async () => {
    clearCashChargeContext();
    const next = userId ? await fetchCashBalance(userId) : 0;
    setBalance(next);
    setStep('done');
    onCharged?.(next);
  }, [userId, onCharged]);

  const handleConfirmResult = useCallback(
    async (result: 'done' | 'delayed' | 'failed') => {
      if (result === 'done') {
        await finish();
        return;
      }
      setStep('select');
      setError(t(result === 'delayed' ? 'checkout.cashCharge.error.delayed' : 'checkout.cashCharge.error.failed'));
    },
    [finish, t],
  );

  const failWith = useCallback(
    (raw?: unknown) => {
      const message = (raw as { message?: string } | undefined)?.message || '';
      const cancelled = /cancel|취소|closed|user_close/i.test(message);
      setStep('select');
      setError(
        cancelled
          ? t('checkout.cashCharge.error.cancelled')
          : t('checkout.cashCharge.error.payFailed', { message }),
      );
    },
    [t],
  );

  const handleSubmit = async () => {
    if (step !== 'select') return;
    setError(null);
    if (!user?.id) {
      setError(t('checkout.cashCharge.error.authRequired'));
      return;
    }
    if (!agreed) {
      setError(t('checkout.cashCharge.error.agreeRequired'));
      return;
    }

    setStep('paying');
    let orderId: string;
    try {
      ({ orderId } = await createCashChargeOrder({ amount: selectedPack.amount, method, locale }));
    } catch (e) {
      const code = e instanceof CashChargeError ? e.code : 'CREATE_FAILED';
      setStep('select');
      setError(t(ERROR_KEYS[code] ?? 'checkout.cashCharge.error.createFailed'));
      return;
    }

    const charge: ActiveCharge = { orderId, pack: selectedPack, method };
    setActive(charge);
    saveCashChargeContext({
      orderId,
      method,
      amount: selectedPack.amount,
      bonus: selectedPack.bonus,
      returnTo,
    });

    const origin = window.location.origin;
    const resultUrl = `${origin}/payments/cash-charge?orderId=${orderId}&method=${method}`;
    const orderName =
      region === 'kr'
        ? `캐쉬 ${(selectedPack.amount + selectedPack.bonus).toLocaleString('ko-KR')}원 충전`
        : `CopyDrum Credits (${money(selectedPack.amount)})`;
    const buyerName = user.user_metadata?.name || undefined;

    try {
      if (method === 'card') {
        const result = await requestPortonePayment({
          userId: user.id,
          amount: selectedPack.amount,
          orderId,
          description: orderName,
          buyerEmail: user.email || undefined,
          buyerName,
          returnUrl: resultUrl,
          payMethod: 'CARD',
        });
        if (!result.success || !result.paymentId) {
          failWith({ message: result.error_msg });
          return;
        }
        setStep('confirming');
        await handleConfirmResult(await confirmPortOneCharge(orderId, result.paymentId, 'card'));
        return;
      }

      if (method === 'kakaopay') {
        const result = await requestKakaoPayPayment({
          userId: user.id,
          amount: selectedPack.amount,
          orderId,
          buyerEmail: user.email || undefined,
          buyerName,
          description: orderName,
          returnUrl: resultUrl,
          onSuccess: async (response) => {
            setStep('confirming');
            await handleConfirmResult(await confirmPortOneCharge(orderId, response.paymentId, 'kakaopay'));
          },
          onError: failWith,
        });
        if (!result.success) failWith({ message: result.error_msg });
        return;
      }

      if (method === 'virtual_account') {
        const result = await requestInicisPayment({
          userId: user.id,
          amount: selectedPack.amount,
          orderId,
          buyerEmail: user.email || undefined,
          buyerName,
          description: orderName,
          payMethod: 'VIRTUAL_ACCOUNT',
          returnUrl: resultUrl,
          onSuccess: async (response) => {
            let info = response?.virtualAccountInfo as VirtualAccountInfo | null;
            if (!info) {
              const { data } = await supabase
                .from('orders')
                .select('virtual_account_info')
                .eq('id', orderId)
                .maybeSingle();
              info = (data?.virtual_account_info as VirtualAccountInfo | null) ?? null;
            }
            setVaInfo(info);
            setStep('va_issued');
          },
          onError: failWith,
        });
        if (!result.success) failWith({ message: result.error_msg });
        return;
      }

      if (method === 'lemonsqueezy') {
        const response = await fetch('/api/payments/lemon-squeezy/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, locale }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.checkoutUrl) {
          failWith({ message: result?.error });
          return;
        }
        await ensureLemonJs().catch(() => undefined);
        openLemonCheckout(result.checkoutUrl, async () => {
          setStep('confirming');
          await handleConfirmResult((await waitForChargeCompletion(orderId)) ? 'done' : 'delayed');
        });
        setStep('select');
        return;
      }

      setStep('paypal');
    } catch (e) {
      failWith(e);
    }
  };

  const busy = step === 'paying' || step === 'confirming';

  if (step === 'done') {
    const charged = active ? active.pack.amount + active.pack.bonus : 0;
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <i className="ri-check-line text-3xl text-emerald-600"></i>
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900">{t('checkout.cashCharge.doneTitle')}</h3>
          <p className="mt-2 text-gray-700">{t('checkout.cashCharge.doneMessage', { amount: money(charged) })}</p>
          {balance !== null && (
            <p className="mt-1 text-sm text-gray-500">{t('checkout.cashCharge.newBalance', { balance: money(balance) })}</p>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
          >
            {t('checkout.cashCharge.close')}
          </button>
        )}
      </div>
    );
  }

  if (step === 'va_issued' && active) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-gray-900">{t('checkout.cashCharge.vaTitle')}</h3>
        {vaInfo ? (
          <VirtualAccountInfoCard info={vaInfo} amountLabel={money(active.pack.amount)} />
        ) : (
          <p className="text-sm text-gray-600">{t('checkout.cashCharge.vaPending')}</p>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-gray-300 py-3 font-semibold text-gray-700 hover:bg-gray-50"
          >
            {t('checkout.cashCharge.close')}
          </button>
        )}
      </div>
    );
  }

  if (step === 'paypal' && active) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-semibold">
            {t('checkout.cashCharge.payToCharge', {
              pay: money(active.pack.amount),
              total: money(active.pack.amount + active.pack.bonus),
            })}
          </p>
          <p className="mt-1 text-blue-800">{t('checkout.cashCharge.paypalHint')}</p>
        </div>
        <PayPalPaymentButton
          orderId={active.orderId}
          amount={active.pack.amount}
          items={[]}
          orderReady
          orderName={`CopyDrum Credits (${money(active.pack.amount)})`}
          onSuccess={async () => {
            setStep('confirming');
            await handleConfirmResult((await waitForChargeCompletion(active.orderId, 30000)) ? 'done' : 'delayed');
          }}
          onError={failWith}
          onProcessing={() => undefined}
          compact
        />
        <button
          type="button"
          onClick={() => setStep('select')}
          className="w-full text-sm font-medium text-gray-500 hover:text-gray-800"
        >
          {t('checkout.cashCharge.back')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <p className="text-sm text-gray-600">{t('checkout.cashCharge.subtitle')}</p>
        {balance !== null && (
          <p className="shrink-0 text-sm text-gray-600">
            {t('checkout.cashCharge.currentBalance')} <span className="font-bold text-gray-900">{money(balance)}</span>
          </p>
        )}
      </div>

      {shortfall && shortfall > 0 ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t('checkout.cashCharge.shortfall', { amount: money(shortfall) })}
        </p>
      ) : null}

      <div className="grid gap-2.5" role="radiogroup">
        {packages.map((pkg) => {
          const selected = pkg.amount === selectedPack.amount;
          const total = pkg.amount + pkg.bonus;
          const rate = Math.round((pkg.bonus / pkg.amount) * 100);
          return (
            <button
              key={pkg.amount}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={busy}
              onClick={() => setSelectedAmount(pkg.amount)}
              className={`relative flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors disabled:opacity-60 ${
                selected ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  selected ? 'border-blue-600' : 'border-gray-300'
                }`}
              >
                {selected && <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-bold text-gray-900">
                    {t('checkout.cashCharge.payToCharge', { pay: money(pkg.amount), total: money(total) })}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">+{rate}%</span>
                  {pkg.badge && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        pkg.badge === 'best' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {t(pkg.badge === 'best' ? 'checkout.cashCharge.best' : 'checkout.cashCharge.popular')}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-gray-500">
                  {t('checkout.cashCharge.bonus', { bonus: money(pkg.bonus) })} ·{' '}
                  {t('checkout.cashCharge.sheets', { count: Math.floor(total / TYPICAL_SHEET_PRICE) })}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-800">{t('checkout.cashCharge.methodTitle')}</p>
        <div className={`grid gap-2 ${methods.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {methods.map((m) => (
            <button
              key={m}
              type="button"
              disabled={busy}
              onClick={() => setMethod(m)}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-3 text-xs font-semibold transition-colors disabled:opacity-60 sm:flex-row sm:text-sm ${
                method === m ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:border-blue-300'
              }`}
            >
              <i className={`${METHOD_ICONS[m]} text-lg`}></i>
              <span className="text-center">{t(`checkout.cashCharge.method.${m}`)}</span>
            </button>
          ))}
        </div>
        {method === 'virtual_account' && <p className="text-xs text-gray-500">{t('checkout.cashCharge.vaHint')}</p>}
      </div>

      <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          disabled={busy}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600"
        />
        <span>
          {t('checkout.cashCharge.agree')}{' '}
          <a
            href="/policy/refund#cash-charge"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-blue-600 underline"
            onClick={(e) => e.stopPropagation()}
          >
            {t('checkout.cashCharge.viewPolicy')}
          </a>
        </span>
      </label>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 text-base font-bold text-white shadow-lg transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <>
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <span>{step === 'confirming' ? t('checkout.cashCharge.confirming') : t('checkout.processing')}</span>
          </>
        ) : (
          <span>{t('checkout.cashCharge.submit', { pay: money(selectedPack.amount) })}</span>
        )}
      </button>
    </div>
  );
}
