import { create } from 'zustand';

interface CartSyncState {
  /** 회원 장바구니(DB)가 바뀔 때마다 증가한다. useCart 인스턴스들이 이 값을 보고 다시 로드한다. */
  version: number;
  bump: () => void;
}

/**
 * useCart 는 헤더/하단바/사이드바/장바구니 페이지에서 각각 마운트되어 state 를 따로 가진다.
 * 한 곳에서 담기/삭제가 일어나면 bump() 로 알려 다른 인스턴스(장바구니 개수 배지 등)도 다시 로드하게 한다.
 */
export const useCartSyncStore = create<CartSyncState>()((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));
