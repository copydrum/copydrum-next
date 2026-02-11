/**
 * 결제수단 타입
 * 
 * - bank_transfer: 무통장 입금 (한국 사이트 전용, 수동)
 * - paypal: PayPal 결제 (영문 사이트 전용)
 * - card: 신용카드 결제 (KG이니시스)
 * - kakaopay: 카카오페이
 * - virtual_account: 무통장입금 (가상계좌, KG이니시스)
 * - transfer: 실시간 계좌이체 (KG이니시스)
 * - cash: 보유 캐시로 결제
 */
export type PaymentMethod = 'card' | 'kakaopay' | 'bank_transfer' | 'virtual_account' | 'cash' | 'paypal' | 'transfer';

/**
 * 결제 제공자 타입
 * 
 * - portone: 포트원 (PayPal, 카드, 카카오페이)
 * - inicis: KG이니시스 (legacy, 현재 미사용)
 * - payaction: 페이액션 자동입금 확인 시스템 (legacy, 현재 미사용)
 * - cash: 보유 캐시
 * - manual: 관리자 수동 확인
 */
export type PaymentProvider = 'inicis' | 'payaction' | 'cash' | 'portone' | 'manual';

export type PaymentStatus = 'pending' | 'awaiting_deposit' | 'paid' | 'failed' | 'cancelled' | 'refunded';

export interface PaymentLineItem {
  sheetId?: string | null;
  title?: string | null;
  price: number;
  quantity?: number;
}

export interface VirtualAccountInfo {
  bankName?: string | null;
  accountNumber?: string | null;
  depositor?: string | null;
  expectedDepositor?: string | null;
  amount?: number | null;
  expiresAt?: string | null;
  message?: string | null;
  [key: string]: any;
}

export interface BasePaymentIntentRequest {
  userId: string;
  amount: number;
  description: string;
  orderId?: string;
  bonusAmount?: number;
  items?: PaymentLineItem[];
  metadata?: Record<string, unknown>;
}

export interface CardPaymentIntentRequest extends BasePaymentIntentRequest {
  method: 'card' | 'kakaopay';
  returnUrl: string;
  buyerName?: string | null;
  buyerEmail?: string | null;
  buyerTel?: string | null;
}

export interface VirtualAccountIntentRequest extends BasePaymentIntentRequest {
  method: 'bank_transfer' | 'virtual_account';
  depositorName: string;
  bankName?: string;
}

export interface CashPaymentIntentRequest extends BasePaymentIntentRequest {
  method: 'cash';
}

export type PaymentIntentRequest =
  | CardPaymentIntentRequest
  | VirtualAccountIntentRequest
  | CashPaymentIntentRequest;

export interface PaymentIntentResponse {
  paymentUrl?: string;
  paymentId?: string;
  transactionId?: string;
  expiresAt?: string | null;
  requestForm?: {
    action: string;
    method: 'POST' | 'GET';
    inputs: Record<string, string>;
  };
  virtualAccountInfo?: VirtualAccountInfo | null;
  additionalData?: Record<string, unknown>;
}

export interface PaymentApprovalPayload {
  orderId: string;
  paymentProvider: PaymentProvider;
  transactionId: string;
  amount: number;
  approvedAt?: string | null;
  rawResponse?: unknown;
}

export interface PaymentCancelPayload {
  orderId: string;
  paymentProvider: PaymentProvider;
  transactionId: string;
  reason?: string;
  rawResponse?: unknown;
}

export interface PaymentTransactionLog {
  orderId: string;
  userId: string;
  paymentMethod: PaymentMethod;
  paymentProvider: PaymentProvider;
  amount: number;
  status: PaymentStatus;
  pgTransactionId?: string | null;
  rawRequest?: unknown;
  rawResponse?: unknown;
}

