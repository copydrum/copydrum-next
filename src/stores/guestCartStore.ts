import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface GuestCartState {
  /** 비회원이 담아둔 악보 id 목록 (localStorage 에 저장) */
  ids: string[];
  /** 담기. 이미 담겨 있으면 false 반환 */
  add: (sheetId: string) => boolean;
  remove: (sheetId: string) => void;
  removeMany: (sheetIds: string[]) => void;
  clear: () => void;
  has: (sheetId: string) => boolean;
}

/**
 * 비회원(게스트) 장바구니.
 * 로그인 없이 자유롭게 담을 수 있도록 localStorage 에 악보 id 만 보관한다.
 * 가격/제목 등 상세 정보는 결제·표시 시점에 DB(drum_sheets)에서 다시 조회하여
 * 항상 최신 가격을 사용한다(가격 조작 방지).
 *
 * 결제 단계에서 게스트 세션이 수립되면, 이 목록을 DB cart_items 로 병합한 뒤 비운다.
 */
export const useGuestCartStore = create<GuestCartState>()(
  persist(
    (set, get) => ({
      ids: [],
      add: (sheetId) => {
        if (get().ids.includes(sheetId)) return false;
        set({ ids: [...get().ids, sheetId] });
        return true;
      },
      remove: (sheetId) => set({ ids: get().ids.filter((id) => id !== sheetId) }),
      removeMany: (sheetIds) =>
        set({ ids: get().ids.filter((id) => !sheetIds.includes(id)) }),
      clear: () => set({ ids: [] }),
      has: (sheetId) => get().ids.includes(sheetId),
    }),
    { name: 'copydrum-guest-cart' }
  )
);
