import type { Metadata } from 'next';
import CustomOrderPage from '@/_pages/custom-order/page';
import { getLocalizedPageTitle } from '@/lib/seo/localizedPageTitle';

export async function generateMetadata(): Promise<Metadata> {
  return { title: await getLocalizedPageTitle('customOrder') };
}

export default function CustomOrder() {
  return <CustomOrderPage />;
}
