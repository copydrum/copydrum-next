import LocaleSync from './LocaleSync';
import LocaleI18nProvider from './LocaleI18nProvider';
import ClientLayout from './layout-client';

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
