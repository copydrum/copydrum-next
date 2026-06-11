import { create } from 'zustand';

/** 게스트가 바로구매로 결제하려던 상품 정보 */
export interface GuestPendingSheet {
  id: string;
  title: string;
  price: number;
}

interface GuestCheckoutState {
  isOpen: boolean;
  /** 게스트 세션 수립 후 돌아올 경로(현재는 reload 로 처리) */
  redirectPath: string | null;
  /** 바로구매로 진입한 경우, 세션 수립 후 이어서 결제할 상품 */
  pendingSheet: GuestPendingSheet | null;
  /** 장바구니 결제로 진입한 경우, 세션 수립 후 게스트 장바구니를 병합하고 장바구니로 이동 */
  cartCheckout: boolean;
  open: (
    redirectPath?: string,
    pendingSheet?: GuestPendingSheet,
    cartCheckout?: boolean
  ) => void;
  close: () => void;
}

/**
 * 게스트 결제 인라인 모달 전역 트리거.
 * 로그인 게이트(useBuyNow, 장바구니 등)에서 open() 을 호출하면,
 * 전역에 마운트된 GuestCheckoutModal 이 열린다.
 *
 * 바로구매(useBuyNow)에서 pendingSheet 를 함께 넘기면,
 * 이메일 입력으로 세션이 수립된 직후 모달이 그 상품의 주문을 생성하고
 * 결제 페이지로 바로 이동시킨다(사용자가 바로구매를 다시 누를 필요 없음).
 */
export const useGuestCheckoutStore = create<GuestCheckoutState>((set) => ({
  isOpen: false,
  redirectPath: null,
  pendingSheet: null,
  cartCheckout: false,
  open: (redirectPath, pendingSheet, cartCheckout) =>
    set({
      isOpen: true,
      redirectPath: redirectPath ?? null,
      pendingSheet: pendingSheet ?? null,
      cartCheckout: cartCheckout ?? false,
    }),
  close: () => set({ isOpen: false, pendingSheet: null, cartCheckout: false }),
}));
