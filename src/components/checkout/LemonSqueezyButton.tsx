'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import type { CheckoutItem } from './OnePageCheckout';

// lemon.js 가 window에 주입하는 전역 객체 타입 (필요한 부분만 선언)
declare global {
  interface Window {
    LemonSqueezy?: {
      Setup: (options: {
        eventHandler?: (event: { event: string; data?: unknown }) => void;
      }) => void;
      Url: {
        Open: (url: string) => void;
        Close: () => void;
      };
      Refresh: () => void;
    };
    createLemonSqueezy?: () => void;
  }
}

const LEMON_JS_SRC = 'https://app.lemonsqueezy.com/js/lemon.js';

interface LemonSqueezyButtonProps {
  orderId: string;
  amount: number; // KRW (표시용; 실제 청구 금액은 서버가 DB에서 계산)
  items: CheckoutItem[];
  onSuccess: (paymentId: string, dbOrderId?: string) => void;
  onError: (error: Error) => void;
  onProcessing: () => void;
  compact?: boolean;
}

export default function LemonSqueezyButton({
  orderId,
  amount,
  items,
  onSuccess,
  onError,
  onProcessing,
  compact,
}: LemonSqueezyButtonProps) {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [scriptReady, setScriptReady] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const succeededRef = useRef(false);
  // 실제 DB 주문 ID (장바구니는 클라이언트 임시 UUID로 시작하므로 주문 생성 후 갱신)
  const dbOrderIdRef = useRef<string>(orderId);

  // lemon.js 로드
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const setup = () => {
      try {
        window.LemonSqueezy?.Setup({
          eventHandler: (event) => {
            // 결제 성공 이벤트 → 성공 콜백 (실제 권한 부여는 서버 웹훅이 담당)
            if (event.event === 'Checkout.Success') {
              if (succeededRef.current) return;
              succeededRef.current = true;
              window.LemonSqueezy?.Url.Close();
              onSuccess('', dbOrderIdRef.current);
            }
          },
        });
        setScriptReady(true);
      } catch (e) {
        console.error('[lemon-squeezy] Setup 실패:', e);
      }
    };

    // 이미 로드된 경우
    if (window.LemonSqueezy) {
      setup();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${LEMON_JS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', setup, { once: true });
      // 혹시 이미 load 됐는데 LemonSqueezy가 늦게 붙는 경우 대비 폴링
      const poll = setInterval(() => {
        if (window.LemonSqueezy) {
          clearInterval(poll);
          setup();
        }
      }, 200);
      return () => clearInterval(poll);
    }

    const script = document.createElement('script');
    script.src = LEMON_JS_SRC;
    script.defer = true;
    script.addEventListener('load', () => {
      // lemon.js 는 load 후 createLemonSqueezy()를 호출해야 window.LemonSqueezy가 생성됨
      try {
        window.createLemonSqueezy?.();
      } catch {
        /* noop */
      }
      setup();
    });
    script.addEventListener('error', () => {
      setError(t('checkout.lsLoadError', '결제 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'));
    });
    document.body.appendChild(script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = useCallback(async () => {
    if (creating) return;
    if (!user?.id) {
      const msg = t('checkout.loginRequired', '로그인이 필요합니다.');
      setError(msg);
      onError(new Error(msg));
      return;
    }
    setError(null);
    setCreating(true);
    onProcessing();

    try {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 1단계: DB에 주문 생성 (PayPal/카드와 동일한 Upsert)
      //   → 장바구니는 클라이언트 임시 UUID로 시작하므로 여기서 실제 주문을 만든다.
      //   → 동일 유저+동일 아이템+동일 금액의 pending 주문은 재활용된다.
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      let dbOrderId = orderId;
      const orderDescription =
        items.length === 1 ? items[0].title : `${items[0].title} 외 ${items.length - 1}건`;

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
          paymentMethod: 'lemonsqueezy',
        }),
      });
      const createResult = await createResponse.json();

      if (createResult.success && createResult.orderId) {
        dbOrderId = createResult.orderId;
        dbOrderIdRef.current = dbOrderId;

        // 동일 상품의 기존 결제가 이미 완료됨 — 재결제 없이 성공 화면으로
        if (createResult.alreadyPaid) {
          succeededRef.current = true;
          onSuccess('', dbOrderId);
          return;
        }
      } else {
        const msg = createResult?.error || t('checkout.lsCreateError', '결제창을 여는 데 실패했습니다.');
        setError(msg);
        onError(new Error(msg));
        return;
      }

      // 2단계: 실제 DB 주문 ID로 Lemon Squeezy 체크아웃 생성
      const res = await fetch('/api/payments/lemon-squeezy/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: dbOrderId, locale: i18n.language }),
      });
      const result = await res.json();

      if (!res.ok || !result.success || !result.checkoutUrl) {
        const msg = result?.error || t('checkout.lsCreateError', '결제창을 여는 데 실패했습니다.');
        setError(msg);
        onError(new Error(msg));
        return;
      }

      // 오버레이로 결제창 열기 (사이트 이탈 없음)
      if (window.LemonSqueezy?.Url?.Open) {
        window.LemonSqueezy.Url.Open(result.checkoutUrl);
      } else {
        // 폴백: 새 탭 (오버레이 모듈 미로드 시)
        window.open(result.checkoutUrl, '_blank', 'noopener');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('checkout.lsCreateError', '결제창을 여는 데 실패했습니다.');
      setError(msg);
      onError(new Error(msg));
    } finally {
      setCreating(false);
    }
  }, [creating, user?.id, orderId, amount, items, i18n.language, onProcessing, onSuccess, onError, t]);

  return (
    <div className="w-full space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={creating || !scriptReady}
        className={`w-full flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 text-white shadow-sm ${
          compact ? 'py-3.5 px-4 text-sm' : 'py-4 px-6 text-base'
        }`}
      >
        {creating ? (
          <>
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            {t('checkout.loading', '로딩 중...')}
          </>
        ) : (
          <>
            <i className="ri-bank-card-line text-lg" aria-hidden />
            {t('checkout.payWithCard', 'Pay with Card')}
          </>
        )}
      </button>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
