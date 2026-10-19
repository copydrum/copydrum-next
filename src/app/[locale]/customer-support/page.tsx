import type { Metadata } from 'next';
import CustomerSupportPage from '@/_pages/customer-support/page';
import { getLocalizedPageTitle } from '@/lib/seo/localizedPageTitle';

export async function generateMetadata(): Promise<Metadata> {
  return { title: await getLocalizedPageTitle('customerSupport') };
}

export default function CustomerSupport() {
  return <CustomerSupportPage />;
}
