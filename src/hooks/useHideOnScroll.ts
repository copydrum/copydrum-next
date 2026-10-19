'use client';

import { useEffect, useState } from 'react';

interface HideOnScrollOptions {
  /** 이 위치(px)보다 위에서는 항상 보인다 */
  threshold?: number;
  /** 이만큼(px) 이상 움직여야 방향 전환으로 본다 (iOS 바운스 등 미세 떨림 무시) */
  delta?: number;
}

/** 아래로 스크롤하면 true, 위로 스크롤하거나 상단 근처면 false */
export function useHideOnScroll({ threshold = 160, delta = 8 }: HideOnScrollOptions = {}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let lastY = window.scrollY;
    let ticking = false;

    const update = () => {
      ticking = false;
      const y = Math.max(0, window.scrollY);
      if (y < threshold) {
        setHidden(false);
        lastY = y;
        return;
      }
      const diff = y - lastY;
      if (Math.abs(diff) < delta) return;
      setHidden(diff > 0);
      lastY = y;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold, delta]);

  return hidden;
}
