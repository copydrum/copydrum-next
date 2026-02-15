import { convertFromKrw } from '../../lib/currency';
import * as PortOne from '@portone/browser-sdk/v2';
import { isJapaneseSiteHost, isKoreanSiteHost } from '../../config/hostType';
import { DEFAULT_USD_RATE } from '../priceFormatter';
import { getLocaleFromHost } from '../../i18n/getLocaleFromHost';
import { supabase } from '../../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { isMobileDevice } from '../../utils/device';

// PortOne currency type
type PortOneCurrency = 'CURRENCY_KRW' | 'CURRENCY_USD' | 'CURRENCY_JPY';

// Convert our currency format to PortOne format
function toPortOneCurrency(currency: 'KRW' | 'USD' | 'JPY'): PortOneCurrency {
  switch (currency) {
    case 'USD':
      return 'CURRENCY_USD';
    case 'JPY':
      return 'CURRENCY_JPY';
    default:
      return 'CURRENCY_KRW';
  }
}

// PortOne V2 SDK만 사용 (V1 IMP 레거시 완전 제거)

// KRW를 USD로 변환 (PayPal은 USD 사용)
export const convertKRWToUSD = (amountKRW: number): number => {
  const usdAmount = amountKRW * DEFAULT_USD_RATE;
  // 소수점 2자리로 반올림 (센트 단위)
  return Math.round(usdAmount * 100) / 100;
};

// V1 legacy (window.IMP, ensurePortOneLoaded, initPortOne) 완전 제거됨
// 모든 결제는 @portone/browser-sdk/v2의 PortOne.requestPayment() 사용

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

