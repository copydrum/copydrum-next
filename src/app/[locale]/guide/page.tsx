import type { Metadata } from 'next';
import GuidePage from '@/_pages/guide/page';
import { getLocalizedPageTitle } from '@/lib/seo/localizedPageTitle';

export async function generateMetadata(): Promise<Metadata> {
  return { title: await getLocalizedPageTitle('guidePage') };
}

export default function Guide() {
  return <GuidePage />;
}
