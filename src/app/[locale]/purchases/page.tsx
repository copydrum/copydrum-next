import type { Metadata } from 'next';
import PurchasesPage from '@/_pages/purchases/page';
import { getLocalizedCommonTitle } from '@/lib/seo/localizedPageTitle';

export async function generateMetadata(): Promise<Metadata> {
  return { title: await getLocalizedCommonTitle('purchaseHistory.title'), robots: { index: false } };
}

export default function Purchases() {
  return <PurchasesPage />;
}
