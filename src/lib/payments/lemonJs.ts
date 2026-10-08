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

let loading: Promise<void> | null = null;

/** lemon.js 를 한 번만 불러온다 (오버레이 결제창용) */
export function ensureLemonJs(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('NO_WINDOW'));
  if (window.LemonSqueezy) return Promise.resolve();
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    const ready = () => {
      if (!window.LemonSqueezy) {
        try {
          window.createLemonSqueezy?.();
        } catch {
          /* noop */
        }
      }
      if (window.LemonSqueezy) resolve();
    };

    let script = document.querySelector<HTMLScriptElement>(`script[src="${LEMON_JS_SRC}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = LEMON_JS_SRC;
      script.defer = true;
      document.body.appendChild(script);
    }
    script.addEventListener('load', ready, { once: true });
    script.addEventListener(
      'error',
      () => {
        loading = null;
        reject(new Error('LEMON_JS_LOAD_FAILED'));
      },
      { once: true },
    );

    // 이미 load 가 끝난 스크립트였을 수 있으므로 잠시 폴링
    let tries = 0;
    const poll = setInterval(() => {
      tries += 1;
      ready();
      if (window.LemonSqueezy || tries > 50) clearInterval(poll);
    }, 200);
  });

  return loading;
}

/**
 * 오버레이 결제창을 연다. lemon.js 는 전역 핸들러 하나만 쓰므로 열 때마다 다시 등록한다.
 * 오버레이를 쓸 수 없으면 새 탭으로 연다.
 */
export function openLemonCheckout(checkoutUrl: string, onSuccess: () => void): void {
  let succeeded = false;
  try {
    window.LemonSqueezy?.Setup({
      eventHandler: (event) => {
        if (event.event !== 'Checkout.Success' || succeeded) return;
        succeeded = true;
        window.LemonSqueezy?.Url.Close();
        onSuccess();
      },
    });
  } catch {
    /* noop */
  }

  if (window.LemonSqueezy?.Url?.Open) {
    window.LemonSqueezy.Url.Open(checkoutUrl);
  } else {
    window.open(checkoutUrl, '_blank', 'noopener');
  }
}
