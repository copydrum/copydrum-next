import { useCallback, useMemo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSiteCurrency, convertFromKrw, formatCurrency as formatCurrencyUtil } from '../../lib/currency';
import { isKoreanSiteHost } from '../../config/hostType';

// 'bank_transfer' (수동) 추가, 'virtual_account' 삭제
type PaymentMethod = 'cash' | 'card' | 'bank' | 'paypal' | 'kakaopay' | 'inicis' | 'bank_transfer' | 'transfer';

type PaymentContext = 'buyNow' | 'cashCharge';

interface PaymentMethodOption {
  id: PaymentMethod;
  name: string;
  description?: string;
  icon: string;
  color: string;
  badge?: string;
  disabled?: boolean;
  channelKey?: string;
  payMethod?: 'CARD' | 'VIRTUAL_ACCOUNT' | 'TRANSFER' | 'EASY_PAY';
  pg?: string;
}

interface PaymentMethodSelectorProps {
  open: boolean;
  amount: number;
  onClose: () => void;
  onSelect: (method: PaymentMethod, option?: PaymentMethodOption) => void;
  allowCash?: boolean;
  disabledMethods?: PaymentMethod[];
  context?: PaymentContext;
  userCredits?: number;
}

export type { PaymentMethod, PaymentContext, PaymentMethodOption };

function getAvailablePaymentMethods(
  siteType: 'ko' | 'global',
  context: PaymentContext,
  t: (key: string) => string,
  userCredits: number = 0,
): PaymentMethodOption[] {
  if (siteType === 'global') {
    return [
      {
        id: 'paypal',
        name: t('payment.paypal'),
        description: t('payments.paypalDescription'),
        icon: 'ri-paypal-line',
        color: 'text-blue-700',
        disabled: false,
      },
    ];
  }

  // 한국어 사이트
  if (siteType === 'ko') {
    const methods: PaymentMethodOption[] = [
      // 1. 무통장입금 (기존 카카오뱅크 수동 입금 복구)
      {
        id: 'bank_transfer', // useBuyNow.ts에서 이 ID를 수동 모달로 인식함
        name: '무통장입금',
        description: '입금 확인 후 관리자가 수동으로 구매를 완료합니다.',
        icon: 'ri-bank-line',
        color: 'text-green-600',
        disabled: false,
      },
      // 2. 신용카드 (KG이니시스 유지)
      {
        id: 'card',
        name: '신용카드',
        description: '신용카드로 결제',
        icon: 'ri-bank-card-line',
        color: 'text-blue-600',
        disabled: false,
        channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_INICIS,
        payMethod: 'CARD',
        pg: 'KG이니시스',
      },
      // 3. 카카오페이 (유지)
      {
        id: 'kakaopay',
        name: t('payment.kakaopay') || '카카오페이',
        description: t('payment.kakaopayDescription') || '간편하게 카카오페이로 결제',
        icon: 'ri-kakao-talk-line',
        color: 'text-yellow-500',
        disabled: false,
        channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_KAKAOPAY,
        payMethod: 'EASY_PAY',
        pg: '카카오페이',
      },
      // 4. 실시간 계좌이체 (필요 없으시면 삭제 가능)
      {
        id: 'transfer',
        name: '실시간 계좌이체',
        description: '실시간 계좌이체로 결제',
        icon: 'ri-exchange-line',
        color: 'text-purple-600',
        disabled: false,
        channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_INICIS,
        payMethod: 'TRANSFER',
        pg: 'KG이니시스',
      },
    ];

    if (userCredits > 0 && context === 'buyNow') {
      methods.push({
        id: 'cash',
        name: t('payment.cash'),
        description: t('payment.cashDescription'),
        icon: 'ri-coins-line',
        color: 'text-yellow-600',
        disabled: false,
      });
    }

    return methods;
  }

  return [
    {
      id: 'bank',
      name: t('payment.bank'),
      description: t('payment.bankDescription'),
      icon: 'ri-bank-line',
      color: 'text-green-600',
      disabled: false,
    },
  ];
}

export const PaymentMethodSelector = ({
  open,
  amount,
  onClose,
  onSelect,
  allowCash = true,
  disabledMethods = [],
  context = 'buyNow',
  userCredits = 0,
}: PaymentMethodSelectorProps) => {
  const { t, i18n: i18nInstance } = useTranslation();

  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'copydrum.com';
  const currency = useMemo(() => getSiteCurrency(hostname, i18nInstance.language), [hostname, i18nInstance.language]);
  const isKoreanSite = isKoreanSiteHost(hostname);
  const isGlobalSite = !isKoreanSite;

  const formatCurrency = useCallback(
    (value: number) => {
      const convertedAmount = convertFromKrw(value, currency);
      return formatCurrencyUtil(convertedAmount, currency);
    },
    [currency],
  );

  const siteType: 'ko' | 'global' = useMemo(() => {
    return isGlobalSite ? 'global' : 'ko';
  }, [isGlobalSite]);

  const paymentMethodOptions: PaymentMethodOption[] = useMemo(() => {
    return getAvailablePaymentMethods(siteType, context, t, userCredits);
  }, [siteType, context, t, userCredits]);

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [selectedOption, setSelectedOption] = useState<PaymentMethodOption | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedMethod(null);
      setSelectedOption(null);
    }
  }, [open]);

  const handleConfirm = () => {
    if (selectedMethod && selectedOption) {
      onSelect(selectedMethod, selectedOption);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('payments.methodSelectionTitle')}</h2>
          <div className="mt-1 space-y-1">
            <p className="text-sm text-gray-600">
              {t('payments.amountLabel')} <span className="font-semibold text-gray-900">{formatCurrency(amount)}</span>
            </p>
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="space-y-3">
            {paymentMethodOptions.map((option) => {
              const isDisabled =
                option.disabled || disabledMethods.includes(option.id);
              return (
                <label
                  key={option.id}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${isDisabled
                      ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400'
                      : selectedMethod === option.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'cursor-pointer border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                    }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={option.id}
                    checked={selectedMethod === option.id}
                    onChange={() => {
                      if (isDisabled) return;
                      setSelectedMethod(option.id);
                      setSelectedOption(option);
                    }}
                    disabled={isDisabled}
                    className="h-4 w-4 shrink-0 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex flex-1 items-center gap-3">
                    {option.id === 'kakaopay' && isKoreanSite ? (
                      <img
                        src="/payment_icon_yellow_medium.png"
                        alt="카카오페이"
                        className="h-6 w-auto shrink-0 object-contain"
                      />
                    ) : (
                      <i className={`${option.icon} ${option.color} shrink-0 text-xl`}></i>
                    )}
                    <div className="flex-1 text-left">
                      <p className="text-sm font-semibold text-gray-900">{option.name}</p>
                      {option.description ? (
                        <p className="text-xs text-gray-500">{option.description}</p>
                      ) : null}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="mt-6 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('button.cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedMethod}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
            >
              결제하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
