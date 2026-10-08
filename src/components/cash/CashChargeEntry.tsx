'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import type { User } from '@supabase/supabase-js';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { fetchCashBalance } from '@/lib/payments/cashChargeClient';
import { getCashChargeRegion, getMaxBonusPercent } from '@/lib/payments/cashPackages';
import { markCashChargeAfterLogin, openCashChargeModal, subscribeCashBalanceChanged } from '@/lib/cashChargeModal';
import { formatWalletAmount } from '@/lib/wallet/display';

/** PC 헤더·모바일 헤더·모바일 메뉴가 같은 화면에서 동시에 잔액을 읽으므로 같은 요청을 나눠 쓴다 */
let inflight: { key: string; promise: Promise<number> } | null = null;

const loadBalance = (userId: string, pathname: string) => {
  const key = `${userId}:${pathname}`;
  if (inflight?.key !== key) {
    inflight = { key, promise: fetchCashBalance(userId) };
  }
  return inflight.promise;
};

function useCashChargeEntry(user?: User | null) {
  const router = useLocaleRouter();
  const pathname = usePathname();
  const { t, i18n } = useTranslation();
  const userId = user?.id;
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    loadBalance(userId, pathname ?? '').then((value) => {
      if (!cancelled) setBalance(value);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, pathname]);

  useEffect(
    () =>
      subscribeCashBalanceChanged((value) => {
        inflight = null;
        setBalance(value);
      }),
    [],
  );

  const openCharge = useCallback(() => {
    if (userId) {
      openCashChargeModal();
      return;
    }
    markCashChargeAfterLogin();
    router.push('/auth/login');
  }, [userId, router]);

  const percent = getMaxBonusPercent(getCashChargeRegion(i18n.language));

  return {
    t,
    loggedIn: Boolean(userId),
    balanceText: userId && balance !== null ? formatWalletAmount(balance, i18n.language) : '…',
    bonusBadge: t('checkout.cashCharge.entry.bonusBadge', { percent }),
    bonusShort: t('checkout.cashCharge.entry.bonusShort', { percent }),
    bonusUpTo: t('checkout.cashCharge.entry.bonusUpTo', { percent }),
    openCharge,
  };
}

/** PC 상단 메뉴줄: 잔액 + [충전], 로그아웃 상태는 [캐쉬충전] */
export function CashChargeHeaderButton({ user }: { user?: User | null }) {
  const { t, loggedIn, balanceText, bonusBadge, bonusUpTo, openCharge } = useCashChargeEntry(user);

  return (
    <button
      type="button"
      onClick={openCharge}
      title={bonusUpTo}
      className="relative mr-2 flex items-center gap-2 rounded-full bg-white/10 py-1 pl-3 pr-1 text-sm font-medium text-white transition-colors hover:bg-white/20 cursor-pointer"
      suppressHydrationWarning
    >
      <i className="ri-copper-coin-line text-base text-yellow-300"></i>
      {loggedIn && (
        <span className="whitespace-nowrap" suppressHydrationWarning>
          {t('checkout.cashCharge.entry.label')} {balanceText}
        </span>
      )}
      <span suppressHydrationWarning className="whitespace-nowrap rounded-full bg-yellow-400 px-2.5 py-0.5 text-xs font-bold text-gray-900">
        {loggedIn ? t('checkout.cashCharge.entry.charge') : t('checkout.cashCharge.entry.chargeCash')}
      </span>
      <span suppressHydrationWarning className="pointer-events-none absolute -right-2 -top-2.5 whitespace-nowrap rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
        {bonusBadge}
      </span>
    </button>
  );
}

/** 모바일 헤더: 로그인 시 잔액, 로그아웃 시 동전 아이콘 */
export function CashChargeMobileHeaderButton({ user }: { user?: User | null }) {
  const { t, loggedIn, balanceText, bonusShort, bonusUpTo, openCharge } = useCashChargeEntry(user);

  return (
    <button
      type="button"
      onClick={openCharge}
      aria-label={`${loggedIn ? t('checkout.cashCharge.entry.chargeNow') : t('checkout.cashCharge.entry.chargeCash')} (${bonusUpTo})`}
      className={`relative flex h-9 items-center justify-center gap-1 rounded-full transition-colors hover:bg-blue-600 ${
        loggedIn ? 'bg-white/15 px-2.5' : 'w-10'
      }`}
      suppressHydrationWarning
    >
      <i className={`ri-copper-coin-line text-yellow-300 ${loggedIn ? 'text-lg' : 'text-2xl'}`}></i>
      {loggedIn && <span suppressHydrationWarning className="whitespace-nowrap text-xs font-semibold">{balanceText}</span>}
      <span suppressHydrationWarning className="pointer-events-none absolute -right-1.5 -top-2 whitespace-nowrap rounded-full bg-red-500 px-1 py-0.5 text-[9px] font-bold leading-none text-white">
        {bonusShort}
      </span>
    </button>
  );
}

/** 모바일 햄버거 메뉴 상단 카드 */
export function CashChargeMenuCard({ user, onBeforeOpen }: { user?: User | null; onBeforeOpen?: () => void }) {
  const { t, loggedIn, balanceText, bonusUpTo, openCharge } = useCashChargeEntry(user);

  const handleClick = () => {
    onBeforeOpen?.();
    openCharge();
  };

  return (
    <div className="px-4 pt-4">
      <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white shadow-sm">
        {loggedIn ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-blue-100">{t('checkout.cashCharge.entry.myBalance')}</p>
              <p className="truncate text-lg font-bold">{balanceText}</p>
            </div>
            <button
              type="button"
              onClick={handleClick}
              className="flex-shrink-0 rounded-full bg-yellow-400 px-4 py-2 text-sm font-bold text-gray-900 transition-colors hover:bg-yellow-300"
            >
              {t('checkout.cashCharge.entry.chargeNow')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleClick}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-yellow-400 px-4 py-2.5 text-sm font-bold text-gray-900 transition-colors hover:bg-yellow-300"
          >
            <i className="ri-copper-coin-line text-base"></i>
            {t('checkout.cashCharge.entry.chargeCash')}
          </button>
        )}
        <p className="mt-2 flex items-center gap-1 text-xs text-blue-100">
          <i className="ri-gift-line"></i>
          {bonusUpTo}
        </p>
      </div>
    </div>
  );
}
