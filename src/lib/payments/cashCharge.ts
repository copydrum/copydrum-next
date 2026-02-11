import { createPendingOrder } from './orderUtils';
import {
  createInicisPaymentIntent,
  ensureInicisSdkLoaded,
  submitInicisPaymentForm,
  getInicisReturnUrl,
} from './inicis';
import { requestPayPalPayment, requestKakaoPayPayment } from './portone';
import type { PaymentIntentResponse, PaymentStatus, VirtualAccountInfo } from './types';
import { updateOrderPaymentStatus } from './paymentService';

type SupportedChargeMethod = 'card' | 'bank_transfer' | 'paypal' | 'kakaopay';

interface StartCashChargeParams {
  userId: string;
  amount: number;
  bonusAmount?: number;
  paymentMethod: SupportedChargeMethod;
  description: string;
  buyerName?: string | null;
  buyerEmail?: string | null;
  buyerTel?: string | null;
  depositorName?: string;
  returnUrl?: string;
  elementId?: string; // PayPal SPB 렌더링을 위한 컨테이너 ID
}

interface StartCashChargeResult {
  orderId: string;
  orderNumber: string | null;
  amount: number;
  paymentMethod: SupportedChargeMethod;
  paymentIntent?: PaymentIntentResponse;
  virtualAccountInfo?: VirtualAccountInfo | null;
}

const mapToPaymentStatus = (method: SupportedChargeMethod): PaymentStatus =>
  method === 'bank_transfer' ? 'awaiting_deposit' : 'pending';

export const startCashCharge = async ({
  userId,
  amount,
  bonusAmount = 0,
  paymentMethod,
  description,
  buyerName,
  buyerEmail,
  buyerTel,
  depositorName,
  returnUrl,
  elementId,
}: StartCashChargeParams): Promise<StartCashChargeResult> => {
  const trimmedDepositorName = depositorName?.trim();

  const { orderId, orderNumber } = await createPendingOrder({
    userId,
    amount,
    paymentMethod,
    description,
    paymentStatus: mapToPaymentStatus(paymentMethod),
    metadata: {
      type: 'cash_charge',
      bonusAmount,
    },
    orderType: 'cash', // 주문 타입 추가
    depositorName: trimmedDepositorName, // 입금자명 전달
  });

  if (paymentMethod === 'bank_transfer') {
    // 페이액션 연동 제거, 간단한 무통장 입금 처리
    // depositor_name 추가 - 입금자명 저장
    // depositorName이 전달되었고 빈 문자열이 아닐 때 저장
    if (depositorName !== undefined && depositorName !== null && trimmedDepositorName) {
      console.log('[startCashCharge] 입금자명 저장:', { depositorName, trimmedDepositorName, orderId });
      await updateOrderPaymentStatus(orderId, 'awaiting_deposit', {
        depositorName: trimmedDepositorName,
      });
    } else {
      console.warn('[startCashCharge] 입금자명이 저장되지 않음:', { depositorName, trimmedDepositorName, orderId });
    }

    // 고정 계좌 정보 반환
    const bankInfo: VirtualAccountInfo = {
      bankName: '카카오뱅크',
      accountNumber: '3333-15-0302437',
      accountHolder: '강만수',
      amount,
      depositor: '강만수',
      expectedDepositor: trimmedDepositorName ?? undefined,
      expiresAt: null, // 무기한
    };

    return {
      orderId,
      orderNumber,
      amount,
      paymentMethod,
      virtualAccountInfo: bankInfo,
    };
  }

  if (paymentMethod === 'paypal') {
    // 직접 PayPal API를 통한 결제 처리 (PortOne 미사용)
    try {
      const result = await requestPayPalPayment({
        userId,
        amount,
        orderId,
        buyerEmail: buyerEmail ?? undefined,
        buyerName: buyerName ?? undefined,
        buyerTel: buyerTel ?? undefined,
        description,
        returnUrl: returnUrl, // returnUrl이 없으면 requestPayPalPayment 내부에서 자동 생성
        elementId, // PayPal SPB 렌더링을 위한 컨테이너 ID 전달
      });

      if (result.success) {
        // PayPal 승인 URL로 리다이렉트됨 (또는 SPB 버튼 렌더링 완료)
        // 실제 결제 완료는 리다이렉트 페이지(/payments/paypal/return)에서 처리
        return {
          orderId,
          orderNumber,
          amount,
          paymentMethod,
        };
      } else {
        // 결제 실패
        throw new Error(result.error_msg || 'PayPal 결제가 실패했습니다.');
      }
    } catch (error) {
      console.error('[cashCharge] PayPal 결제 오류', error);
      throw error;
    }
  }

  if (paymentMethod === 'kakaopay') {
    // PortOne V2 SDK를 통한 카카오페이 결제 처리
    try {
      const result = await requestKakaoPayPayment({
        userId,
        amount,
        orderId,
        buyerEmail: buyerEmail ?? undefined,
        buyerName: buyerName ?? undefined,
        buyerTel: buyerTel ?? undefined,
        description,
        returnUrl: returnUrl,
        onSuccess: (response) => {
          console.log('[cashCharge] KakaoPay 결제 성공 콜백', response);
        },
        onError: (error) => {
          console.error('[cashCharge] KakaoPay 결제 실패 콜백', error);
        },
      });

      if (result.success) {
        // 카카오페이 결제창이 열림
        // 실제 결제 완료는 Webhook 또는 return 페이지에서 처리
        return {
          orderId,
          orderNumber,
          amount,
          paymentMethod,
        };
      } else {
        // 결제 실패
        throw new Error(result.error_msg || 'KakaoPay 결제가 실패했습니다.');
      }
    } catch (error) {
      console.error('[cashCharge] KakaoPay 결제 오류', error);
      throw error;
    }
  }

  // 카드 결제
  // returnUrl이 지정되지 않으면 클라이언트 페이지 URL 사용 (GET 파라미터 방식)
  // KG이니시스 관리자 콘솔에서 GET 전달 방식 활성화 필요
  const finalReturnUrl = returnUrl || getInicisReturnUrl();

  const intent = await createInicisPaymentIntent({
    userId,
    amount,
    description,
    method: 'card',
    orderId,
    bonusAmount,
    returnUrl: finalReturnUrl,
    buyerName: buyerName ?? undefined,
    buyerEmail: buyerEmail ?? undefined,
    buyerTel: buyerTel ?? undefined,
  });

  if (intent.requestForm) {
    // 주문 ID를 sessionStorage에 저장 (결제 반환 페이지에서 사용)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('inicis_order_id', orderId);
    }

    await ensureInicisSdkLoaded();
    submitInicisPaymentForm(intent.requestForm);
  }

  return {
    orderId,
    orderNumber,
    amount,
    paymentMethod,
    paymentIntent: intent,
  };
};

