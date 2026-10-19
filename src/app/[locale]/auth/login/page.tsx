import type { Metadata } from 'next';
import LoginPage from '@/_pages/auth/login';
import { getLocalizedPageTitle } from '@/lib/seo/localizedPageTitle';

export async function generateMetadata(): Promise<Metadata> {
  return { title: await getLocalizedPageTitle('authLogin') };
}

export default function Login() {
  return <LoginPage />;
}
