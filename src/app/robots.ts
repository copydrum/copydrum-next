import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        // 관리자 페이지
        '/admin/',

        // 인증 및 사용자 페이지
        '/auth/',
        '/mypage/',

        // 보안 API 엔드포인트
        '/api/auth/',
        '/api/payments/',
        '/api/admin/',

        // 결제 처리 페이지
        '/payments/',
      ],
    },
    sitemap: 'https://copydrum.com/sitemap.xml',
  };
}
