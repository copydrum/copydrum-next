// 기본 썸네일 생성 유틸리티
// 썸네일/프리뷰 이미지가 없을 때 사용하는 로컬 플레이스홀더.
//
// ⚠️ 이전 구현은 document.createElement('canvas') 를 사용해서
//    서버 렌더(SSR) 단계(document 미존재)에서 호출되면 예외가 발생 → 페이지 500 위험이 있었다.
//    → DOM 에 의존하지 않는 순수 SVG data URI 로 변경해 서버/클라이언트 모두에서 안전하게 동작한다.

export const generateDefaultThumbnail = (
  width: number = 400,
  height: number = 400
): string => {
  const base = Math.min(width, height);
  const symbolSize = Math.round(base * 0.22);
  const symbolX = Math.round((width - symbolSize) / 2);
  const symbolY = Math.round(height * 0.5 - symbolSize - base * 0.04);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#14123A"/>
      <stop offset="100%" stop-color="#6D4AFF"/>
    </linearGradient>
    <linearGradient id="s" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="64" y2="64">
      <stop offset="0" stop-color="#7B5CFF"/>
      <stop offset="0.55" stop-color="#6D4AFF"/>
      <stop offset="1" stop-color="#EC4899"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <svg x="${symbolX}" y="${symbolY}" width="${symbolSize}" height="${symbolSize}" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="16" fill="url(#s)"/>
    <path d="M37.1 17.38 A15.2 15.2 0 1 0 46.49 37.53" fill="none" stroke="#fff" stroke-width="6.08" stroke-linecap="round"/>
    <g stroke="url(#s)" stroke-width="4.48" stroke-linecap="round" fill="url(#s)">
      <line x1="25.84" y1="41.6" x2="40.56" y2="22"/><circle cx="40.56" cy="22" r="3.2" stroke="none"/>
      <line x1="33.6" y1="43.6" x2="48.24" y2="24.08"/><circle cx="48.24" cy="24.08" r="3.2" stroke="none"/>
    </g>
    <g stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="#fff">
      <line x1="25.84" y1="41.6" x2="40.56" y2="22"/><circle cx="40.56" cy="22" r="2.16" stroke="none"/>
      <line x1="33.6" y1="43.6" x2="48.24" y2="24.08"/><circle cx="48.24" cy="24.08" r="2.16" stroke="none"/>
    </g>
  </svg>
  <text x="50%" y="${Math.round(height * 0.5 + base * 0.07)}" fill="#ffffff" font-family="Arial, sans-serif" font-size="${Math.round(
    base * 0.08
  )}" font-weight="bold" text-anchor="middle" dominant-baseline="middle" letter-spacing="-1">COPYDRUM</text>
  <text x="50%" y="${Math.round(height * 0.5 + base * 0.16)}" fill="#ffffff" fill-opacity="0.7" font-family="Arial, sans-serif" font-size="${Math.round(
    base * 0.045
  )}" font-weight="bold" text-anchor="middle" dominant-baseline="middle">DRUM SHEET MUSIC</text>
</svg>`;

  // UTF-8 안전 인코딩 (btoa 는 비-Latin1 에서 실패하므로 encodeURIComponent 사용)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};
