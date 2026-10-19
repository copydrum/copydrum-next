'use client';

import { useId } from 'react';

interface BrandSymbolProps {
  size?: number;
  className?: string;
}

const STICKS = [
  { x1: 25.84, y1: 41.6, x2: 40.56, y2: 22 },
  { x1: 33.6, y1: 43.6, x2: 48.24, y2: 24.08 },
];

/** 드럼헤드 C + 드럼스틱 두 개 심볼 (public/brand/copydrum-symbol.svg 와 같은 도형) */
export function BrandSymbol({ size = 32, className = '' }: BrandSymbolProps) {
  const gradientId = `cd-brand-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const gradient = `url(#${gradientId})`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={`flex-shrink-0 ${className}`}
    >
      <defs>
        {/* 스틱 둘레 칼선이 배경과 같은 색이 되도록 타일 좌표 기준 그라데이션을 쓴다 */}
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0" stopColor="#7B5CFF" />
          <stop offset="0.55" stopColor="#6D4AFF" />
          <stop offset="1" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={gradient} />
      <path
        d="M37.1 17.38 A15.2 15.2 0 1 0 46.49 37.53"
        fill="none"
        stroke="#fff"
        strokeWidth="6.08"
        strokeLinecap="round"
      />
      <g stroke={gradient} strokeWidth="4.48" strokeLinecap="round" fill={gradient}>
        {STICKS.map((s) => (
          <g key={`ko-${s.x1}`}>
            <line {...s} />
            <circle cx={s.x2} cy={s.y2} r="3.2" stroke="none" />
          </g>
        ))}
      </g>
      <g stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="#fff">
        {STICKS.map((s) => (
          <g key={s.x1}>
            <line {...s} />
            <circle cx={s.x2} cy={s.y2} r="2.16" stroke="none" />
          </g>
        ))}
      </g>
    </svg>
  );
}

interface BrandLogoProps {
  /** 심볼 크기(px). 글자 크기는 심볼에 맞춰 정해진다 */
  size?: number;
  tone?: 'onDark' | 'onLight';
  className?: string;
  wordmarkClassName?: string;
}

/** 심볼 + COPYDRUM 워드마크 */
export default function BrandLogo({ size = 36, tone = 'onDark', className = '', wordmarkClassName = '' }: BrandLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <BrandSymbol size={size} />
      <span
        className={`whitespace-nowrap font-[850] leading-none tracking-[-0.03em] ${
          tone === 'onDark' ? 'text-white' : 'text-ink'
        } ${wordmarkClassName}`}
        style={{ fontSize: Math.round(size * 0.58) }}
      >
        COPYDRUM
      </span>
    </span>
  );
}
