import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typescript: {
    // TODO: Remove after fixing all pre-existing type errors in admin page
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'img.youtube.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'tkbyemysfmbhqwdvefsi.supabase.co' },
      { protocol: 'https', hostname: 'readdy.ai' },
      { protocol: 'https', hostname: 'i.scdn.co' },
    ],
  },
  async rewrites() {
    return {
      beforeFiles: [
        // /sitemap.xml → API 라우트로 사이트맵 인덱스 서빙
        { source: '/sitemap.xml', destination: '/api/sitemap' },
        // /sitemap/en.xml, /sitemap/ko.xml 등 → 언어별 사이트맵 API 라우트
        { source: '/sitemap/:path*', destination: '/api/sitemap/:path*' },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async redirects() {
    return [
      // Legacy auth redirects (work for all locales)
      { source: '/login', destination: '/auth/login', permanent: true },
      { source: '/register', destination: '/auth/register', permanent: true },
      { source: '/forgot-password', destination: '/auth/forgot-password', permanent: true },
      { source: '/reset-password', destination: '/auth/reset-password', permanent: true },

      // Locale-prefixed auth redirects
      { source: '/:locale/login', destination: '/:locale/auth/login', permanent: true },
      { source: '/:locale/register', destination: '/:locale/auth/register', permanent: true },
      { source: '/:locale/forgot-password', destination: '/:locale/auth/forgot-password', permanent: true },
      { source: '/:locale/reset-password', destination: '/:locale/auth/reset-password', permanent: true },

      // Sheet URL redirects (old /sheet/ to new /drum-sheet/ for SEO)
      { source: '/sheet/:slug', destination: '/drum-sheet/:slug', permanent: true },
      { source: '/:locale/sheet/:slug', destination: '/:locale/drum-sheet/:slug', permanent: true },
    ];
  },
};

export default nextConfig;
