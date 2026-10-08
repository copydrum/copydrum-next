'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
import { subscribeCashChargeModal, type CashChargeModalOptions } from '@/lib/cashChargeModal';

const CashChargePanel = dynamic(() => import('./CashChargePanel'), { ssr: false });

/** openCashChargeModal() 로 어디서든 여는 캐쉬 충전 창 (PC: 가운데 창, 모바일: 아래에서 올라오는 시트) */
export default function CashChargeModalHost() {
  const { t } = useTranslation();
  const [options, setOptions] = useState<CashChargeModalOptions | null>(null);

  useEffect(() => subscribeCashChargeModal((next) => setOptions(next)), []);

  useEffect(() => {
    if (!options) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [options]);

  if (!options) return null;

  const close = () => setOptions(null);

  return (
    <div className="fixed inset-0 z-[10002] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('checkout.cashCharge.title')}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
          <h2 className="text-lg font-bold text-gray-900">{t('checkout.cashCharge.title')}</h2>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label={t('checkout.cashCharge.close')}
          >
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>
        <div className="px-5 py-5">
          <CashChargePanel
            shortfall={options.shortfall}
            returnTo={options.returnTo}
            onClose={close}
            onCharged={(balance) => {
              if (options.closeOnCharged) close();
              options.onCharged?.(balance);
            }}
          />
        </div>
      </div>
    </div>
  );
}
