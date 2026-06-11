import { create } from 'zustand';

interface GuestCheckoutState {
  isOpen: boolean;
  /** 게스트 세션 수립 후 돌아올 경로(현재는 reload 로 처리) */
  redirectPath: string | null;
  open: (redirectPath?: string) => void;
  close: () => void;
}

/**
 * 게스트 결제 인라인 모달 전역 트리거.
 * 로그인 게이트(useBuyNow, 장바구니 등)에서 open() 을 호출하면,
 * 전역에 마운트된 GuestCheckoutModal 이 열린다.
 */
export const useGuestCheckoutStore = create<GuestCheckoutState>((set) => ({
  isOpen: false,
  redirectPath: null,
  open: (redirectPath) => set({ isOpen: true, redirectPath: redirectPath ?? null }),
  close: () => set({ isOpen: false }),
}));
