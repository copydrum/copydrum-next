import type { Metadata } from 'next';
import LocaleSync from './LocaleSync';
import LocaleI18nProvider from './LocaleI18nProvider';
import ClientLayout from './layout-client';
import { getServerHomeSeo } from '@/lib/seo/serverSeo';
import { getLocaleFromHeaders } from '@/lib/seo/hreflang';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromHeaders();
  const seo = getServerHomeSeo(locale);

  return {
    title: {
      absolute: seo.title,
      template: '%s | COPYDRUM',
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <div lang={locale}>
      <LocaleSync locale={locale} />
      <LocaleI18nProvider locale={locale}>
        <ClientLayout>
          {children}
        </ClientLayout>
      </LocaleI18nProvider>
    </div>
  );
}
