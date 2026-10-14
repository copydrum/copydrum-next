import type { Metadata } from 'next';
import MyBookPage from '@/_pages/my-book/page';
import { canonicalFor } from '@/lib/seo/hreflang';

export function generateMetadata(): Metadata {
  return {
    title: '나만의 악보집',
    description:
      '원하는 드럼 악보만 골라 담으면 표지·목차·페이지 번호를 넣은 PDF 악보집이 결제 즉시 1분 안에 완성됩니다. 많이 담을수록 최대 50% 할인, 이미 산 곡은 0원.',
    alternates: {
      canonical: canonicalFor('ko', '/my-book'),
    },
  };
}

export default function Page() {
  return <MyBookPage />;
}
