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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e3a8a"/>
      <stop offset="100%" stop-color="#3b82f6"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <text x="50%" y="46%" fill="#ffffff" font-family="Arial, sans-serif" font-size="${Math.round(
    Math.min(width, height) * 0.08
  )}" font-weight="bold" text-anchor="middle" dominant-baseline="middle">COPYDRUM</text>
  <text x="50%" y="56%" fill="#ffffff" font-family="Arial, sans-serif" font-size="${Math.round(
    Math.min(width, height) * 0.06
  )}" font-weight="bold" text-anchor="middle" dominant-baseline="middle">DRUM SHEET MUSIC</text>
</svg>`;

  // UTF-8 안전 인코딩 (btoa 는 비-Latin1 에서 실패하므로 encodeURIComponent 사용)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};
