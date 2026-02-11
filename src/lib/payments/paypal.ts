import { supabase } from '../supabase';
import { formatPrice, DEFAULT_USD_RATE } from '../priceFormatter';
import { convertFromKrw, getSiteCurrency } from '../currency';
import type { PaymentIntentResponse } from './types';

interface EdgeResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code?: string;
    message: string;
    details?: unknown;
  };
}

const PAYPAL_INIT_FUNCTION = 'payments-paypal-init';
const PAYPAL_APPROVE_FUNCTION = 'payments-paypal-approve';

interface PayPalPaymentIntentRequest {
  userId: string;
  orderId: string;
  amount: number; // KRW amount
  description: string;
  buyerEmail?: string;
  buyerName?: string;
  returnUrl?: string;
  cancelUrl?: string;
  locale?: string; // 사이트 통화 변환에 사용
}

interface PayPalPaymentIntentResponse {
  orderId: string;
  paypalOrderId: string;
  approvalUrl?: string;
  clientId?: string;
}

interface PayPalApprovalPayload {
  orderId: string;
  paypalOrderId: string;
  payerId?: string;
}

const invokeEdgeFunction = async <T>(functionName: string, payload: unknown): Promise<T> => {
  const { data, error } = await supabase.functions.invoke<EdgeResponse<T>>(functionName, {
    body: payload,
  });

  // Edge Function 응답을 콘솔에 출력
  console.log(`[paypal] ${functionName} response:`, { data, error });

  if (error) {
    console.error(`[paypal] ${functionName} invoke error`, error);
    throw new Error(error.message ?? `PayPal Edge Function ${functionName} 호출 중 오류가 발생했습니다.`);
  }

  if (!data) {
    throw new Error(`PayPal Edge Function ${functionName}에서 응답을 받지 못했습니다.`);
  }

  if (!data.success) {
    const message =
      data.error?.message ??
      (typeof data.error === 'string' ? data.error : 'PayPal 결제 처리 중 오류가 발생했습니다.');
    console.error(`[paypal] ${functionName} failed:`, data.error);
    throw new Error(message);
  }

  return data.data as T;
};

// KRW를 사이트 통화(USD)로 변환 — 사이트 표시 가격과 동일한 환율 사용
export const convertKRWToSiteUSD = (amountKRW: number, locale?: string): number => {
  // currency.ts의 convertFromKrw 사용 (1000원=$1 표준, 1500원=$1 할인)
  const currency = getSiteCurrency(undefined, locale);
  const converted = convertFromKrw(amountKRW, currency === 'KRW' ? 'USD' : currency, locale);
  return Math.round(converted * 100) / 100; // round to cents
};

// PayPal 결제 Intent 생성
export const createPayPalPaymentIntent = async (
  payload: PayPalPaymentIntentRequest,
): Promise<PayPalPaymentIntentResponse> => {
  // 사이트 표시 가격과 동일한 환율로 KRW → USD 변환
  const usdAmount = convertKRWToSiteUSD(payload.amount, payload.locale);
  console.log('[PayPal] 금액 변환:', {
    amountKRW: payload.amount,
    locale: payload.locale,
    amountUSD: usdAmount,
  });

  const paypalPayload = {
    ...payload,
    amountUSD: usdAmount,
    amountKRW: payload.amount,
  };

  return invokeEdgeFunction<PayPalPaymentIntentResponse>(PAYPAL_INIT_FUNCTION, paypalPayload);
};

// PayPal 결제 승인
export const approvePayPalPayment = async (payload: PayPalApprovalPayload) => {
  const result = await invokeEdgeFunction<{ success: true; orderId: string; transactionId?: string; amount?: number }>(PAYPAL_APPROVE_FUNCTION, payload);
  return {
    success: true,
    orderId: result.orderId,
    transactionId: result.transactionId,
    amount: result.amount,
  };
};

// 로컬 개발 환경 여부 판별 (localhost, 127.0.0.1, 사설 IP)
const isLocalDevOrigin = (origin: string): boolean => {
  return (
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    /https?:\/\/192\.168\.\d{1,3}\.\d{1,3}/.test(origin) ||
    /https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(origin) ||
    /https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}/.test(origin)
  );
};

// PayPal returnUrl 생성
export const getPayPalReturnUrl = (): string => {
  if (typeof window === 'undefined') {
    return '';
  }

  const origin = window.location.origin;
  const returnPath = '/payments/paypal/return';

  let baseUrl = origin;
  // 프로덕션 환경에서만 HTTPS 강제 (로컬 개발 환경은 HTTP 유지)
  if (!baseUrl.startsWith('https://') && !isLocalDevOrigin(baseUrl)) {
    baseUrl = baseUrl.replace(/^https?:\/\//, 'https://');
  }

  return `${baseUrl}${returnPath}`;
};

// PayPal cancelUrl 생성
export const getPayPalCancelUrl = (): string => {
  if (typeof window === 'undefined') {
    return '';
  }

  const origin = window.location.origin;
  const cancelPath = '/payments/paypal/cancel';

  let baseUrl = origin;
  // 프로덕션 환경에서만 HTTPS 강제 (로컬 개발 환경은 HTTP 유지)
  if (!baseUrl.startsWith('https://') && !isLocalDevOrigin(baseUrl)) {
    baseUrl = baseUrl.replace(/^https?:\/\//, 'https://');
  }

  return `${baseUrl}${cancelPath}`;
};