// 포트원 returnUrl 생성 헬퍼
export const getPortOneReturnUrl = (): string => {
  if (typeof window === 'undefined') {
    return '';
  }

  const origin = window.location.origin;
  const returnPath = '/payments/portone-paypal/return';

  let baseUrl = origin;
  // 프로덕션 환경에서만 HTTPS 강제 (로컬 개발 환경은 HTTP 유지)
  if (!baseUrl.startsWith('https://') && !isLocalDevOrigin(baseUrl)) {
    baseUrl = baseUrl.replace(/^https?:\/\//, 'https://');
  }

  return `${baseUrl}${returnPath}`;
};

// PayPal 결제 요청
export interface RequestPayPalPaymentParams {
  userId: string; // 사용자 ID (필수)
  amount: number; // KRW 금액
  orderId: string; // 주문 ID (merchant_uid로 사용)
  buyerEmail?: string;
  buyerName?: string;
  buyerTel?: string;
  description: string; // 상품명
  returnUrl?: string; // 결제 완료 후 리다이렉트 URL
  elementId?: string; // PayPal SPB 렌더링을 위한 컨테이너 ID
  onSuccess?: (response: any) => void; // SPB 결제 성공 콜백
  onError?: (error: any) => void; // SPB 결제 실패 콜백
}

export interface RequestPayPalPaymentResult {
  success: boolean;
  imp_uid?: string;
  merchant_uid?: string;
  paid_amount?: number;
  error_code?: string;
  error_msg?: string;
  paymentId?: string; // PortOne paymentId (transaction_id로 사용)
}

// ============================================================
// 🟢 PayPal 결제 요청 함수 (PortOne V2 SDK - PAYPAL_SPB 방식)
// 
// ⚠️ 핵심 연동 원칙 (포트원 페이팔 연동 문서 준수):
//   - loadPaymentUI + uiType: 'PAYPAL_SPB' 사용 (requestPayment 아님!)
//   - windowType: 생략 또는 PC/모바일 모두 'UI' (POPUP/REDIRECT 불가!)
//   - redirectUrl: 무시됨 (PayPal은 항상 팝업 → 콜백 처리)
//   - payMethod: 생략 (PayPal이 자동 처리)
//   - portone-ui-container 클래스를 가진 DOM 요소에 PayPal 버튼 렌더링
//
// 주의: 메인 결제 플로우는 PayPalPaymentButton.tsx에서 직접 처리합니다.
//       이 함수는 cashCharge.ts, productPurchase.ts 등 레거시 호출용입니다.
// ============================================================
export const requestPayPalPayment = async (
  params: RequestPayPalPaymentParams,
): Promise<RequestPayPalPaymentResult> => {
  if (typeof window === 'undefined') {
    return {
      success: false,
      error_msg: 'PayPal은 브라우저 환경에서만 사용할 수 있습니다.',
    };
  }

  console.log('[portone-paypal] PayPal 결제 요청 (PortOne V2 SDK)', {
    orderId: params.orderId,
    amount: params.amount,
  });

  const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID || 'store-21731740-b1df-492c-832a-8f38448d0ebd';
  const channelKey = 'channel-key-541220df-bf9f-4cb1-b189-679210076fe0'; // paypal_v2 실연동 채널키

  if (!storeId || !channelKey) {
    console.error('[portone-paypal] 환경변수 설정 오류', { storeId, channelKey });
    return {
      success: false,
      error_msg: 'PayPal 결제 설정이 올바르지 않습니다.',
    };
  }

  try {
    const hostname = window.location.hostname;
    const locale = getLocaleFromHost(window.location.host);

    // 통화 결정 (일본: JPY, 그 외: USD)
    const isJapanSite = locale === 'ja' || isJapaneseSiteHost(hostname);
    const paypalCurrency: 'USD' | 'JPY' = isJapanSite ? 'JPY' : 'USD';

    // 금액 변환 (KRW → USD/JPY, scale factor 적용)
    const convertedAmount = convertFromKrw(params.amount, paypalCurrency);
    const portOneCurrency = toPortOneCurrency(paypalCurrency);

    let finalAmount: number;
    if (paypalCurrency === 'USD') {
      finalAmount = Math.round(Number(convertedAmount.toFixed(2)) * 100); // 센트 단위
    } else {
      finalAmount = Math.round(convertedAmount); // 엔 단위
    }

    // 결제 고유 ID 생성
    const newPaymentId = `pay_${uuidv4()}`;

    // DB에 transaction_id 미리 저장 (웹훅 대비)
    console.log('[portone-paypal] transaction_id 저장:', {
      orderId: params.orderId,
      paymentId: newPaymentId,
    });

    const { error: updateError } = await supabase
      .from('orders')
      .update({ transaction_id: newPaymentId })
      .eq('id', params.orderId);

    if (updateError) {
      console.error('[portone-paypal] DB 업데이트 실패 (계속 진행):', updateError);
    }

    // PortOne loadPaymentUI 요청 데이터
    // ⚠️ PayPal은 windowType, redirectUrl, payMethod를 사용하지 않음
    const requestData: any = {
      uiType: 'PAYPAL_SPB',
      storeId,
      channelKey,
      paymentId: newPaymentId,
      orderName: params.description,
      totalAmount: finalAmount,
      currency: portOneCurrency,
      customer: {
        customerId: params.userId ?? undefined,
        email: params.buyerEmail ?? undefined,
        fullName: params.buyerName ?? undefined,
      },
      metadata: {
        supabaseOrderId: params.orderId,
      },
    };

    console.log('[portone-paypal] loadPaymentUI 호출:', requestData);

    // PortOne SDK가 portone-ui-container 클래스를 가진 DOM 요소에
    // PayPal 결제 버튼을 렌더링합니다.
    await PortOne.loadPaymentUI(requestData, {
      onPaymentSuccess: async (paymentResult: any) => {
        console.log('[portone-paypal] ✅ onPaymentSuccess', paymentResult);

        const confirmedPaymentId =
          paymentResult.paymentId ||
          paymentResult.txId ||
          paymentResult.tx_id ||
          newPaymentId;

        // DB에 최종 transaction_id 업데이트
        await supabase
          .from('orders')
          .update({ transaction_id: confirmedPaymentId })
          .eq('id', params.orderId);

        if (params.onSuccess) {
          params.onSuccess(paymentResult);
        }
      },
      onPaymentFail: (error: any) => {
        console.error('[portone-paypal] ❌ onPaymentFail', error);
        if (params.onError) {
          params.onError(error);
        }
      },
    });

    return {
      success: true,
      merchant_uid: params.orderId,
      paymentId: newPaymentId,
      error_msg: 'PayPal 버튼이 로드되었습니다.',
    };
  } catch (error) {
    console.error('[portone-paypal] PayPal 결제 요청 오류:', error);
    return {
      success: false,
      error_msg: error instanceof Error ? error.message : 'PayPal 결제 요청 중 오류가 발생했습니다.',
    };
  }
};

// 카카오페이 결제 요청
export interface RequestKakaoPayPaymentParams {
  userId: string; // 사용자 ID (필수)
  amount: number; // KRW 금액 (이미 KRW 정수 금액, 변환 불필요)
  orderId: string; // 주문 ID (merchant_uid로 사용)
  orderNumber?: string | null; // 주문번호 (metadata에 추가)
  buyerEmail?: string;
  buyerName?: string;
  buyerTel?: string;
  description: string; // 상품명
  returnUrl?: string; // 결제 완료 후 리다이렉트 URL
  onSuccess?: (response: any) => void; // 결제 성공 콜백
  onError?: (error: any) => void; // 결제 실패 콜백
}

export interface RequestKakaoPayPaymentResult {
  success: boolean;
  imp_uid?: string;
  merchant_uid?: string;
  paid_amount?: number;
  error_code?: string;
  error_msg?: string;
  paymentId?: string; // PortOne paymentId (transaction_id로 사용)
}

// 카카오페이 결제 요청 함수
export const requestKakaoPayPayment = async (
  params: RequestKakaoPayPaymentParams,
): Promise<RequestKakaoPayPaymentResult> => {
  // 한국어 사이트에서만 동작
  if (typeof window === 'undefined') {
    return {
      success: false,
      error_msg: 'KakaoPay는 브라우저 환경에서만 사용할 수 있습니다.',
    };
  }

  const hostname = window.location.hostname;
  const isKoreanSite = isKoreanSiteHost(hostname);

  if (!isKoreanSite) {
    console.warn('[portone-kakaopay] 한국어 사이트가 아닙니다.', { hostname });
    return {
      success: false,
      error_msg: 'KakaoPay is only available on the Korean site.',
    };
  }

  console.log('[portone-kakaopay] KakaoPay 결제 요청 시작', {
    orderId: params.orderId,
    amount: params.amount,
    customer: {
      userId: params.userId,
      email: params.buyerEmail,
      name: params.buyerName,
      tel: params.buyerTel,
    },
  });

  const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID || 'store-21731740-b1df-492c-832a-8f38448d0ebd';
  const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_KAKAOPAY || 'channel-key-bdbeb668-e452-413b-a039-150013d1f3ae';

  if (!storeId || !channelKey) {
    console.error('[portone-kakaopay] 환경변수 설정 오류', { storeId, channelKey });
    return {
      success: false,
      error_msg: 'KakaoPay 결제 설정이 올바르지 않습니다.',
    };
  }

  try {
    // 리턴 URL 설정 (기존 PortOne PayPal return URL 재사용)
    const returnUrl = params.returnUrl || getPortOneReturnUrl();

    // 카카오페이 결제 시 paymentId는 항상 새로운 UUID로 생성
    // orderId는 내부 주문 식별용, paymentId는 PG 결제 식별용으로 분리
    // 이렇게 하면 같은 주문으로 재결제 시도 시에도 중복 오류가 발생하지 않음
    const newPaymentId = `pay_${uuidv4()}`;

    // 모바일 디바이스 감지
    const isMobile = isMobileDevice();

    // 🟢 redirectUrl 확인 (REDIRECT 방식 필수 파라미터)
    if (!returnUrl) {
      console.error('[portone-kakaopay] ❌ redirectUrl이 없습니다! REDIRECT 방식 사용 불가');
      return {
        success: false,
        error_msg: '결제 리다이렉트 URL이 설정되지 않았습니다.',
      };
    }
    console.log('[portone-kakaopay] redirectUrl 확인:', returnUrl);

    // 🟢 windowType은 객체 형태로 설정 (V2 SDK 요구사항)
    // 카카오페이: 모바일은 REDIRECTION, PC는 IFRAME
    const windowType = {
      pc: 'IFRAME',
      mobile: 'REDIRECTION',
    };

    // PortOne V2 문서에 따르면 카카오페이는 requestPayment를 사용해야 함
    // loadPaymentUI는 UI 타입이 필요한데, 카카오페이는 일반결제를 지원하지 않음
    // 참고: https://developers.portone.io/opi/ko/integration/pg/v2/kakaopay?v=v2
    const requestData: any = {
      storeId,
      channelKey,
      paymentId: newPaymentId, // 항상 새로운 UUID 사용 (orderId와 분리)
      // ✅ Supabase 주문과 연결하기 위한 orderId 설정 (웹훅에서 주문 찾기용)
      orderId: params.orderId, // Supabase orders.id를 PortOne에 전달
      orderName: params.description,
      totalAmount: params.amount, // KRW 정수 금액 그대로 사용
      currency: 'CURRENCY_KRW' as const, // 카카오페이는 원화 결제만 지원
      payMethod: 'EASY_PAY' as const, // 간편결제 타입 (카카오페이 필수) - 문자열로 전달
      customer: {
        customerId: params.userId ?? undefined,
        email: params.buyerEmail ?? undefined,
        fullName: params.buyerName ?? undefined,
        phoneNumber: params.buyerTel ?? undefined,
      },
      redirectUrl: returnUrl, // 🟢 리다이렉트 URL 필수 (REDIRECT 방식 필수)
      windowType: windowType, // 🟢 객체 형태로 전달 (V2 SDK 요구사항)
      // ✅ 나중에 Webhook / REST 조회에서 다시 확인할 수 있도록 metadata에도 기록
      metadata: {
        supabaseOrderId: params.orderId, // Supabase orders.id
        supabaseOrderNumber: params.orderNumber || null, // Supabase orders.order_number
        // 필요시 추가 메타데이터도 포함 가능
      },
      locale: 'KO_KR', // 카카오페이는 KO_KR만 지원
    };

    // 주문에 transaction_id(paymentId) 저장 (결제 요청 전에 미리 저장)
    // orderId는 내부 주문 식별용, transaction_id는 PG 결제 식별용
    // 카카오페이는 결제 완료 후 리다이렉트가 일어날 수 있으므로, 미리 저장하는 것이 중요
    console.log('[portone-kakaopay] 결제 요청 전 transaction_id 저장 시도', {
      orderId: params.orderId,
      paymentId: newPaymentId,
    });

    const { data: updateData, error: updateError } = await supabase
      .from('orders')
      .update({ transaction_id: newPaymentId })
      .eq('id', params.orderId)
      .select('id, transaction_id')
      .single();

    if (updateError) {
      console.error('[portone-kakaopay] 주문 transaction_id 업데이트 실패:', {
        orderId: params.orderId,
        paymentId: newPaymentId,
        error: updateError,
      });
      // transaction_id 업데이트 실패해도 결제는 계속 진행 (onPaymentSuccess에서 재시도)
    } else {
      console.log('[portone-kakaopay] 주문 transaction_id 저장 성공 (결제 요청 전)', {
        orderId: params.orderId,
        paymentId: newPaymentId,
        updatedOrder: updateData,
      });
    }

    // 디버그 로그: requestData의 주요 필드 확인
    console.log('[portone-kakaopay] requestPayment requestData', {
      orderId: params.orderId, // 내부 주문 ID
      paymentId: newPaymentId, // PG 결제 식별 ID (transaction_id로 저장됨)
      storeId: requestData.storeId,
      channelKey: requestData.channelKey ? requestData.channelKey.substring(0, 20) + '...' : undefined,
      orderName: requestData.orderName,
      totalAmount: requestData.totalAmount,
      currency: requestData.currency,
      payMethod: requestData.payMethod, // 'EASY_PAY' (문자열) 확인
      windowType: requestData.windowType, // 객체 형태 확인
      locale: requestData.locale, // 'KO_KR' 확인
      redirectUrl: requestData.redirectUrl,
    });

    // 포트원 V2 SDK로 카카오페이 결제 요청 (requestPayment 사용)
    await PortOne.requestPayment(requestData, {
      onPaymentSuccess: async (paymentResult: any) => {
        console.log('[portone-kakaopay] onPaymentSuccess 전체 응답', JSON.stringify(paymentResult, null, 2));

        // 결제 성공 시 orders.transaction_id 업데이트 (확실히 보장)
        // PortOne paymentId를 orders.transaction_id에 저장하여 웹훅에서 주문을 찾을 수 있도록 함
        // paymentResult에서 paymentId 또는 txId 추출
        // PortOne V2 SDK 응답 구조에 따라 다양한 필드명을 시도
        const portonePaymentId = paymentResult.paymentId ||
          paymentResult.txId ||
          paymentResult.tx_id ||
          paymentResult.id ||
          paymentResult.payment_id ||
          newPaymentId; // fallback to requestData의 paymentId

        console.log('[portone-kakaopay] paymentResult에서 추출한 paymentId', {
          paymentId: portonePaymentId,
          paymentResultKeys: Object.keys(paymentResult || {}),
          fallbackUsed: portonePaymentId === newPaymentId,
        });

        if (portonePaymentId && params.orderId) {
          try {
            console.log('[portone-kakaopay] onPaymentSuccess에서 orders.transaction_id 업데이트 시도', {
              orderId: params.orderId,
              paymentId: portonePaymentId,
              note: '결제 요청 전에도 저장했지만, onPaymentSuccess에서도 확실히 업데이트',
            });

            const { data: updateData, error: updateError } = await supabase
              .from('orders')
              .update({ transaction_id: portonePaymentId })
              .eq('id', params.orderId)
              .select('id, transaction_id, payment_status')
              .single();

            if (updateError) {
              console.error('[portone-kakaopay] onPaymentSuccess에서 orders.transaction_id 업데이트 실패:', {
                orderId: params.orderId,
                paymentId: portonePaymentId,
                error: updateError,
              });
              // transaction_id 업데이트 실패해도 결제는 계속 진행 (웹훅에서 처리 가능)
            } else {
              console.log('[portone-kakaopay] onPaymentSuccess에서 orders.transaction_id 업데이트 성공', {
                orderId: params.orderId,
                paymentId: portonePaymentId,
                updatedOrder: updateData,
                note: '이제 웹훅에서 transaction_id로 주문을 찾을 수 있음',
              });
            }
          } catch (error) {
            console.error('[portone-kakaopay] onPaymentSuccess에서 orders.transaction_id 업데이트 중 오류:', {
              orderId: params.orderId,
              paymentId: portonePaymentId,
              error,
            });
            // 오류가 발생해도 결제는 계속 진행
          }
        } else {
          console.warn('[portone-kakaopay] onPaymentSuccess에서 transaction_id 업데이트 건너뜀', {
            orderId: params.orderId,
            paymentId: portonePaymentId,
            reason: !portonePaymentId ? 'paymentId 없음' : 'orderId 없음',
          });
        }

        // 사용자 정의 성공 콜백 호출
        // ⚠️ PC(IFRAME) 모드에서는 onSuccess 콜백이 직접 네비게이션을 처리하므로
        //    여기서 추가 리다이렉트를 하면 경쟁 조건(race condition)이 발생합니다.
        //    모바일(REDIRECTION) 모드에서는 이 콜백이 실행되지 않으므로 문제 없음.
        if (params.onSuccess) {
          params.onSuccess(paymentResult);
        }
      },
      onPaymentFail: (error: any) => {
        console.error('[portone-kakaopay] onPaymentFail', error);
        if (params.onError) {
          params.onError(error);
        }
      },
    });

    return {
      success: true,
      merchant_uid: params.orderId,
      paymentId: newPaymentId, // PG 결제 식별 ID 반환 (transaction_id)
      error_msg: 'KakaoPay 결제창이 열렸습니다.',
    };
  } catch (error) {
    console.error('[portone-kakaopay] KakaoPay 결제 요청 오류', error);
    return {
      success: false,
      error_msg: error instanceof Error ? error.message : 'KakaoPay 결제 요청 중 오류가 발생했습니다.',
    };
  }
};

export interface RequestInicisPaymentParams {
  userId: string;
  amount: number;
  orderId: string;
  orderNumber?: string | null;
  buyerEmail?: string;
  buyerName?: string;
  buyerTel?: string;
  description: string;
  payMethod: 'CARD' | 'VIRTUAL_ACCOUNT' | 'TRANSFER';
  returnUrl?: string;
  onSuccess?: (response: any) => void;
  onError?: (error: any) => void;
}

export interface RequestInicisPaymentResult {
  success: boolean;
  paymentId?: string;
  error_msg?: string;
  virtualAccountInfo?: any;
}

export const requestInicisPayment = async (
  params: RequestInicisPaymentParams,
): Promise<RequestInicisPaymentResult> => {
  if (typeof window === 'undefined') {
    return { success: false, error_msg: '브라우저 환경에서만 가능합니다.' };
  }

  const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID;
  const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_INICIS;

  if (!storeId || !channelKey) {
    console.error('[portone-inicis] 환경변수 누락');
    return { success: false, error_msg: 'KG이니시스 설정 오류 (환경변수 확인 필요)' };
  }

  try {
    const returnUrl = params.returnUrl || window.location.origin + '/payments/portone/return';
    const newPaymentId = `pay_${uuidv4()}`; // 결제 고유번호 생성

    // KG이니시스 PC는 IFRAME 필수
    const windowType = { pc: 'IFRAME', mobile: 'REDIRECTION' };

    let portOnePayMethod = 'CARD';
    if (params.payMethod === 'VIRTUAL_ACCOUNT') portOnePayMethod = 'VIRTUAL_ACCOUNT';
    else if (params.payMethod === 'TRANSFER') portOnePayMethod = 'TRANSFER';

    const requestData: any = {
      storeId,
      channelKey,
      paymentId: newPaymentId,
      orderId: params.orderId,
      orderName: params.description,
      totalAmount: params.amount,
      currency: 'CURRENCY_KRW',
      payMethod: portOnePayMethod,
      customer: {
        customerId: params.userId,
        email: params.buyerEmail,
        fullName: params.buyerName || '고객',
        phoneNumber: params.buyerTel || '010-0000-0000',
      },
      redirectUrl: returnUrl,
      windowType,
      metadata: { supabaseOrderId: params.orderId },
      locale: 'KO_KR',
    };

    if (portOnePayMethod === 'VIRTUAL_ACCOUNT') {
      requestData.virtualAccount = {
        accountExpiry: { validHours: 24 },
        cashReceiptType: 'ANONYMOUS',
      };
    }

    // 결제 전 DB에 transaction_id 저장
    await supabase.from('orders').update({ transaction_id: newPaymentId }).eq('id', params.orderId);

    console.log('[portone-inicis] 결제 요청 시작:', requestData);

    await PortOne.requestPayment(requestData, {
      onPaymentSuccess: async (paymentResult: any) => {
        console.log('[portone-inicis] SDK 결제 성공 응답:', paymentResult);

        // ✅ [핵심 해결책] 결제 성공 직후, 우리 서버(Edge Function)를 직접 호출해서 데이터를 받아옵니다.
        // 기다릴 필요도, DB를 뒤질 필요도 없습니다. 서버가 바로 답을 줍니다.
        let serverVaInfo = null;

        if (params.payMethod === 'VIRTUAL_ACCOUNT') {
          try {
            console.log('[portone-inicis] 서버에 계좌정보 요청 중...');

            const { data: confirmData, error: confirmError } = await supabase.functions.invoke('portone-payment-confirm', {
              body: { paymentId: newPaymentId, orderId: params.orderId }
            });

            if (confirmError) {
              console.error('[portone-inicis] 서버 요청 실패:', confirmError);
            } else if (confirmData?.data?.virtualAccountInfo) {
              console.log('[portone-inicis] ✨ 서버에서 계좌정보 수신 성공!', confirmData.data.virtualAccountInfo);
              serverVaInfo = confirmData.data.virtualAccountInfo;
            } else {
              console.log('[portone-inicis] 서버 응답에 계좌정보 없음:', confirmData);
            }
          } catch (e) {
            console.error('[portone-inicis] 서버 통신 중 에러:', e);
          }
        }

        // 받아온 정보를 담아서 useBuyNow로 전달
        if (params.onSuccess) {
          params.onSuccess({
            ...paymentResult,
            paymentId: newPaymentId,
            virtualAccountInfo: serverVaInfo // 👈 여기에 서버에서 받은 확실한 정보가 들어갑니다!
          });
        }

        if (params.payMethod !== 'VIRTUAL_ACCOUNT' && returnUrl) {
          setTimeout(() => window.location.href = returnUrl, 500);
        }
      },
      onPaymentFail: (error: any) => {
        console.error('[portone-inicis] 결제 실패:', error);
        if (params.onError) params.onError(error);
      },
    });

    return { success: true, paymentId: newPaymentId };
  } catch (error) {
    console.error(error);
    return { success: false, error_msg: '결제 요청 중 오류 발생' };
  }
};



// PortOne V2 카드 결제용 인터페이스
export interface PortOnePaymentArgs {
  userId?: string; // 사용자 ID (customer.customerId용)
  amount: number; // KRW 금액
  orderId: string; // 주문 ID
  description: string; // 상품명
  buyerEmail?: string;
  buyerName?: string;
  buyerTel?: string;
  returnUrl?: string; // 결제 완료 후 리다이렉트 URL
  payMethod?: 'CARD' | 'TRANSFER' | 'VIRTUAL_ACCOUNT'; // V2 결제 방식
}

export interface PortOnePaymentResult {
  success: boolean;
  paymentId?: string; // V2 결제 고유번호
  imp_uid?: string; // V1 호환 (paymentId 매핑)
  merchant_uid?: string;
  paid_amount?: number;
  error_code?: string;
  error_msg?: string;
}

// PortOne V2 카드 결제 요청 함수
// @portone/browser-sdk/v2의 PortOne.requestPayment() 사용
export async function requestPortonePayment(args: PortOnePaymentArgs): Promise<PortOnePaymentResult> {
  if (typeof window === 'undefined') {
    return { success: false, error_msg: '브라우저 환경에서만 결제 가능합니다.' };
  }

  // V2 환경 변수 사용 (STORE_ID + CHANNEL_KEY)
  const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID;
  const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_INICIS;

  if (!storeId || !channelKey) {
    console.error('[portone-v2] 환경변수 누락', { storeId: !!storeId, channelKey: !!channelKey });
    return {
      success: false,
      error_msg: 'PortOne V2 설정이 올바르지 않습니다. NEXT_PUBLIC_PORTONE_STORE_ID / NEXT_PUBLIC_PORTONE_CHANNEL_KEY_INICIS 환경변수를 확인하세요.',
    };
  }

  try {
    const returnUrl =
      args.returnUrl ||
      `${window.location.origin}/payments/portone/return`;

    const newPaymentId = `pay_${uuidv4()}`;

    // V2 결제 방식 매핑
    const portOnePayMethod = args.payMethod || 'CARD';

    // KG이니시스: PC는 IFRAME, 모바일은 REDIRECTION
    const windowType = { pc: 'IFRAME', mobile: 'REDIRECTION' };

    const requestData: any = {
      storeId,
      channelKey,
      paymentId: newPaymentId,
      orderId: args.orderId,
      orderName: args.description,
      totalAmount: args.amount,
      currency: 'CURRENCY_KRW',
      payMethod: portOnePayMethod,
      customer: {
        customerId: args.userId ?? undefined,
        email: args.buyerEmail ?? undefined,
        fullName: args.buyerName || '고객',
        phoneNumber: args.buyerTel || '010-0000-0000', // 휴대폰 번호 미수집 → 기본값
      },
      redirectUrl: returnUrl,
      windowType,
      metadata: { supabaseOrderId: args.orderId },
      locale: 'KO_KR',
    };

    // 결제 전 DB에 transaction_id 저장
    if (args.orderId) {
      await supabase.from('orders').update({ transaction_id: newPaymentId }).eq('id', args.orderId);
    }

    // 모바일 REDIRECTION 대비: sessionStorage에 orderId와 paymentId 저장
    // (모바일에서는 페이지가 리다이렉트되므로 onPaymentSuccess 콜백이 실행되지 않음)
    if (typeof window !== 'undefined' && args.orderId) {
      sessionStorage.setItem('portone_order_id', args.orderId);
      sessionStorage.setItem('portone_payment_id', newPaymentId);
      sessionStorage.setItem('portone_payment_method', portOnePayMethod === 'CARD' ? 'card' : portOnePayMethod.toLowerCase());
      console.log('[portone-v2] sessionStorage에 주문 정보 저장 (모바일 리다이렉트 대비):', {
        orderId: args.orderId,
        paymentId: newPaymentId,
      });
    }

    console.log('[portone-v2] 카드 결제 요청 시작:', {
      storeId,
      channelKey: channelKey.substring(0, 20) + '...',
      paymentId: newPaymentId,
      orderId: args.orderId,
      amount: args.amount,
      payMethod: portOnePayMethod,
    });

    // V2 SDK로 결제 요청
    return new Promise<PortOnePaymentResult>((resolve) => {
      PortOne.requestPayment(requestData, {
        onPaymentSuccess: async (paymentResult: any) => {
          console.log('[portone-v2] 카드 결제 성공:', paymentResult);

          resolve({
            success: true,
            paymentId: newPaymentId,
            imp_uid: newPaymentId, // V1 호환 필드 (paymentId를 매핑)
            merchant_uid: args.orderId,
            paid_amount: args.amount,
          });
        },
        onPaymentFail: (error: any) => {
          console.error('[portone-v2] 카드 결제 실패:', error);

          resolve({
            success: false,
            error_code: error?.code,
            error_msg: error?.message || '카드 결제에 실패했습니다.',
          });
        },
      });
    });
  } catch (error) {
    console.error('[portone-v2] 결제 요청 중 예외:', error);
    return {
      success: false,
      error_msg: error instanceof Error ? error.message : '결제 요청 중 예상치 못한 오류가 발생했습니다.',
    };
  }
}
