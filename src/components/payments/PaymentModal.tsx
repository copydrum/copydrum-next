'use client';

import { useEffect, useState, useRef } from 'react';
import { requestKakaoPayPayment } from '@/lib/payments/portone';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  amount: number;
  orderName: string;
  userEmail?: string;
  userName?: string;
  userId: string;
  userCredits: number;
  onSuccess: (method: string) => void;
}

// DODO SDK 타입 정의
declare global {
  interface Window {
    Dodo?: any;
  }
}

export default function PaymentModal({
  isOpen,
  onClose,
  orderId,
  amount,
  orderName,
  userEmail,
  userName,
  userId,
  userCredits,
  onSuccess,
}: PaymentModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<'dodo' | 'kakaopay' | 'point' | null>(null);
  const [loading, setLoading] = useState(false);
  const [sdkLoading, setSdkLoading] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const dodoContainerRef = useRef<HTMLDivElement>(null);

  // DODO SDK 로드
  useEffect(() => {
    if (!isOpen) return;

    const loadDodoSDK = async () => {
      // 이미 로드되어 있으면 스킵
      if (window.Dodo) {
        setSdkReady(true);
        return;
      }

      setSdkLoading(true);

      try {
        // DODO SDK 스크립트 로드
        const script = document.createElement('script');
        script.src = 'https://js.dodopayments.com/v1';
        script.async = true;

        script.onload = () => {
          console.log('[DODO] SDK 로드 완료');
          setSdkReady(true);
          setSdkLoading(false);
        };

        script.onerror = () => {
          console.error('[DODO] SDK 로드 실패');
          setSdkLoading(false);
        };

        document.head.appendChild(script);
      } catch (error) {
        console.error('[DODO] SDK 로드 오류:', error);
        setSdkLoading(false);
      }
    };

    loadDodoSDK();
  }, [isOpen]);

  // DODO Payments 결제 처리
  const handleDodoPayment = async () => {
    if (!sdkReady || !window.Dodo) {
      alert('결제 시스템을 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    setLoading(true);

    try {
      // 1. 서버에 결제 세션 생성 요청
      const response = await fetch('/api/payments/dodo/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          amount,
          orderName,
          customerEmail: userEmail,
          customerName: userName,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'DODO Payments 결제 생성 실패');
      }

      // 2. DODO SDK로 결제 진행
      const publishableKey = process.env.NEXT_PUBLIC_DODO_PAYMENTS_PUBLISHABLE_KEY;

      if (!publishableKey) {
        // Publishable Key가 없으면 리다이렉트 방식 사용
        if (result.payment_url) {
          window.location.href = result.payment_url;
          return;
        }
        throw new Error('결제 URL을 받지 못했습니다.');
      }

      // Embedded 방식으로 모달 내에서 결제
      const dodo = window.Dodo(publishableKey);

      await dodo.checkout({
        sessionId: result.payment_id,
        elementId: '#dodo-checkout-container',
        onSuccess: () => {
          console.log('[DODO] 결제 성공');
          onSuccess('dodo');
          onClose();
        },
        onCancel: () => {
          console.log('[DODO] 결제 취소');
          setLoading(false);
        },
        onError: (error: any) => {
          console.error('[DODO] 결제 오류:', error);
          alert('결제 중 오류가 발생했습니다.');
          setLoading(false);
        },
      });
    } catch (error) {
      console.error('[DODO] 결제 처리 오류:', error);
      alert(error instanceof Error ? error.message : 'DODO Payments 결제 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  // 카카오페이 결제 처리
  const handleKakaoPayPayment = async () => {
    setLoading(true);

    try {
      const returnUrl = `${window.location.origin}/payment/success?orderId=${orderId}`;

      const result = await requestKakaoPayPayment({
        userId,
        amount,
        orderId,
        orderNumber: null,
        buyerEmail: userEmail,
        buyerName: userName,
        description: orderName,
        returnUrl,
        onSuccess: async (paymentResult) => {
          console.log('[KakaoPay] 결제 성공:', paymentResult);
          onSuccess('kakaopay');
          onClose();
        },
        onError: (error) => {
          console.error('[KakaoPay] 결제 실패:', error);
          alert('카카오페이 결제에 실패했습니다.');
          setLoading(false);
        },
      });

      if (!result.success) {
        alert(result.error_msg || '카카오페이 결제 요청에 실패했습니다.');
        setLoading(false);
      }
    } catch (error) {
      console.error('[KakaoPay] 결제 오류:', error);
      alert('카카오페이 결제 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  // 포인트 결제 처리
  const handlePointPayment = async () => {
    if (userCredits < amount) {
      alert(`포인트가 부족합니다. (보유: ${userCredits.toLocaleString()}원, 필요: ${amount.toLocaleString()}원)`);
      return;
    }

    const confirmed = window.confirm(
      `${amount.toLocaleString()}원을 포인트로 결제하시겠습니까?\n` +
      `결제 후 잔액: ${(userCredits - amount).toLocaleString()}원`
    );

    if (!confirmed) return;

    setLoading(true);

    try {
      const response = await fetch('/api/payments/point/deduct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          orderId,
          amount,
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert('포인트 결제가 완료되었습니다!');
        onSuccess('point');
        onClose();
      } else {
        alert(result.error || '포인트 결제에 실패했습니다.');
        setLoading(false);
      }
    } catch (error) {
      console.error('[Point] 결제 오류:', error);
      alert('포인트 결제 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  // 결제 실행
  const handlePayment = () => {
    if (!selectedMethod) {
      alert('결제 수단을 선택해주세요.');
      return;
    }

    switch (selectedMethod) {
      case 'dodo':
        handleDodoPayment();
        break;
      case 'kakaopay':
        handleKakaoPayPayment();
        break;
      case 'point':
        handlePointPayment();
        break;
    }
  };

  if (!isOpen) return null;

  const canUsePoints = userCredits >= amount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl">
        {/* 헤더 */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-2xl font-bold text-gray-900">결제 수단 선택</h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <i className="ri-close-line text-3xl"></i>
          </button>
        </div>

        {/* SDK 로딩 중 */}
        {sdkLoading && (
          <div className="px-6 py-8">
            <div className="flex flex-col items-center justify-center gap-4">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"></div>
              <p className="text-gray-600 font-medium">결제 시스템을 불러오는 중...</p>
              <p className="text-sm text-gray-500">잠시만 기다려주세요.</p>
            </div>
          </div>
        )}

        {/* 본문 */}
        {!sdkLoading && (
          <div className="px-6 py-6">
            {/* 주문 정보 */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">주문명</span>
                <span className="font-medium text-gray-900">{orderName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">결제 금액</span>
                <span className="text-xl font-bold text-blue-600">{amount.toLocaleString()}원</span>
              </div>
            </div>

            {/* DODO Payments가 선택된 경우 Checkout Container */}
            {selectedMethod === 'dodo' && (
              <div className="mb-6">
                <div
                  id="dodo-checkout-container"
                  ref={dodoContainerRef}
                  className="min-h-[300px] border border-gray-200 rounded-lg p-4"
                ></div>
              </div>
            )}

            {/* 결제 수단 선택 (DODO가 선택되지 않았을 때만 표시) */}
            {selectedMethod !== 'dodo' && (
              <div className="space-y-3 mb-6">
                <h3 className="font-semibold text-gray-900 mb-3">결제 수단을 선택하세요</h3>

                {/* DODO Payments - 글로벌 결제 */}
                <label
                  className={`flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all ${
                    selectedMethod === 'dodo'
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="dodo"
                    checked={selectedMethod === 'dodo'}
                    onChange={() => setSelectedMethod('dodo')}
                    className="w-5 h-5 text-blue-600"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">신용/체크카드, 계좌이체</p>
                    <p className="text-sm text-gray-600">글로벌 결제 수단 (카드, 계좌이체 등)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <i className="ri-bank-card-line text-2xl text-blue-600"></i>
                    <i className="ri-wallet-3-line text-2xl text-green-600"></i>
                  </div>
                </label>

                {/* 카카오페이 - 한국 전용 */}
                <label
                  className={`flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all ${
                    selectedMethod === 'kakaopay'
                      ? 'border-yellow-400 bg-yellow-50'
                      : 'border-gray-200 hover:border-yellow-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="kakaopay"
                    checked={selectedMethod === 'kakaopay'}
                    onChange={() => setSelectedMethod('kakaopay')}
                    className="w-5 h-5 text-yellow-500"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">카카오페이</p>
                    <p className="text-sm text-gray-600">카카오페이로 간편 결제</p>
                  </div>
                  <img src="/kakao.svg" alt="Kakao Pay" className="h-8" />
                </label>

                {/* 포인트 결제 */}
                <label
                  className={`flex items-center gap-4 p-4 border-2 rounded-xl transition-all ${
                    canUsePoints
                      ? selectedMethod === 'point'
                        ? 'border-purple-600 bg-purple-50 cursor-pointer'
                        : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50 cursor-pointer'
                      : 'border-gray-200 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="point"
                    checked={selectedMethod === 'point'}
                    onChange={() => setSelectedMethod('point')}
                    disabled={!canUsePoints}
                    className="w-5 h-5 text-purple-600"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">포인트 결제</p>
                    <p className="text-sm text-gray-600">
                      보유 포인트:{' '}
                      <span className={canUsePoints ? 'text-purple-600 font-semibold' : 'text-red-600'}>
                        {userCredits.toLocaleString()}원
                      </span>
                    </p>
                    {!canUsePoints && (
                      <p className="text-xs text-red-600 mt-1">포인트가 부족합니다</p>
                    )}
                  </div>
                  <i className="ri-coin-line text-3xl text-purple-600"></i>
                </label>
              </div>
            )}

            {/* 안내 메시지 */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex gap-3">
                <i className="ri-information-line text-blue-600 text-xl flex-shrink-0"></i>
                <div className="flex-1">
                  <p className="text-sm text-blue-900 font-medium mb-1">안전한 결제</p>
                  <p className="text-xs text-blue-800">
                    모든 결제는 안전하게 암호화되어 처리됩니다. 결제 정보는 저장되지 않습니다.
                  </p>
                </div>
              </div>
            </div>

            {/* 결제 버튼 */}
            {selectedMethod !== 'dodo' && (
              <button
                onClick={handlePayment}
                disabled={!selectedMethod || loading || (selectedMethod === 'point' && !canUsePoints)}
                className="w-full bg-blue-600 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    결제 처리 중...
                  </>
                ) : (
                  <>
                    <i className="ri-lock-line"></i>
                    {amount.toLocaleString()}원 결제하기
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
