'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import * as PortOne from '@portone/browser-sdk/v2';
import { v4 as uuidv4 } from 'uuid';
import { convertFromKrw } from '@/lib/currency';
import { getLocaleFromHost } from '@/i18n/getLocaleFromHost';
import { isJapaneseSiteHost } from '@/config/hostType';
import type { CheckoutItem } from './OnePageCheckout';


interface PayPalPaymentButtonProps {
  orderId: string;
  amount: number; // KRW 금액
  items: CheckoutItem[];
  onSuccess: (paymentId: string, dbOrderId?: string) => void;
  onError: (error: Error) => void;
  onProcessing: () => void;
  compact?: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PayPal/PortOne 결제 실패 사유 분류
// → 원문 영어 에러를 사용자 친화적 메시지로 변환하고, 재시도 가능 여부를 판별
//
// 분석 근거(최근 1개월 결제내역):
//   - "Payer has not yet approved" (승인 미완료): 승인 단계 미완료 → 버튼 재클릭으로 회복 가능
//   - "instrument ... declined" (카드 거절): 발급사 거절 → 다른 수단 안내
//   - 사용자 취소: 단순 재시도 안내
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export type PayPalFailCategory =
  | 'not_approved'
  | 'instrument_declined'
  | 'user_cancel'
  | 'generic';

export function classifyPayPalFailure(rawMessage: string): PayPalFailCategory {
  const msg = (rawMessage || '').toLowerCase();
  if (
    msg.includes('not yet approved') ||
    msg.includes('has not yet approved') ||
    (msg.includes('rel') && msg.includes('approve'))
  ) {
    return 'not_approved';
  }
  if (msg.includes('declined by the processor') || msg.includes('instrument presented') || msg.includes('declined')) {
    return 'instrument_declined';
  }
  if (
    msg.includes('취소') ||
    msg.includes('cancel') ||
    msg.includes('popup') ||
    msg.includes('closed') ||
    msg.includes('user_close') ||
    msg.includes('window closed')
  ) {
    return 'user_cancel';
  }
  return 'generic';
}

export default function PayPalPaymentButton({
  orderId,
  amount,
  items,
  onSuccess,
  onError,
  onProcessing,
  compact,
}: PayPalPaymentButtonProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failCategory, setFailCategory] = useState<PayPalFailCategory | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const user = useAuthStore((state) => state.user);
  const paymentIdRef = useRef<string>('');
  const loadedRef = useRef(false);
  const dbOrderIdRef = useRef<string>(orderId);
  const isProcessingRef = useRef(false); // 중복 결제 방지

  // 실패 사유 → 사용자 친화적 안내 메시지 (i18n, 기본값 한국어)
  const friendlyMessageFor = useCallback(
    (category: PayPalFailCategory): string => {
      switch (category) {
        case 'not_approved':
          return t(
            'checkout.paypalError.notApproved',
            'PayPal 승인이 완료되지 않았습니다. 아래 버튼을 다시 눌러 PayPal 창에서 결제 승인까지 완료해 주세요.',
          );
        case 'instrument_declined':
          return t(
            'checkout.paypalError.declined',
            '카드사에서 결제가 거절되었습니다. 다른 카드 또는 PayPal 잔액으로 다시 시도해 주세요.',
          );
        case 'user_cancel':
          return t(
            'checkout.paypalError.cancelled',
            '결제가 취소되었습니다. 다시 결제하시려면 아래 버튼을 눌러 주세요.',
          );
        default:
          return t(
            'checkout.paypalError.generic',
            '결제를 완료하지 못했습니다. 잠시 후 아래 버튼을 다시 눌러 시도해 주세요.',
          );
      }
    },
    [t],
  );

