import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MY_BOOK_MAX_SONGS } from '../lib/myBook/pricing';

interface MyBookState {
  /** 나만의 악보집에 담은 악보 id (목차 순서) */
  ids: string[];
  /** 담기. 이미 담겨 있거나 최대 곡 수를 넘으면 false */
  add: (sheetId: string) => boolean;
  /** 여러 곡 담기. 새로 담긴 곡 수를 반환 */
  addMany: (sheetIds: string[]) => number;
  remove: (sheetId: string) => void;
  move: (sheetId: string, direction: -1 | 1) => void;
  clear: () => void;
  has: (sheetId: string) => boolean;
}

/**
 * 나만의 악보집 담기 목록. 로그인 없이도 담을 수 있도록 localStorage 에 악보 id 만 보관하고,
 * 제목·가격은 화면 표시와 주문 생성 시점에 DB 에서 다시 조회한다.
 */
export const useMyBookStore = create<MyBookState>()(
  persist(
    (set, get) => ({
      ids: [],
      add: (sheetId) => {
        const { ids } = get();
        if (ids.includes(sheetId) || ids.length >= MY_BOOK_MAX_SONGS) return false;
        set({ ids: [...ids, sheetId] });
        return true;
      },
      addMany: (sheetIds) => {
        const next = [...get().ids];
        let added = 0;
        for (const id of sheetIds) {
          if (next.length >= MY_BOOK_MAX_SONGS) break;
          if (!next.includes(id)) {
            next.push(id);
            added += 1;
          }
        }
        set({ ids: next });
        return added;
      },
      remove: (sheetId) => set({ ids: get().ids.filter((id) => id !== sheetId) }),
      move: (sheetId, direction) => {
        const ids = [...get().ids];
        const index = ids.indexOf(sheetId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= ids.length) return;
        [ids[index], ids[target]] = [ids[target], ids[index]];
        set({ ids });
      },
      clear: () => set({ ids: [] }),
      has: (sheetId) => get().ids.includes(sheetId),
    }),
    { name: 'copydrum-my-book' }
  )
);
