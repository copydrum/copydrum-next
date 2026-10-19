import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

/** 브랜드 보라 (Violet Ink 팔레트, 600이 메인 버튼 색) */
const brandViolet = {
  50: '#F5F2FF',
  100: '#ECE6FF',
  200: '#DAD0FF',
  300: '#BEAEFF',
  400: '#9D85FF',
  500: '#8063FF',
  600: '#6D4AFF',
  700: '#5A36EB',
  800: '#4A2BC4',
  900: '#3B249A',
  950: '#24165E',
};

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        'sans': ['Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'Roboto', 'Helvetica Neue', 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'sans-serif'],
        'display': ['Pretendard', 'sans-serif'],
      },
      colors: {
        // 사이트 전역의 blue-* 클래스가 브랜드 보라로 그려진다 (기존 화면 코드를 그대로 두고 팔레트만 교체)
        blue: brandViolet,
        // indigo-* 도 한 단계 진한 브랜드 보라로 그려 blue→indigo 그라데이션의 깊이감을 유지한다
        indigo: {
          50: brandViolet[100],
          100: brandViolet[200],
          200: brandViolet[300],
          300: brandViolet[400],
          400: brandViolet[500],
          500: brandViolet[600],
          600: brandViolet[700],
          700: brandViolet[800],
          800: brandViolet[900],
          900: brandViolet[950],
          950: '#170D3F',
        },
        brand: brandViolet,
        ink: {
          DEFAULT: '#14123A',
          light: '#221F55',
        },
      },
      backgroundImage: {
        aurora: 'radial-gradient(120% 140% at 10% 0%, #A0D8F8 0%, #B0A0F0 45%, #E8C0E8 85%)',
      },
    },
  },
  plugins: [typography],
};

export default config;
