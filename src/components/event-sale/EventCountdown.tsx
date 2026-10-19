'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { formatClock, getRemainingTime } from '@/lib/eventDiscountRules';

// 화면의 모든 타이머가 1초 간격 하나를 공유한다. 0 은 "아직 마운트 전" (서버 렌더링과 동일한 첫 화면)
let clockNow = 0;
let clockTimer: number | null = null;
const clockListeners = new Set<() => void>();

const subscribeClock = (listener: () => void) => {
  clockListeners.add(listener);
  if (clockTimer === null) {
    clockNow = Date.now();
    clockTimer = window.setInterval(() => {
      clockNow = Date.now();
      clockListeners.forEach((fn) => fn());
    }, 1000);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && clockTimer !== null) {
      window.clearInterval(clockTimer);
      clockTimer = null;
      clockNow = 0;
    }
  };
};
const getClock = () => clockNow;
const getServerClock = () => 0;

interface EventCountdownProps {
  /** 카운트다운 목표 시각 (종료 또는 오픈 시각) */
  target: string;
  variant?: 'inline' | 'blocks';
  /** 'blocks' 색상 */
  tone?: 'light' | 'dark';
  className?: string;
  onExpire?: () => void;
}

const pad2 = (value: number) => value.toString().padStart(2, '0');

export default function EventCountdown({
  target,
  variant = 'inline',
  tone = 'dark',
  className = '',
  onExpire,
}: EventCountdownProps) {
  const { t } = useTranslation();
  const now = useSyncExternalStore(subscribeClock, getClock, getServerClock);
  const mounted = now > 0;
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    expiredRef.current = false;
  }, [target]);

  const remaining = getRemainingTime(target, now);

  useEffect(() => {
    if (mounted && remaining.totalMilliseconds <= 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpireRef.current?.();
    }
  }, [mounted, remaining.totalMilliseconds]);

  // 서버 렌더링과 첫 화면이 같도록, 마운트 전에는 자리만 잡아 둔다
  if (!mounted) {
    return (
      <span className={`tabular-nums opacity-0 ${className}`} aria-hidden="true">
        00:00:00
      </span>
    );
  }

  if (variant === 'blocks') {
    const units = [
      ...(remaining.days > 0 ? [{ value: remaining.days, label: t('eventSale.timer.days') }] : []),
      { value: remaining.hours, label: t('eventSale.timer.hours') },
      { value: remaining.minutes, label: t('eventSale.timer.minutes') },
      { value: remaining.seconds, label: t('eventSale.timer.seconds') },
    ];
    const boxClass =
      tone === 'light' ? 'bg-white/15 text-white ring-1 ring-white/25' : 'bg-gray-900 text-white';
    const labelClass = tone === 'light' ? 'text-white/80' : 'text-gray-500';

    return (
      <div className={`flex items-end gap-1.5 sm:gap-2 ${className}`} role="timer" aria-live="off">
        {units.map((unit, index) => (
          <div key={index} className="flex flex-col items-center">
            <span
              className={`min-w-[2.6rem] sm:min-w-[3.2rem] rounded-lg px-2 py-1.5 text-center text-xl sm:text-2xl font-extrabold tabular-nums ${boxClass}`}
            >
              {pad2(unit.value)}
            </span>
            <span className={`mt-1 text-[11px] sm:text-xs font-medium ${labelClass}`}>{unit.label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <span className={`tabular-nums ${className}`} role="timer" aria-live="off">
      {remaining.days > 0 && <>{t('eventSale.timer.dayCount', { count: remaining.days })} </>}
      {formatClock(remaining)}
    </span>
  );
}
