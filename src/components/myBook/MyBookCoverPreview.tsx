'use client';

import { getCoverThemeGradientCss, getMyBookCoverTheme } from '../../lib/myBook/coverThemes';

interface MyBookCoverPreviewProps {
  title: string;
  songCount: number;
  /** 기본 표지 색 조합 id */
  themeId?: string | null;
  /** 화면에 그릴 너비(px). 비율은 A4 를 유지한다 */
  width?: number;
  className?: string;
}

const BASE_WIDTH = 136;
const A4_RATIO = 297 / 210;

/** 서버에서 만드는 기본 표지(buildBookPdf 의 drawAutoCover)와 같은 모양의 화면용 미리보기 */
export default function MyBookCoverPreview({
  title,
  songCount,
  themeId,
  width = BASE_WIDTH,
  className = '',
}: MyBookCoverPreviewProps) {
  const displayTitle = title.trim() || '나만의 악보집';
  const fontSize = displayTitle.length > 24 ? 11 : displayTitle.length > 12 ? 13 : 15;
  const scale = width / BASE_WIDTH;
  const theme = getMyBookCoverTheme(themeId);

  return (
    <div
      className={`relative overflow-hidden rounded-md shadow-lg ring-1 ring-black/5 ${className}`}
      style={{ width, height: width * A4_RATIO }}
      aria-hidden="true"
    >
      <div
        className="absolute left-0 top-0 origin-top-left transition-colors"
        style={{
          width: BASE_WIDTH,
          height: BASE_WIDTH * A4_RATIO,
          transform: `scale(${scale})`,
          background: getCoverThemeGradientCss(theme),
          color: theme.text,
        }}
      >
        <div className="absolute -right-[18%] -top-[8%] h-[52%] w-[70%] rounded-full bg-current opacity-10" />
        <div className="absolute -right-[26%] -top-[14%] h-[66%] w-[88%] rounded-full border border-current opacity-25" />
        <div className="absolute -bottom-[16%] -left-[30%] h-[52%] w-[74%] rounded-full bg-current opacity-10" />
        <div className="relative flex h-full flex-col items-center px-2 text-center">
          <p className="mt-[30%] whitespace-nowrap text-[6px] font-semibold tracking-[0.3em] opacity-90">MY DRUM BOOK</p>
          <div className="mt-1 h-px w-5 bg-current opacity-70" />
          <p className="mt-2 line-clamp-4 break-keep font-extrabold leading-tight" style={{ fontSize }}>
            {displayTitle}
          </p>
          <p className="mt-2 whitespace-nowrap text-[7px] font-bold opacity-95">드럼 악보집 · {songCount}곡</p>
          <div className="mb-[8%] mt-auto text-center">
            <p className="text-[7px] font-bold tracking-[0.25em]">COPYDRUM</p>
            <p className="text-[5px] opacity-80">copydrum.com</p>
          </div>
        </div>
      </div>
    </div>
  );
}
