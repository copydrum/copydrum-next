import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/** 서버 렌더링과 첫 클라이언트 렌더링에서는 false, 하이드레이션 이후 true */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
