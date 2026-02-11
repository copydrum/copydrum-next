import { useState, useMemo, useCallback, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';
import { startCashCharge } from '../../lib/payments';
import type { VirtualAccountInfo } from '../../lib/payments';
import type { Profile } from '../../lib/supabase';
import PayPalPaymentModal from './PayPalPaymentModal';
import { getSiteCurrency, convertFromKrw, formatCurrency as formatCurrencyUtil } from '../../lib/currency';

// ProfileInfo는 Profile의 일부 필드만 포함하는 타입일 수 있으므로, 유연하게 처리
type ProfileLike = Profile | { id: string; email?: string | null; name?: string | null; display_name?: string | null; phone?: string | null } | null;

interface ChargeOption {
  amount: number;
  bonus?: number;
  bonusPercent?: string;
  label?: string;
  amountUSD?: number;
  bonusUSD?: number;
  amountJPY?: number;
  bonusJPY?: number;
  displayAmount?: number;
}

interface PaymentMethod {
  id: 'card' | 'kakaopay' | 'bank' | 'paypal';
  name: string;
  icon: string;
  color: string;
  disabled?: boolean;
  badge?: string;
}

interface PointChargeModalProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  profile: ProfileLike;
  userCash: number;
  cashLoading: boolean;
  cashError: boolean;
  onCashUpdate?: () => void;
}

