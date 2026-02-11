import LocaleSync from './LocaleSync';
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
      <ClientLayout>
        {children}
      </ClientLayout>
    </div>
  );
}
