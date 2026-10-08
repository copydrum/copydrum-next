'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { supabase } from '@/lib/supabase';
import type { CashChargeMethod } from '@/lib/payments/cashPackages';
import {
  clearCashChargeContext,
  confirmPortOneCharge,
  fetchCashBalance,
  readCashChargeContext,
  waitForChargeCompletion,
} from '@/lib/payments/cashChargeClient';
import { formatWalletAmount } from '@/lib/wallet/display';
import VirtualAccountInfoCard, { type VirtualAccountInfo } from '@/components/cash/VirtualAccountInfoCard';

type ViewState =
  | { kind: 'checking' }
  | { kind: 'done'; charged: number; balance: number }
  | { kind: 'va'; info: VirtualAccountInfo | null; amount: number }
  | { kind: 'error'; message: string };

const PORTONE_METHODS: CashChargeMethod[] = ['card', 'kakaopay', 'paypal'];

function CashChargeResult() {
  const { t, i18n } = useTranslation();
  const router = useLocaleRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<ViewState>({ kind: 'checking' });
  const [returnTo] = useState<string | undefined>(() =>
    typeof window === 'undefined'
      ? undefined
      : readCashChargeContext(searchParams.get('orderId') || '')?.returnTo,
  );
  const started = useRef(false);

  const money = (krw: number) => formatWalletAmount(krw, i18n.language);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const orderId = searchParams.get('orderId') || '';
    const method = (searchParams.get('method') || '') as CashChargeMethod;
    const code = searchParams.get('code');
    const message = searchParams.get('message') || '';
    const context = readCashChargeContext(orderId);

    sessionStorage.removeItem('portone_order_id');
    sessionStorage.removeItem('portone_payment_id');
    sessionStorage.removeItem('portone_payment_method');

    const run = async () => {
      if (!orderId) {
        setView({ kind: 'error', message: t('checkout.cashCharge.error.failed') });
        return;
      }
      if (code && code !== '0') {
        const cancelled = /cancel|취소/i.test(message);
        setView({
          kind: 'error',
          message: cancelled
            ? t('checkout.cashCharge.error.cancelled')
            : t('checkout.cashCharge.error.payFailed', { message }),
        });
        return;
      }

      const { data: order } = await supabase
        .from('orders')
        .select('id, user_id, status, total_amount, metadata, transaction_id, virtual_account_info')
        .eq('id', orderId)
        .maybeSingle();
      if (!order) {
        setView({ kind: 'error', message: t('checkout.cashCharge.error.failed') });
        return;
      }

      const amount = Number(order.total_amount) || context?.amount || 0;
      const bonus = Number((order.metadata as Record<string, unknown> | null)?.bonusAmount) || context?.bonus || 0;
      const paymentId = searchParams.get('paymentId') || order.transaction_id || '';

      const showDone = async () => {
        clearCashChargeContext();
        setView({ kind: 'done', charged: amount + bonus, balance: await fetchCashBalance(order.user_id) });
      };

      if (order.status === 'completed') {
        await showDone();
        return;
      }

      if (method === 'virtual_account') {
        let info = (order.virtual_account_info as VirtualAccountInfo | null) ?? null;
        if (!info && paymentId) {
          const { data } = await supabase.functions.invoke('portone-payment-confirm', {
            body: { paymentId, orderId },
          });
          info = (data?.data?.virtualAccountInfo as VirtualAccountInfo | null) ?? null;
        }
        clearCashChargeContext();
        setView({ kind: 'va', info, amount });
        return;
      }

      let result: 'done' | 'delayed' | 'failed';
      if (PORTONE_METHODS.includes(method) && paymentId) {
        result = await confirmPortOneCharge(orderId, paymentId, method);
      } else {
        result = (await waitForChargeCompletion(orderId)) ? 'done' : 'delayed';
      }

      if (result === 'done') {
        await showDone();
      } else {
        setView({
          kind: 'error',
          message: t(result === 'delayed' ? 'checkout.cashCharge.error.delayed' : 'checkout.cashCharge.error.failed'),
        });
      }
    };

    run().catch(() => setView({ kind: 'error', message: t('checkout.cashCharge.error.delayed') }));
  }, [searchParams, t]);

  const goBack = () => router.push(returnTo || '/mypage');

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md space-y-5 rounded-2xl bg-white p-6 shadow-lg">
        {view.kind === 'checking' && (
          <div className="py-8 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"></div>
            <p className="mt-4 font-medium text-gray-600">{t('checkout.cashCharge.confirming')}</p>
          </div>
        )}

        {view.kind === 'done' && (
          <div className="space-y-2 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <i className="ri-check-line text-3xl text-emerald-600"></i>
            </div>
            <h1 className="text-xl font-bold text-gray-900">{t('checkout.cashCharge.doneTitle')}</h1>
            <p className="text-gray-700">{t('checkout.cashCharge.doneMessage', { amount: money(view.charged) })}</p>
            <p className="text-sm text-gray-500">{t('checkout.cashCharge.newBalance', { balance: money(view.balance) })}</p>
          </div>
        )}

        {view.kind === 'va' && (
          <div className="space-y-4">
            <h1 className="text-lg font-bold text-gray-900">{t('checkout.cashCharge.vaTitle')}</h1>
            {view.info ? (
              <VirtualAccountInfoCard info={view.info} amountLabel={money(view.amount)} />
            ) : (
              <p className="text-sm text-gray-600">{t('checkout.cashCharge.vaPending')}</p>
            )}
          </div>
        )}

        {view.kind === 'error' && (
          <div className="space-y-2 text-center">
            <i className="ri-error-warning-line text-5xl text-amber-500"></i>
            <p className="text-gray-700">{view.message}</p>
          </div>
        )}

        {view.kind !== 'checking' && (
          <div className="space-y-2">
            {returnTo && view.kind !== 'va' && (
              <button
                type="button"
                onClick={goBack}
                className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
              >
                {t('checkout.cashCharge.continueCheckout')}
              </button>
            )}
            <button
              type="button"
              onClick={() => router.push('/mypage')}
              className="w-full rounded-xl border border-gray-300 py-3 font-semibold text-gray-700 hover:bg-gray-50"
            >
              {t('checkout.cashCharge.goMypage')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CashChargeResultPage() {
  return (
    <Suspense fallback={null}>
      <CashChargeResult />
    </Suspense>
  );
}
