import { supabase } from '../supabase';
import {
  approveInicisPayment,
  cancelInicisPayment,
  createInicisPaymentIntent,
} from './inicis';
import {
  cancelPayactionVirtualAccount,
  createPayactionVirtualAccount,
} from './payaction';
import type {
  CardPaymentIntentRequest,
  PaymentApprovalPayload,
  PaymentCancelPayload,
  PaymentIntentRequest,
  PaymentIntentResponse,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  PaymentTransactionLog,
  VirtualAccountInfo,
  VirtualAccountIntentRequest,
} from './types';

type OrderPaymentUpdateOptions = {
  status?: string;
  transactionId?: string | null;
  paymentConfirmedAt?: string | null;
  depositorName?: string | null;
  virtualAccountInfo?: VirtualAccountInfo | null;
};

const isCardPaymentPayload = (
  payload: PaymentIntentRequest,
): payload is CardPaymentIntentRequest => payload.method === 'card' || payload.method === 'kakaopay';

const isVirtualAccountPayload = (
  payload: PaymentIntentRequest,
): payload is VirtualAccountIntentRequest =>
  payload.method === 'bank_transfer' || payload.method === 'virtual_account';

export const createPaymentIntent = async (
  payload: PaymentIntentRequest,
): Promise<PaymentIntentResponse> => {
  if (isCardPaymentPayload(payload)) {
    return createInicisPaymentIntent(payload);
  }

  // legacy: PayAction 가상계좌는 현재 미사용 (관리자 수동 입금 확인으로 대체)
  if (isVirtualAccountPayload(payload)) {
    // return createPayactionVirtualAccount(payload);
    throw new Error('가상계좌 결제는 현재 사용할 수 없습니다. 무통장 입금을 사용해주세요.');
  }

  return {
    paymentUrl: undefined,
    transactionId: undefined,
  };
};

export const approvePayment = async (payload: PaymentApprovalPayload) => {
  switch (payload.paymentProvider) {
    case 'inicis':
      return approveInicisPayment(payload);
    // legacy: PayAction은 현재 미사용 (관리자 수동 입금 확인으로 대체)
    case 'payaction':
      return { success: true };
    case 'cash':
    default:
      return { success: true };
  }
};

export const cancelPayment = async (payload: PaymentCancelPayload) => {
  switch (payload.paymentProvider) {
    case 'inicis':
      return cancelInicisPayment(payload);
    // legacy: PayAction은 현재 미사용
    case 'payaction':
      // return cancelPayactionVirtualAccount(payload);
      return { success: true };
    case 'cash':
    default:
      return { success: true };
  }
};

export const logPaymentTransaction = async (log: PaymentTransactionLog) => {
  const { error } = await supabase.from('payment_transactions').insert({
    order_id: log.orderId,
    user_id: log.userId,
    payment_method: log.paymentMethod,
    payment_provider: log.paymentProvider,
    amount: log.amount,
    status: log.status,
    pg_transaction_id: log.pgTransactionId ?? null,
    raw_request: log.rawRequest ?? null,
    raw_response: log.rawResponse ?? null,
  });

  if (error) {
    console.error('[payments] 결제 로그 저장 실패', error);
    throw new Error('결제 기록 저장에 실패했습니다.');
  }
};

export const updateOrderPaymentStatus = async (
  orderId: string,
  paymentStatus: PaymentStatus,
  options: OrderPaymentUpdateOptions = {},
) => {
  const payload: Record<string, unknown> = {
    payment_status: paymentStatus,
  };

  if (options.status) {
    payload.status = options.status;
  }

  if (options.transactionId !== undefined) {
    payload.transaction_id = options.transactionId;
  }

  if (options.paymentConfirmedAt !== undefined) {
    payload.payment_confirmed_at = options.paymentConfirmedAt;
  }

  // depositor_name 추가
  if (options.depositorName !== undefined) {
    payload.depositor_name = options.depositorName;
  }

  if (options.virtualAccountInfo !== undefined) {
    payload.virtual_account_info = options.virtualAccountInfo;
  }

  const { error } = await supabase.from('orders').update(payload).eq('id', orderId);

  if (error) {
    console.error('[payments] 주문 결제 상태 업데이트 실패', error);
    throw new Error('주문 결제 상태 업데이트에 실패했습니다.');
  }
};

export const normalizePaymentMethodLabel = (method: PaymentMethod | null | undefined) => {
  if (!method) return '미지정';
  const normalized = method.toLowerCase() as PaymentMethod;
  const labelMap: Record<PaymentMethod, string> = {
    card: '카드 결제',
    kakaopay: '카카오페이',
    bank_transfer: '계좌 이체',
    virtual_account: '가상계좌',
    cash: '보유 캐시',
  };
  return labelMap[normalized] ?? method;
};

export const normalizePaymentStatusLabel = (status: PaymentStatus | null | undefined) => {
  if (!status) return '미정';
  const labelMap: Record<PaymentStatus, string> = {
    pending: '결제 대기',
    awaiting_deposit: '입금 대기',
    paid: '결제 완료',
    failed: '결제 실패',
    cancelled: '취소됨',
    refunded: '환불 완료',
  };
  return labelMap[status] ?? status;
};