export default function PointChargeModal({
  open,
  onClose,
  user,
  profile,
  userCash,
  cashLoading,
  cashError,
  onCashUpdate,
}: PointChargeModalProps) {
  const { i18n, t } = useTranslation();
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'copydrum.com';
  const currency = useMemo(() => getSiteCurrency(hostname, i18n.language), [hostname, i18n.language]);

  const formatCurrency = useCallback(
    (value: number) => {
      const converted = convertFromKrw(value, currency);
      return formatCurrencyUtil(converted, currency);
    },
    [currency],
  );

  const formatNumber = useCallback(
    (value: number) => new Intl.NumberFormat(i18n.language?.startsWith('ko') ? 'ko-KR' : 'en-US').format(value),
    [i18n.language],
  );

  // 포인트 포맷 함수 (숫자 + P)
  const formatPoints = useCallback(
    (value: number) => `${value.toLocaleString('en-US')} P`,
    [],
  );

  // KRW 기준 포인트 패키지
  const POINT_PACKAGES_KRW = useMemo(() => [
    { amount: 3000, bonus: 0 },
    { amount: 5000, bonus: 500 },
    { amount: 10000, bonus: 1500 },
    { amount: 30000, bonus: 6000 },
    { amount: 50000, bonus: 11000 },
    { amount: 100000, bonus: 25000 },
  ], []);

  const chargeOptions = useMemo<ChargeOption[]>(() => {
    return POINT_PACKAGES_KRW.map(pkg => {
      const convertedAmount = convertFromKrw(pkg.amount, currency);
      const label = formatCurrencyUtil(convertedAmount, currency);

      // Calculate bonus percent
      const bonusPercent = pkg.bonus > 0 ? Math.round((pkg.bonus / pkg.amount) * 100) + '%' : undefined;

      return {
        amount: pkg.amount, // Keep KRW amount for logic
        bonus: pkg.bonus,
        label,
        bonusPercent,
        // Add converted values for display if needed, but label should suffice
        displayAmount: convertedAmount
      };
    });
  }, [POINT_PACKAGES_KRW, currency]);

  const paymentMethods = useMemo<PaymentMethod[]>(() => {
    if (currency !== 'KRW') {
      return [
        {
          id: 'paypal',
          name: t('payment.paypal'),
          icon: 'ri-paypal-line',
          color: 'text-blue-700',
          disabled: false,
        },
      ];
    }
    // 한국 사이트: 무통장 입금 + 카카오페이
    return [
      {
        id: 'bank',
        name: t('sidebar.bankTransfer'),
        icon: 'ri-bank-line',
        color: 'text-green-600',
        disabled: false,
      },
      {
        id: 'kakaopay',
        name: t('payment.kakaopay') || '카카오페이',
        icon: 'ri-kakao-talk-line',
        color: 'text-yellow-500',
        disabled: false,
      },
    ];
  }, [currency, t]);

  const [chargeAmount, setChargeAmount] = useState<number>(chargeOptions[2].amount);
  const [selectedPayment, setSelectedPayment] = useState<'card' | 'kakaopay' | 'bank' | 'paypal'>(currency !== 'KRW' ? 'paypal' : 'bank');
  const [chargeAgreementChecked, setChargeAgreementChecked] = useState(false);
  const [chargeProcessing, setChargeProcessing] = useState(false);
  const [bankTransferInfo, setBankTransferInfo] = useState<VirtualAccountInfo | null>(null);
  const [showDepositorInput, setShowDepositorInput] = useState(false);
  const [depositorName, setDepositorName] = useState('');
  const [showPayPalModal, setShowPayPalModal] = useState(false);

  // Update selected payment method when currency changes
  useEffect(() => {
    if (open) {
      setSelectedPayment(currency !== 'KRW' ? 'paypal' : 'bank');
    }
  }, [currency, open]);

  const handleChargeConfirm = async () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    if (!chargeAgreementChecked) {
      alert('결제 약관에 동의해 주세요.');
      return;
    }

    const selectedOption = chargeOptions.find((option) => option.amount === chargeAmount);
    if (!selectedOption) {
      alert('선택한 충전 금액을 확인할 수 없습니다.');
      return;
    }

    if (selectedPayment === 'paypal') {
      setShowPayPalModal(true);
      return;
    }

    if (selectedPayment === 'kakaopay') {
      setChargeProcessing(true);
      try {
        const description = `${selectedOption.label || formatCurrency(selectedOption.amount)}`;
        const result = await startCashCharge({
          userId: user.id,
          amount: selectedOption.amount,
          bonusAmount: selectedOption.bonus ?? 0,
          paymentMethod: 'kakaopay',
          description,
          buyerName: user.email ?? null,
          buyerEmail: user.email ?? null,
        });

        // 카카오페이는 결제창이 열리므로 여기서는 로그만 남김
        console.log('[PointChargeModal] KakaoPay 결제 시작', result);
      } catch (error) {
        console.error('카카오페이 충전 오류:', error);
        alert(error instanceof Error ? error.message : '카카오페이 충전 중 오류가 발생했습니다.');
        setChargeProcessing(false);
      }
      return;
    }

    if (selectedPayment === 'bank') {
      setShowDepositorInput(true);
      setBankTransferInfo(null);
    }
  };

  const handlePayPalPayment = useCallback(async (elementId: string) => {
    if (!user) return;
    const selectedOption = chargeOptions.find((option) => option.amount === chargeAmount);
    if (!selectedOption) return;

    const description = `${selectedOption.label || formatCurrency(selectedOption.amount)}`;
    await startCashCharge({
      userId: user.id,
      amount: selectedOption.amount,
      bonusAmount: selectedOption.bonus ?? 0,
      paymentMethod: 'paypal',
      description,
      buyerName: user.email ?? null,
      buyerEmail: user.email ?? null,
      elementId,
    });
  }, [user, chargeAmount, chargeOptions, formatCurrency]);

  const handleBankTransferConfirm = async () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    if (!depositorName.trim()) {
      alert('입금자명을 입력해 주세요.');
      return;
    }

    const selectedOption = chargeOptions.find((option) => option.amount === chargeAmount);
    if (!selectedOption) {
      alert('선택한 충전 금액을 확인할 수 없습니다.');
      return;
    }

    setChargeProcessing(true);

    try {
      const description = `${selectedOption.label || formatCurrency(selectedOption.amount)}`;
      const result = await startCashCharge({
        userId: user.id,
        amount: selectedOption.amount,
        bonusAmount: selectedOption.bonus ?? 0,
        paymentMethod: 'bank_transfer',
        description,
        buyerName: user.user_metadata?.name ?? user.email ?? null,
        buyerEmail: user.email ?? null,
        depositorName: depositorName.trim(),
        returnUrl: new URL('/payments/inicis/return', window.location.origin).toString(),
      });

      setBankTransferInfo(result.virtualAccountInfo ?? null);
      setShowDepositorInput(false);
      await onCashUpdate?.();
      alert('주문이 접수되었습니다.\n입금 확인 후 관리자가 캐시 충전을 완료합니다.');
    } catch (error) {
      console.error('캐쉬 충전 오류:', error);
      alert(error instanceof Error ? error.message : '캐쉬 충전 중 오류가 발생했습니다.');
    } finally {
      setChargeProcessing(false);
    }
  };

  const handleClose = () => {
    onClose();
    setChargeAgreementChecked(false);
    setChargeProcessing(false);
    setBankTransferInfo(null);
    setShowDepositorInput(false);
    setDepositorName('');
    setShowPayPalModal(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999]">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">{t('sidebar.cashChargeTitle')}</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="p-4">
          {/* 현재 포인트 */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6 flex items-center">
            <i className="ri-coins-line text-yellow-600 text-lg mr-2"></i>
            <span className="text-sm text-gray-700">{t('sidebar.currentCash')}</span>
            {cashLoading ? (
              <span className="ml-auto font-bold text-yellow-400 animate-pulse">로딩 중...</span>
            ) : cashError ? (
              <span className="ml-auto text-sm font-bold text-red-600">오류</span>
            ) : (
              <span className="ml-auto font-bold text-yellow-600">{formatNumber(userCash)} P</span>
            )}
          </div>

          {showDepositorInput ? (
            <div className="space-y-5">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{t('sidebar.amountToDeposit')}</span>
                  <span className="text-lg font-bold text-blue-600">
                    {formatCurrency(chargeAmount)}
                  </span>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-2 border border-gray-200">
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>{t('sidebar.bank')}</span>
                  <span className="font-semibold text-gray-900">카카오뱅크</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>{t('sidebar.accountNumber')}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">3333-15-0302437</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText('3333-15-0302437');
                        alert(t('sidebar.accountNumberCopied') || '계좌번호가 복사되었습니다.');
                      }}
                      className="text-blue-600 hover:text-blue-800"
                      title={t('sidebar.copyAccountNumber') || '계좌번호 복사'}
                    >
                      <i className="ri-file-copy-line"></i>
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>{t('sidebar.accountHolder')}</span>
                  <span className="font-semibold text-gray-900">강만수</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-900">
                  {t('sidebar.depositorName')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={depositorName}
                  onChange={(event) => setDepositorName(event.target.value)}
                  placeholder={t('sidebar.depositorNamePlaceholder')}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500">
                  {t('sidebar.depositorNote')}
                </p>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-xs text-gray-700 space-y-1">
                <p>{t('sidebar.chargeNotice1')}</p>
                <p>{t('sidebar.chargeNotice2')}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowDepositorInput(false);
                    setDepositorName('');
                  }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 px-4 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors"
                >
                  {t('sidebar.previous')}
                </button>
                <button
                  onClick={handleBankTransferConfirm}
                  disabled={chargeProcessing}
                  className="flex-1 bg-blue-600 text-white py-2.5 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-70 font-medium text-sm transition-colors"
                >
                  {chargeProcessing ? t('sidebar.processing') : t('sidebar.confirm')}
                </button>
              </div>
            </div>
          ) : bankTransferInfo ? (
            <div className="space-y-5">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-800 mb-3">{t('sidebar.bankTransferInfo')}</h3>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li>
                    <span className="font-medium text-gray-900">{t('sidebar.bank')}</span> {bankTransferInfo.bankName}
                  </li>
                  <li>
                    <span className="font-medium text-gray-900">{t('sidebar.accountNumber')}</span>{' '}
                    {bankTransferInfo.accountNumber}
                  </li>
                  <li>
                    <span className="font-medium text-gray-900">{t('sidebar.accountHolder')}</span> {bankTransferInfo.depositor}
                  </li>
                  <li>
                    <span className="font-medium text-gray-900">{t('sidebar.depositAmount')}</span>{' '}
                    {formatCurrency(bankTransferInfo.amount ?? chargeAmount)}
                  </li>
                  {bankTransferInfo.expectedDepositor ? (
                    <li>
                      <span className="font-medium text-gray-900">{t('sidebar.depositorName')}</span>{' '}
                      <span className="text-blue-600 font-semibold">
                        {bankTransferInfo.expectedDepositor}
                      </span>
                    </li>
                  ) : null}
                </ul>
                {bankTransferInfo.message ? (
                  <p className="mt-4 text-xs text-gray-600">{bankTransferInfo.message}</p>
                ) : null}
              </div>

              <button
                onClick={handleClose}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 font-bold text-sm transition-colors"
              >
                {t('sidebar.confirm')}
              </button>
            </div>
          ) : (
            <>
              {/* 포인트 패키지 선택 */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">{t('sidebar.pointPackage')}</h3>
                <div className="grid grid-cols-2 gap-3">
                  {chargeOptions.map((option, index) => {
                    const totalPoints = option.amount + (option.bonus ?? 0);
                    const bonusPercent = option.bonus && option.amount > 0
                      ? Math.round((option.bonus / option.amount) * 100)
                      : 0;

                    // 한국 사이트와 글로벌/일본 사이트 분기 처리
                    if (currency !== 'KRW') {
                      // 글로벌/일본 사이트: 외화 기반 UI
                      // paymentAmount는 통화로 변환된 금액을 포맷팅
                      const paymentAmount = formatCurrency(option.amount);
                      const formattedTotalPoints = formatPoints(totalPoints);
                      const formattedBonusPoints = option.bonus ? formatPoints(option.bonus) : '0 P';

                      return (
                        <button
                          key={index}
                          onClick={() => setChargeAmount(option.amount)}
                          className={`relative p-4 border rounded-xl text-left transition-all duration-200 ${chargeAmount === option.amount
                            ? 'border-blue-500 bg-blue-50 shadow-md ring-1 ring-blue-500'
                            : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
                            }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-lg font-bold text-gray-900">
                              {t('sidebar.totalPoints', { amount: formattedTotalPoints })}
                            </span>
                            <div className={`w-5 h-5 border-2 rounded-full flex items-center justify-center transition-colors ${chargeAmount === option.amount ? 'border-blue-500' : 'border-gray-300'
                              }`}>
                              {chargeAmount === option.amount && (
                                <div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600 font-medium">
                              {t('sidebar.payAndBonus', { payment: paymentAmount })}
                            </span>

                            {option.bonus && option.bonus > 0 && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r from-purple-100 to-blue-100 text-blue-700 border border-blue-100">
                                <i className="ri-gift-2-fill mr-1 text-purple-500"></i>
                                +{formattedBonusPoints.replace(' P', '')} P ({bonusPercent}%)
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    } else {
                      // 한국 사이트: KRW 기반 UI
                      const amountKRW = formatNumber(option.amount);
                      const bonusPoints = option.bonus ? formatPoints(option.bonus) : '0 P';

                      return (
                        <button
                          key={index}
                          onClick={() => setChargeAmount(option.amount)}
                          className={`relative p-4 border rounded-xl text-left transition-all duration-200 ${chargeAmount === option.amount
                            ? 'border-blue-500 bg-blue-50 shadow-md ring-1 ring-blue-500'
                            : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
                            }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-lg font-bold text-gray-900">
                              {t('sidebar.totalPoints', { amount: formatPoints(totalPoints) })}
                            </span>
                            <div className={`w-5 h-5 border-2 rounded-full flex items-center justify-center transition-colors ${chargeAmount === option.amount ? 'border-blue-500' : 'border-gray-300'
                              }`}>
                              {chargeAmount === option.amount && (
                                <div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600 font-medium">
                              {t('sidebar.payAndBonus', { payment: amountKRW })}
                            </span>

                            {option.bonus && option.bonus > 0 && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r from-purple-100 to-blue-100 text-blue-700 border border-blue-100">
                                <i className="ri-gift-2-fill mr-1 text-purple-500"></i>
                                +{bonusPoints.replace(' P', '')} P ({bonusPercent}%)
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    }
                  })}
                </div>
              </div>

              {/* 결제방법 */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  {(currency !== 'KRW') ? t('sidebar.paymentMethod') : t('sidebar.paymentMethodLabel')}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {paymentMethods.map((method) => {
                    const isSelected = selectedPayment === method.id;
                    const isDisabled = method.disabled;
                    return (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => {
                          if (isDisabled) {
                            alert(t('mobile.cash.paymentUnavailable'));
                            return;
                          }
                          setSelectedPayment(method.id);
                        }}
                        disabled={isDisabled}
                        className={`p-3 border rounded-lg text-left transition-colors ${isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                          } ${isDisabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            {method.id === 'kakaopay' && currency === 'KRW' ? (
                              <img 
                                src="/payment_icon_yellow_medium.png" 
                                alt="카카오페이" 
                                className="h-5 w-auto object-contain mr-2"
                              />
                            ) : (
                              <i className={`${method.icon} ${method.color} text-lg mr-2`}></i>
                            )}
                            <span className="text-sm font-medium">
                              {method.id === 'card'
                                ? t('sidebar.creditCard')
                                : method.id === 'kakaopay'
                                  ? t('sidebar.kakaoPay')
                                  : method.id === 'paypal'
                                    ? t('payment.paypal')
                                    : t('sidebar.bankTransfer')}
                            </span>
                          </div>
                          <div className="w-4 h-4 border-2 rounded-full flex items-center justify-center">
                            {isSelected && <div className="w-2 h-2 bg-blue-500 rounded-full"></div>}
                          </div>
                        </div>
                        {method.badge ? (
                          <div className="mt-1">
                            <span className="bg-gray-200 text-gray-700 text-xs px-2 py-0.5 rounded">
                              {t('sidebar.preparing')}
                            </span>
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 약관 동의 */}
              <div className="mb-6">
                <label className="flex items-start cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chargeAgreementChecked}
                    onChange={(event) => setChargeAgreementChecked(event.target.checked)}
                    className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                  />
                  <span className="ml-2 text-xs text-gray-600 leading-relaxed">
                    {t('sidebar.agreement')}
                    <button type="button" className="text-blue-600 hover:text-blue-800 ml-1">
                      <i className="ri-arrow-down-s-line"></i>
                    </button>
                  </span>
                </label>
              </div>

              {/* 충전하기 버튼 */}
              <button
                onClick={handleChargeConfirm}
                disabled={chargeProcessing}
                className={`w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-4 rounded-lg font-bold text-sm transition-colors ${chargeProcessing ? 'opacity-70 cursor-not-allowed' : 'hover:from-blue-700 hover:to-purple-700'
                  }`}
              >
                {chargeProcessing ? t('sidebar.processing') : t('sidebar.charge')}
              </button>
            </>
          )}
        </div>
      </div>
      <PayPalPaymentModal
        open={showPayPalModal}
        amount={chargeAmount}
        orderTitle={chargeOptions.find(o => o.amount === chargeAmount)?.label || 'Cash Charge'}
        onClose={() => setShowPayPalModal(false)}
        onSuccess={(response) => {
          console.log('PayPal payment success:', response);
          setShowPayPalModal(false);
          alert(t('mobile.cash.chargeComplete') || 'Payment completed successfully.');
          onCashUpdate?.();
        }}
        onError={(error) => {
          console.error('PayPal payment error:', error);
        }}
        initiatePayment={handlePayPalPayment}
      />
    </div>
  );
}

