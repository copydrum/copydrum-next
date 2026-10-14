/** 기본 표지 색 조합 (서버 PDF·화면 미리보기 공용). 배경은 위 → 아래 그라데이션 */
export interface MyBookCoverTheme {
  id: string;
  stops: [number, string][];
  text: string;
}

export const MY_BOOK_COVER_THEMES: MyBookCoverTheme[] = [
  { id: 'aurora', stops: [[0, '#2663EB'], [0.55, '#6E40E6'], [1, '#B533BF']], text: '#FFFFFF' },
  { id: 'midnight', stops: [[0, '#0B1430'], [1, '#1E2B5C']], text: '#E8C76A' },
  { id: 'black', stops: [[0, '#0A0A0A'], [1, '#2E2E2E']], text: '#FFFFFF' },
  { id: 'wine', stops: [[0, '#4A0D1C'], [1, '#8E1B33']], text: '#F6E7C8' },
  { id: 'forest', stops: [[0, '#0C3326'], [1, '#1E6A4E']], text: '#F3E9D2' },
  { id: 'sunset', stops: [[0, '#F97316'], [1, '#DB2777']], text: '#FFFFFF' },
  { id: 'ivory', stops: [[0, '#FBF7EE'], [1, '#E9DDC4']], text: '#2B2116' },
  { id: 'sky', stops: [[0, '#E0F2FE'], [1, '#93C5FD']], text: '#0F2A4A' },
];

export const DEFAULT_MY_BOOK_COVER_THEME = MY_BOOK_COVER_THEMES[0];

export function getMyBookCoverTheme(id: string | null | undefined): MyBookCoverTheme {
  return MY_BOOK_COVER_THEMES.find((theme) => theme.id === id) ?? DEFAULT_MY_BOOK_COVER_THEME;
}

export function isMyBookCoverThemeId(id: unknown): id is string {
  return typeof id === 'string' && MY_BOOK_COVER_THEMES.some((theme) => theme.id === id);
}

export function getCoverThemeGradientCss(theme: MyBookCoverTheme) {
  return `linear-gradient(180deg, ${theme.stops.map(([pos, color]) => `${color} ${Math.round(pos * 100)}%`).join(', ')})`;
}

/** '#RRGGBB' → 0~1 범위 RGB */
export function hexToUnitRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.replace('#', ''), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}
