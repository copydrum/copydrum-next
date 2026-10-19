import type { Metadata } from 'next';
import MyPageContent from '@/_pages/mypage/page';
import { getLocalizedPageTitle } from '@/lib/seo/localizedPageTitle';

export async function generateMetadata(): Promise<Metadata> {
  return { title: await getLocalizedPageTitle('mypage'), robots: { index: false } };
}

export default function MyPage() {
  return <MyPageContent />;
}
