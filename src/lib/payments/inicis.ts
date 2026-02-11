/**
 * legacy: KG이니시스 직접 연동 라이브러리
 * 
 * 현재는 포트원으로 전환 예정이며, 카드 결제는 포트원 심사 진행 중입니다.
 * 나중에 KG이니시스를 다시 사용할 경우를 대비해 코드는 유지합니다.
 * 
 * @deprecated 현재 미사용 - 포트원으로 전환 예정
 */
import { supabase } from '../supabase';
import type {
  CardPaymentIntentRequest,
  PaymentApprovalPayload,
  PaymentCancelPayload,
  PaymentIntentResponse,
} from './types';

interface EdgeResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code?: string;
    message: string;
    details?: unknown;
  };
}

const INIT_FUNCTION = 'payments-inicis-init';
const APPROVE_FUNCTION = 'payments-inicis-approve';
const CANCEL_FUNCTION = 'payments-inicis-cancel';
const RETURN_FUNCTION = 'payments-inicis-return';
const INICIS_SCRIPT_URL = 'https://stdpay.inicis.com/stdjs/INIStdPay.js';

// KG이니시스 returnUrl 생성 (GET 파라미터 방식 사용)
// 관리자 콘솔에서 GET 전달 방식 활성화 시, GET 파라미터로 자동 전달됨
export const getInicisReturnUrl = (): string => {
  if (typeof window === 'undefined') {
    return '';
  }
  
  // HTTPS로 클라이언트 페이지 URL 생성
  const origin = window.location.origin;
  const returnPath = '/payments/inicis/return';
  
  // HTTPS 강제 설정
  let baseUrl = origin;
  if (!baseUrl.startsWith('https://')) {
    // HTTP인 경우 HTTPS로 변환
    baseUrl = baseUrl.replace(/^https?:\/\//, 'https://');
  }
  
  return `${baseUrl}${returnPath}`;
};

// KG이니시스 closeUrl 생성 (HTTPS 강제)
export const getInicisCloseUrl = (): string => {
  if (typeof window === 'undefined') {
    return '';
  }
  
  // HTTPS로 클라이언트 페이지 URL 생성
  const origin = window.location.origin;
  const closePath = '/payments/inicis/close';
  
  // HTTPS 강제 설정
  let baseUrl = origin;
  if (!baseUrl.startsWith('https://')) {
    // HTTP인 경우 HTTPS로 변환
    baseUrl = baseUrl.replace(/^https?:\/\//, 'https://');
  }
  
  return `${baseUrl}${closePath}`;
};

const invokeEdgeFunction = async <T>(functionName: string, payload: unknown): Promise<T> => {
  const { data, error } = await supabase.functions.invoke<EdgeResponse<T>>(functionName, {
    body: payload,
  });

  if (error) {
    console.error(`[payments] ${functionName} invoke error`, error);
    throw new Error(error.message ?? `Edge Function ${functionName} 호출 중 오류가 발생했습니다.`);
  }

  if (!data) {
    throw new Error(`Edge Function ${functionName}에서 응답을 받지 못했습니다.`);
  }

  if (!data.success) {
    const message =
      data.error?.message ??
      (typeof data.error === 'string' ? data.error : '결제 처리 중 오류가 발생했습니다.');
    throw new Error(message);
  }

  return data.data as T;
};

export const createInicisPaymentIntent = async (
  payload: CardPaymentIntentRequest,
): Promise<PaymentIntentResponse> => {
  return invokeEdgeFunction<PaymentIntentResponse>(INIT_FUNCTION, payload);
};

export const approveInicisPayment = async (payload: PaymentApprovalPayload & {
  authToken?: string;
  idcName?: string;
  authUrl?: string;
}) => {
  return invokeEdgeFunction<{ success: true; data?: any }>(APPROVE_FUNCTION, payload);
};

export const cancelInicisPayment = async (payload: PaymentCancelPayload) => {
  return invokeEdgeFunction<{ success: true }>(CANCEL_FUNCTION, payload);
};

declare global {
  interface Window {
    INIStdPay?: unknown;
  }
}

let inicisScriptPromise: Promise<void> | null = null;

export const ensureInicisSdkLoaded = async () => {
  if (typeof window === 'undefined') {
    return;
  }

  if (window.INIStdPay) {
    return;
  }

  if (inicisScriptPromise) {
    return inicisScriptPromise;
  }

  inicisScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${INICIS_SCRIPT_URL}"]`,
    );

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('KG이니시스 스크립트 로드 실패')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = INICIS_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('KG이니시스 스크립트를 불러오지 못했습니다.'));
    document.head.appendChild(script);
  });

  return inicisScriptPromise;
};

export const submitInicisPaymentForm = (formConfig: PaymentIntentResponse['requestForm']) => {
  if (!formConfig) {
    throw new Error('KG이니시스 결제 요청 정보가 없습니다.');
  }

  const form = document.createElement('form');
  form.method = formConfig.method ?? 'POST';
  form.action = formConfig.action;
  form.style.display = 'none';
  form.id = `iniStdPayForm-${Date.now()}`;

  Object.entries(formConfig.inputs ?? {}).forEach(([key, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = key;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);

  const inicis = window.INIStdPay as { pay?: (formId: string) => void } | undefined;
  if (inicis && typeof inicis.pay === 'function') {
    inicis.pay(form.id);
  } else {
    form.submit();
  }

  document.body.removeChild(form);
};

