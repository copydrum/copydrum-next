'use client';

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as PortOne from '@portone/browser-sdk/v2';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { isMobileDevice } from '../../utils/device';

const BANK_ACCOUNT_NUMBER = '3333-15-0302437';
const BANK_ACCOUNT_HOLDER = 'COPYDRUM';

interface CustomOrderKoreanPayButtonProps {
  customOrderId: string;
  amountKRW: number; // 견적 금액(KRW)
  songTitle: string;
  onConfirmed: () => void;
}

type Method = 'card' | 'kakaopay';

// 주문제작 견적 결제 전용 한국 결제 버튼(KG이니시스 카드 / 카카오페이 / 무통장 입금).
// 시트 구매 결제 함수(requestPortonePayment 등)와 달리 orders 테이블을 전혀 건드리지 않으며,
// PC(IFRAME) 콜백 또는 모바일(REDIRECTION) 리턴 페이지에서
// /api/payments/portone/verify-custom-order 로 검증 후 custom_orders 를 payment_confirmed 로 전이한다.
export default function CustomOrderKoreanPayButton({
  customOrderId,
  amountKRW,
  songTitle,
  onConfirmed,
}: CustomOrderKoreanPayButtonProps) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [processing, setProcessing] = useState<Method | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showBankModal, setShowBankModal] = useState(false);
  const [depositorName, setDepositorName] = useState('');
  const [bankTransferSubmitted, setBankTransferSubmitted] = useState(false);
  const [bankTransferProcessing, setBankTransferProcessing] = useState(false);

  const formatKRW = (value: number) => `₩${Math.round(value).toLocaleString('ko-KR')}`;

  const verifyWithRetry = useCallback(
    async (paymentId: string): Promise<'confirmed' | 'pending' | 'failed'> => {
      const RETRY_MS = [2000, 3000, 3000, 5000, 5000];
      for (let attempt = 0; attempt < RETRY_MS.length; attempt++) {
        try {
          const res = await fetch('/api/payments/portone/verify-custom-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId, customOrderId }),
          });
          const json = await res.json();
          if (res.ok && json.success) return 'confirmed';
          if (json.pending) {
            await new Promise((r) => setTimeout(r, RETRY_MS[attempt]));
            continue;
          }
          return 'failed';
        } catch {
          await new Promise((r) => setTimeout(r, RETRY_MS[attempt]));
        }
      }
      return 'pending';
    },
    [customOrderId]
  );

  const pay = useCallback(
    async (method: Method) => {
      if (!user?.id || processing) return;
      setError(null);
      setInfo(null);
      setProcessing(method);

      try {
        const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID!;
        const channelKey =
          method === 'kakaopay'
            ? process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_KAKAOPAY!
            : process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_INICIS!;

        const paymentId = `copay_${uuidv4()}`;
        const origin = window.location.origin;
        const returnUrl = `${origin}/payments/custom-order/return?customOrderId=${encodeURIComponent(
          customOrderId
        )}&method=${method}`;

        // 모바일 REDIRECTION 대비: 리턴 페이지에서 사용할 정보 저장
        sessionStorage.setItem('copay_custom_order_id', customOrderId);
        sessionStorage.setItem('copay_payment_id', paymentId);
        sessionStorage.setItem('copay_method', method);

        const windowType = { pc: 'IFRAME', mobile: 'REDIRECTION' } as const;

        const requestData: any = {
          storeId,
          channelKey,
          paymentId,
          orderId: customOrderId,
          orderName: songTitle || '맞춤 드럼 악보 제작',
          totalAmount: Math.round(amountKRW),
          currency: 'CURRENCY_KRW',
          payMethod: method === 'kakaopay' ? 'EASY_PAY' : 'CARD',
          customer: {
            customerId: user.id,
            email: user.email || undefined,
            fullName: user.user_metadata?.name || '고객',
            phoneNumber: '010-0000-0000',
          },
          redirectUrl: returnUrl,
          windowType,
          metadata: { customOrderId, userId: user.id, type: 'custom_order' },
          locale: 'KO_KR',
        };

        const isMobile = isMobileDevice();

        await PortOne.requestPayment(requestData, {
          onPaymentSuccess: async (result: any) => {
            // PC(IFRAME) 경로: 콜백에서 직접 검증. (모바일은 리턴 페이지가 처리)
            const confirmedPaymentId =
              result.paymentId || result.txId || result.tx_id || result.id || paymentId;
            const outcome = await verifyWithRetry(confirmedPaymentId);
            if (outcome === 'confirmed') {
              onConfirmed();
            } else if (outcome === 'pending') {
              setInfo(t('customOrders.detail.payPending'));
            } else {
              setError(t('customOrders.detail.payFailed'));
            }
            setProcessing(null);
          },
          onPaymentFail: (err: any) => {
            console.warn('[CustomOrderKoreanPay] 결제 실패:', err);
            // 모바일에서는 이 콜백이 실행되지 않을 수 있음(리다이렉트). PC만 여기서 처리.
            if (!isMobile) {
              setError(t('customOrders.detail.payFailed'));
              setProcessing(null);
            }
          },
        });

        // 모바일 REDIRECTION 은 위 호출에서 페이지가 이동하므로 이 지점에 도달하지 않음.
        // PC IFRAME 은 콜백에서 처리되므로 여기서 별도 처리 없음.
      } catch (e) {
        console.error('[CustomOrderKoreanPay] 결제 요청 오류:', e);
        setError(t('customOrders.detail.payFailed'));
        setProcessing(null);
      }
    },
    [user?.id, user?.email, user?.user_metadata?.name, processing, customOrderId, songTitle, amountKRW, onConfirmed, t, verifyWithRetry]
  );

  const openBankModal = () => {
    if (processing || bankTransferProcessing) return;
    setError(null);
    setInfo(null);
    setDepositorName('');
    setBankTransferSubmitted(false);
    setShowBankModal(true);
  };

  const closeBankModal = () => {
    if (bankTransferProcessing) return;
    setShowBankModal(false);
    setDepositorName('');
    setBankTransferSubmitted(false);
  };

  const handleBankTransferConfirm = async () => {
    if (!user?.id || bankTransferProcessing) return;

    const trimmedDepositorName = depositorName.trim();
    if (!trimmedDepositorName) {
      alert(t('customOrders.detail.payBankDepositorRequired'));
      return;
    }

    setBankTransferProcessing(true);
    setError(null);

    try {
      const message = [
        '[무통장 입금 신청]',
        `입금자명: ${trimmedDepositorName}`,
        `입금 금액: ${formatKRW(amountKRW)}`,
        `입금 계좌: 카카오뱅크 ${BANK_ACCOUNT_NUMBER} (예금주: ${BANK_ACCOUNT_HOLDER})`,
      ].join('\n');

      const { error: insertError } = await supabase.from('custom_order_messages').insert({
        custom_order_id: customOrderId,
        sender_id: user.id,
        sender_type: 'customer',
        message,
      });

      if (insertError) {
        throw insertError;
      }

      setBankTransferSubmitted(true);
      setInfo(t('customOrders.detail.payBankRequested'));
    } catch (e) {
      console.error('[CustomOrderKoreanPay] 무통장 입금 신청 오류:', e);
      setError(t('customOrders.detail.payBankFailed'));
      setShowBankModal(false);
    } finally {
      setBankTransferProcessing(false);
    }
  };

  return (
    <div className="space-y-3">
      {processing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-w-sm rounded-xl bg-white p-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            <p className="text-lg font-semibold text-gray-900">{t('customOrders.detail.payProcessing')}</p>
            <p className="mt-1 text-sm text-gray-600">{t('customOrders.detail.payDoNotClose')}</p>
          </div>
        </div>
      )}

      {info && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{info}</div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <button
        onClick={() => pay('card')}
        disabled={!!processing}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        <i className="ri-bank-card-line text-lg" />
        {t('customOrders.detail.payCard')}
      </button>
      <button
        onClick={() => pay('kakaopay')}
        disabled={!!processing || bankTransferProcessing}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#FEE500] py-3 text-sm font-semibold text-[#191600] hover:brightness-95 disabled:opacity-50"
      >
        <i className="ri-kakao-talk-fill text-lg" />
        {t('customOrders.detail.payKakao')}
      </button>

      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-blue-50/60 px-2 text-gray-500">{t('customOrders.detail.payOr')}</span>
        </div>
      </div>

      <button
        onClick={openBankModal}
        disabled={!!processing || bankTransferProcessing}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-green-600 bg-white py-3 text-sm font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
      >
        <i className="ri-bank-line text-lg" />
        {t('customOrders.detail.payBank')}
      </button>

      {showBankModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">{t('customOrders.detail.payBankTitle')}</h2>
            </div>

            <div className="space-y-5 px-5 py-6">
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{t('customOrders.detail.payAmount')}</span>
                  <span className="text-lg font-bold text-blue-600">{formatKRW(amountKRW)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">{t('customOrders.detail.payBankInfoTitle')}</h3>
                <div className="space-y-2 rounded-lg bg-gray-50 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{t('customOrders.detail.payBankName')}</span>
                    <span className="text-sm font-medium text-gray-900">카카오뱅크</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{t('customOrders.detail.payBankAccount')}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{BANK_ACCOUNT_NUMBER}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(BANK_ACCOUNT_NUMBER);
                          alert(t('customOrders.detail.payBankCopied'));
                        }}
                        className="text-blue-600 hover:text-blue-800"
                        title={t('customOrders.detail.payBankCopy')}
                      >
                        <i className="ri-file-copy-line" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{t('customOrders.detail.payBankHolder')}</span>
                    <span className="text-sm font-medium text-gray-900">{BANK_ACCOUNT_HOLDER}</span>
                  </div>
                </div>
              </div>

              {!bankTransferSubmitted ? (
                <>
                  <div className="space-y-2">
                    <label htmlFor="custom-order-depositor-name" className="block text-sm font-semibold text-gray-900">
                      {t('customOrders.detail.payBankDepositor')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="custom-order-depositor-name"
                      type="text"
                      value={depositorName}
                      onChange={(event) => setDepositorName(event.target.value)}
                      placeholder={t('customOrders.detail.payBankDepositorPlaceholder')}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500">{t('customOrders.detail.payBankDepositorNote')}</p>
                  </div>

                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
                    <div className="flex gap-2">
                      <i className="ri-information-line flex-shrink-0 text-lg text-yellow-600" />
                      <div className="space-y-1 text-xs text-gray-700">
                        <p>{t('customOrders.detail.payBankGuide1')}</p>
                        <p>{t('customOrders.detail.payBankGuide2')}</p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                  <div className="flex gap-2">
                    <i className="ri-checkbox-circle-line flex-shrink-0 text-lg text-green-600" />
                    <div className="text-sm text-gray-700">
                      <p className="mb-1 font-semibold text-green-900">{t('customOrders.detail.payBankRequested')}</p>
                      <p className="text-xs text-gray-600">{t('customOrders.detail.payBankGuide1')}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2 border-t border-gray-200 px-5 py-4">
              {bankTransferSubmitted ? (
                <button
                  type="button"
                  onClick={closeBankModal}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  {t('customOrders.detail.payBankClose')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={closeBankModal}
                    disabled={bankTransferProcessing}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    {t('customOrders.detail.payBankCancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleBankTransferConfirm()}
                    disabled={bankTransferProcessing}
                    className={`rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 ${
                      bankTransferProcessing ? 'cursor-not-allowed opacity-60' : ''
                    }`}
                  >
                    {bankTransferProcessing
                      ? t('customOrders.detail.payBankProcessing')
                      : t('customOrders.detail.payBankConfirm')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
