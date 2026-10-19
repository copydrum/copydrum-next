import type { Metadata } from 'next';
import CartPage from '@/_pages/cart/page';
import { getLocalizedPageTitle } from '@/lib/seo/localizedPageTitle';

export async function generateMetadata(): Promise<Metadata> {
  return { title: await getLocalizedPageTitle('cartPage') };
}

export default function Cart() {
  return <CartPage />;
}