  // 결제 실패 모니터링 비콘 (4순위) — 실패해도 결제 흐름에 영향 주지 않도록 fire-and-forget
  const reportPaymentFailure = useCallback(
    (payload: {
      category: PayPalFailCategory;
      rawMessage: string;
      code?: string;
      paymentId?: string;
      orderId?: string;
      amount?: number;
    }) => {
      try {
        const body = JSON.stringify({
          provider: 'paypal',
          ...payload,
          path: typeof window !== 'undefined' ? window.location.pathname : undefined,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        });
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
          navigator.sendBeacon('/api/payments/failure-log', new Blob([body], { type: 'application/json' }));
        } else {
          fetch('/api/payments/failure-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
          }).catch(() => {});
        }
      } catch (e) {
        console.warn('[PayPal-SDK] 실패 로그 전송 실패(무시):', e);
      }
    },
    [],
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🟢 PortOne V2 SDK PayPal SPB 방식으로 결제 버튼 렌더링
  // - 참고: 포트원 페이팔 연동 문서
  // - loadPaymentUI로 PayPal 버튼을 portone-ui-container에 렌더링
  // - 사용자가 PayPal 버튼 클릭 → 팝업 → 콜백으로 결과 처리
  //
  // ⚠️ [주문 생성 시점] KG이니시스/카카오페이와 동일하게
  //    결제 직전(버튼 렌더링 전)에 DB 주문을 생성합니다.
  //    → /api/orders/create API에 Upsert 로직이 적용되어
  //      동일 유저+동일 아이템+동일 금액의 pending 주문은 재활용됨
  //    → 체크아웃 페이지를 여러 번 재진입해도 pending 주문이 중복 생성되지 않음
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const loadPayPalButton = useCallback(async () => {
    if (!user?.id || !orderId || !amount || loadedRef.current) return;
    if (typeof window === 'undefined') return;

    loadedRef.current = true;
    setLoading(true);
    setError(null);
    setFailCategory(null);

    try {
      const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID!;
      const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_PAYPAL!;

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 1단계: DB에 주문 생성 (Upsert - 기존 pending 주문 재활용)
      // → KG이니시스/카카오페이와 동일하게 결제 전에 주문 생성
      // → /api/orders/create에서 동일 조건 pending 주문은 재활용하므로
      //   페이지 재진입 시 중복 생성 없음
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      let dbOrderId = orderId;
      try {
        const orderDescription = items.length === 1
          ? items[0].title
          : `${items[0].title} 외 ${items.length - 1}건`;

        const createResponse = await fetch('/api/orders/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            items: items.map((item) => ({
              sheetId: item.sheet_id,
              title: item.title,
              price: item.price,
            })),
            amount,
            description: orderDescription,
            paymentMethod: 'paypal',
          }),
        });

        const createResult = await createResponse.json();

        if (createResult.success && createResult.orderId) {
          dbOrderId = createResult.orderId;
          dbOrderIdRef.current = dbOrderId;
          console.log('[PayPal-SDK] ✅ DB 주문 생성/재활용 완료:', {
            dbOrderId,
            orderNumber: createResult.orderNumber,
            reused: createResult.reused,
          });

          // 동일 상품의 기존 결제가 이미 PAID — 재결제·새 주문 없이 성공 화면으로
          if (createResult.alreadyPaid) {
            console.warn('[PayPal-SDK] 동일 상품 기존 결제가 이미 완료됨 — 성공 화면으로 이동');
            onSuccess('', dbOrderId);
            return;
          }
        } else {
          console.warn('[PayPal-SDK] ⚠️ 주문 생성 실패, 기존 orderId 사용:', createResult.error);
        }
      } catch (createErr) {
        console.warn('[PayPal-SDK] ⚠️ 주문 생성 중 오류, 기존 orderId 사용:', createErr);
      }

      // ─── 결제 고유 ID 생성 ───
      const newPaymentId = `pay_${uuidv4()}`;
      paymentIdRef.current = newPaymentId;

      // ─── 결제 시작 전 transaction_id 선저장 ───
      // 카드(KG이니시스)/카카오페이와 동일하게, PayPal 결제창을 띄우기 전에
      // orders.transaction_id를 미리 채워 둔다.
      // → 고객이 결제 후 success/verify에 도달하지 못해도(탭 종료·새로고침 등),
      //   PortOne 웹훅과 결제 재조정 cron이 transaction_id로 이 주문을 찾아
      //   자동 완료할 수 있다. (재조정 cron은 transaction_id가 있는 주문만 대상)
      try {
        const { error: preTxError } = await supabase
          .from('orders')
          .update({ transaction_id: newPaymentId })
          .eq('id', dbOrderId);
        if (preTxError) {
          console.warn('[PayPal-SDK] ⚠️ transaction_id 선저장 실패 (계속 진행):', preTxError);
        } else {
          console.log('[PayPal-SDK] ✅ transaction_id 선저장 완료:', {
            dbOrderId,
            paymentId: newPaymentId,
          });
        }
      } catch (preTxErr) {
        console.warn('[PayPal-SDK] ⚠️ transaction_id 선저장 중 예외 (계속 진행):', preTxErr);
      }

      // ─── 통화 결정 (일본 사이트: JPY, 그 외: USD) ───
      const hostname = window.location.hostname;
      const locale = getLocaleFromHost(window.location.host);
      const isJapanSite = locale === 'ja' || isJapaneseSiteHost(hostname);
      const paypalCurrency = isJapanSite ? 'JPY' : 'USD';

      // ─── 금액 변환 (KRW → USD/JPY) ───
      // 포트원 문서: currency별 scale factor 적용
      // USD: scale factor 2 → 1.50달러 = 150 전달
      // JPY: scale factor 0 → 100엔 = 100 전달
      const convertedAmount = convertFromKrw(amount, paypalCurrency);
      let finalAmount: number;
      if (paypalCurrency === 'USD') {
        finalAmount = Math.round(Number(convertedAmount.toFixed(2)) * 100);
      } else {
        finalAmount = Math.round(convertedAmount);
      }
      const portOneCurrency = paypalCurrency === 'USD' ? 'CURRENCY_USD' : 'CURRENCY_JPY';

      console.log('[PayPal-SDK] 금액 변환:', {
        originalKRW: amount,
        convertedAmount,
        finalAmount,
        currency: portOneCurrency,
      });

      // ─── 상품명 생성 ───
      const description = items.length === 1
        ? items[0].title
        : `${items[0].title} 외 ${items.length - 1}건`;

      // ─── PortOne loadPaymentUI 호출 ───
      // ⚠️ PayPal 연동 핵심 사항:
      //   - uiType: 'PAYPAL_SPB' 필수
      //   - payMethod: 생략 (PayPal은 자동)
      //   - windowType: 생략 또는 { pc: 'UI', mobile: 'UI' } (POPUP/REDIRECT 사용 불가!)
      //   - redirectUrl: 무시됨 (PayPal은 항상 팝업 → 콜백 처리)
      const requestData: any = {
        uiType: 'PAYPAL_SPB',
        storeId,
        channelKey,
        paymentId: newPaymentId,
        orderName: description,
        totalAmount: finalAmount,
        currency: portOneCurrency,
        customer: {
          customerId: user.id,
          email: user.email || undefined,
          fullName: user.user_metadata?.name || undefined,
        },
        metadata: {
          clientOrderId: dbOrderId,   // DB에 생성된 실제 주문 ID
          supabaseOrderId: dbOrderId, // 중복 저장 (웹훅 대비)
          userId: user.id,
        },
      };

      console.log('[PayPal-SDK] loadPaymentUI 호출 (DB 주문 생성 완료):', requestData);

      // PortOne SDK가 portone-ui-container 클래스를 가진 DOM 요소를 찾아
      // PayPal 결제 버튼을 렌더링합니다.
      await PortOne.loadPaymentUI(requestData, {
        // ━━━ 결제 성공 콜백 ━━━
        onPaymentSuccess: async (paymentResult: any) => {
          // paymentId 추출 (SDK 응답 구조에 따라 다양한 필드명 시도)
          const confirmedPaymentId =
            paymentResult.paymentId ||
            paymentResult.txId ||
            paymentResult.tx_id ||
            paymentResult.id ||
            newPaymentId;

          // 중복 결제 방지
          if (isProcessingRef.current) {
            console.warn('[PayPal-SDK] ⚠️ 이미 처리 중인 결제입니다. 중복 호출 무시:', confirmedPaymentId);
            return;
          }

          isProcessingRef.current = true;
          setIsProcessing(true);
          onProcessing();

          console.log('[PayPal-SDK] ✅ onPaymentSuccess', JSON.stringify(paymentResult, null, 2));
          console.log('[PayPal-SDK] 확인된 paymentId:', confirmedPaymentId);

          try {
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 서버 측 결제 검증 (재시도 로직 포함)
            // → PayPal은 결제 완료 직후 PortOne 상태가 PAY_PENDING일 수 있음
            //   (PayPal 자체 위험분석 / 환전 처리 등으로 PAID 전환에 10~120초 소요 가능)
            // → 충분히 재시도하여 PAID 전환을 기다림
            // → 그래도 PENDING이면 success 페이지에서 추가 폴링 + 웹훅으로 자동 완료
            // → KG이니시스/카카오페이는 즉시 PAID → 재시도 불필요
            //
            // 📊 재시도 스케줄 (점진적 백오프, 총 ~75초 대기):
            //    1차:  2초 후
            //    2차:  3초 후 (누적 5초)
            //    3차:  3초 후 (누적 8초)
            //    4차:  5초 후 (누적 13초)
            //    5차:  5초 후 (누적 18초)
            //    6차:  7초 후 (누적 25초)
            //    7차:  10초 후 (누적 35초)
            //    8차:  10초 후 (누적 45초)
            //    9차:  15초 후 (누적 60초)
            //   10차:  15초 후 (누적 75초)
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            const finalOrderId = dbOrderIdRef.current || orderId;
            console.log('[PayPal-SDK] 사용할 orderId:', finalOrderId);

            let verifySuccess = false;
            const RETRY_SCHEDULE_MS = [2000, 3000, 3000, 5000, 5000, 7000, 10000, 10000, 15000, 15000];
            const MAX_RETRIES = RETRY_SCHEDULE_MS.length;

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
              try {
                console.log(`[PayPal-SDK] 서버 검증 시도 ${attempt}/${MAX_RETRIES}...`);

                const verifyResponse = await fetch('/api/payments/portone/verify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    paymentId: confirmedPaymentId,
                    orderId: finalOrderId,
                    paymentMethod: 'paypal',
                  }),
                });

                const verifyResult = await verifyResponse.json();

                if (verifyResponse.ok && verifyResult.success) {
                  // ✅ 결제 검증 성공 → 주문 completed
                  console.log('[PayPal-SDK] ✅ 서버 검증 성공 (주문 completed):', verifyResult);
                  verifySuccess = true;
                  // transaction_id 소유 주문이 클라이언트 orderId와 다를 수 있음
                  if (verifyResult.order?.id) {
                    dbOrderIdRef.current = verifyResult.order.id;
                  }
                  break;
                }

                if (verifyResult.pending) {
                  // ⏳ PayPal 결제 처리 대기 중 (PAY_PENDING)
                  const delayMs = RETRY_SCHEDULE_MS[attempt - 1];
                  console.log(`[PayPal-SDK] ⏳ 결제 처리 대기 중 (시도 ${attempt}/${MAX_RETRIES}), ${delayMs}ms 후 재시도...`);
                  if (attempt < MAX_RETRIES) {
                    await new Promise((resolve) => setTimeout(resolve, delayMs));
                    continue;
                  }
                  // 최대 재시도 초과 → success 페이지에서 추가 폴링/웹훅으로 처리
                  console.warn('[PayPal-SDK] ⚠️ 최대 재시도 횟수 초과. success 페이지에서 추가 폴링 진행.');
                } else {
                  // ❌ 검증 실패 (FAILED 등)
                  console.error('[PayPal-SDK] ❌ 서버 검증 실패:', {
                    status: verifyResponse.status,
                    result: verifyResult,
                  });
                  break;
                }
              } catch (verifyErr) {
                console.error(`[PayPal-SDK] ❌ 서버 검증 호출 실패 (시도 ${attempt}/${MAX_RETRIES}):`, {
                  error: verifyErr,
                  message: verifyErr instanceof Error ? verifyErr.message : String(verifyErr),
                });
                if (attempt < MAX_RETRIES) {
                  const delayMs = RETRY_SCHEDULE_MS[attempt - 1];
                  await new Promise((resolve) => setTimeout(resolve, delayMs));
                }
              }
            }

            // 검증이 완료되지 않아도 success 페이지로 이동
            // → success 페이지가 추가 폴링하면서 사용자에게 명확한 "처리 중" UI 표시
            // → 더 이상 alert로 사용자를 놀라게 하지 않음 (success 페이지가 모두 처리)
            if (!verifySuccess) {
              console.warn('[PayPal-SDK] ⏳ verify 미확정 — success 페이지에서 추가 폴링 진행:', confirmedPaymentId);
            }

            // 성공 콜백 → OnePageCheckout에서 결제 성공 페이지로 이동
            // DB에 실제 저장된 주문 UUID를 전달
            onSuccess(confirmedPaymentId, finalOrderId);
          } catch (err) {
            console.error('[PayPal-SDK] ❌ 결제 후 처리 오류:', {
              error: err,
              message: err instanceof Error ? err.message : String(err),
            });

            // 결제 자체는 이미 성공했으므로 사용자에게 알림
            alert(
              t('checkout.paymentProcessingError',
                '결제 처리 중 오류가 발생했습니다. 중복 결제하지 마시고 관리자에게 문의하세요.')
            );

            // 성공 페이지로 이동 (재검증 시도)
            const fallbackOrderId = dbOrderIdRef.current || orderId;
            onSuccess(newPaymentId, fallbackOrderId);
          } finally {
            setIsProcessing(false);
            isProcessingRef.current = false;
          }
        },

        // ━━━ 결제 실패 콜백 ━━━
        onPaymentFail: (err: any) => {
          console.error('[PayPal-SDK] ❌ onPaymentFail', err);
          const rawMessage = err?.message || 'PayPal 결제가 실패했습니다.';
          const category = classifyPayPalFailure(rawMessage);
          console.warn('[PayPal-SDK] 결제 실패:', { rawMessage, category, code: err?.code });

          // 실패 모니터링 비콘 전송 (4순위: 에러코드별 집계용)
          reportPaymentFailure({
            category,
            rawMessage,
            code: err?.code,
            paymentId: paymentIdRef.current,
            orderId: dbOrderIdRef.current,
            amount,
          });

          setIsProcessing(false);
          isProcessingRef.current = false;

          // 사용자 친화적 메시지로 변환
          const friendly = friendlyMessageFor(category);
          setFailCategory(category);
          setError(friendly);

          // ⚠️ 재시도 시 "승인 안 된 stale PayPal Order"를 다시 캡처하면 또 실패하므로
          //    버튼을 새 paymentId/Order로 재렌더링할 수 있도록 로드 플래그를 초기화한다.
          loadedRef.current = false;

          // 모든 onPaymentFail 케이스는 화면 내 재시도 UI로 처리하므로
          // 상위로 alert 를 띄우지 않는다. (사용자를 결제 화면에 머무르게 함)
        },
      });

      // PayPal 버튼 렌더링 완료
      setLoading(false);
      console.log('[PayPal-SDK] ✅ PayPal SPB 버튼 렌더링 완료');
    } catch (err) {
      console.error('[PayPal-SDK] PayPal UI 로드 오류:', err);
      const errorMsg = err instanceof Error ? err.message : 'PayPal 버튼 로드에 실패했습니다.';
      setError(errorMsg);
      setLoading(false);
      loadedRef.current = false; // 재시도 허용
    }
  }, [user?.id, orderId, amount, items, onSuccess, onError, onProcessing]);

  useEffect(() => {
    loadPayPalButton();
  }, [loadPayPalButton]);

  const handleRetry = useCallback(() => {
    loadedRef.current = false;
    setError(null);
    setFailCategory(null);
    loadPayPalButton();
  }, [loadPayPalButton]);

  // 실패 사유별 안내 + 재시도 버튼 (compact / full 공용)
  const renderErrorBlock = () => {
    if (!error) return null;
    const isDeclined = failCategory === 'instrument_declined';
    return (
      <div className="w-full rounded-xl border border-red-200 bg-red-50 p-4 text-center">
        <i className="ri-error-warning-line text-2xl text-red-500"></i>
        <p className="mt-1 text-sm text-red-700">{error}</p>
        {isDeclined && (
          <p className="mt-1 text-xs text-red-500">
            {t(
              'checkout.paypalError.declinedHint',
              'PayPal 결제창에서 다른 카드로 바꾸거나 PayPal 잔액으로 결제해 보세요. 카드 한도·해외결제 차단 여부도 확인해 주세요.',
            )}
          </p>
        )}
        <button
          onClick={handleRetry}
          className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <i className="ri-refresh-line"></i>
          {t('checkout.retryPayment', 'PayPal로 다시 결제하기')}
        </button>
      </div>
    );
  };

  // ━━━ 컴팩트 모드: OnePageCheckout에서 사용 ━━━
  if (compact) {
    return (
      <div className="w-full relative">
        {/* 처리 중 오버레이 (전체 화면 차단) */}
        {isProcessing && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
            <div className="bg-white rounded-xl p-8 max-w-sm mx-4 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
              <p className="text-lg font-semibold text-gray-900 mb-2">
                {t('checkout.processing', '결제 처리 중...')}
              </p>
              <p className="text-sm text-gray-600">
                {t('checkout.doNotClose', '창을 닫지 마세요')}
              </p>
            </div>
          </div>
        )}

        {/* 로딩 상태 */}
        {loading && (
          <div className="w-full py-4 px-6 bg-gray-100 rounded-xl flex items-center justify-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent"></div>
            <span className="text-sm text-gray-500">PayPal {t('checkout.loading', '로딩 중...')}</span>
          </div>
        )}

        {/* 에러 상태 (사유별 안내 + 재시도) */}
        {error && renderErrorBlock()}

        {/* 🟢 포트원 PayPal SPB 버튼이 렌더링되는 컨테이너 */}
        {/* PortOne SDK가 class="portone-ui-container"를 찾아 PayPal 버튼을 렌더링 */}
        <div
          className="portone-ui-container"
          style={{ display: loading || error || isProcessing ? 'none' : 'block', pointerEvents: isProcessing ? 'none' : 'auto' }}
        />
      </div>
    );
  }

  // ━━━ 풀 모드 ━━━
  return (
    <div className="space-y-4 relative">
      {/* 처리 중 오버레이 (전체 화면 차단) */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-8 max-w-sm mx-4 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
            <p className="text-lg font-semibold text-gray-900 mb-2">
              {t('checkout.processing', '결제 처리 중...')}
            </p>
            <p className="text-sm text-gray-600">
              {t('checkout.doNotClose', '창을 닫지 마세요')}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <i className="ri-paypal-line text-2xl text-blue-600"></i>
        <h3 className="text-lg font-semibold text-gray-900">{t('checkout.paypal')}</h3>
      </div>

      <div className="p-6 border-2 border-gray-200 rounded-xl bg-white space-y-4">
        {/* 로딩 상태 */}
        {loading && (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto mb-2"></div>
            <p className="text-sm text-gray-500">PayPal {t('checkout.loading', '결제 버튼 로딩 중...')}</p>
          </div>
        )}

        {/* 에러 상태 (사유별 안내 + 재시도) */}
        {error && renderErrorBlock()}

        {/* 🟢 포트원 PayPal SPB 버튼이 렌더링되는 컨테이너 */}
        <div
          className="portone-ui-container"
          style={{ display: loading || error || isProcessing ? 'none' : 'block', pointerEvents: isProcessing ? 'none' : 'auto' }}
        />

        <div className="text-xs text-gray-600 text-center">
          {t('checkout.poweredBy', { provider: 'PortOne + PayPal' })}
        </div>
      </div>
    </div>
  );
}
