import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: {
    default: 'COPYDRUM | High-Quality Drum Sheet Music Store',
    template: '%s | COPYDRUM',
  },
  description: 'High-quality drum sheet music and drum scores for pop, rock, K-POP, CCM and more. Download professional drum notation for your favorite songs.',
  metadataBase: new URL('https://copydrum.com'),
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    siteName: 'COPYDRUM',
    type: 'website',
  },
  alternates: {
    canonical: 'https://copydrum.com',
    languages: {
      'en': 'https://copydrum.com',
      'ko': 'https://copydrum.com/ko',
      'ja': 'https://copydrum.com/ja',
      'de': 'https://copydrum.com/de',
      'es': 'https://copydrum.com/es',
      'fr': 'https://copydrum.com/fr',
      'hi': 'https://copydrum.com/hi',
      'id': 'https://copydrum.com/id',
      'it': 'https://copydrum.com/it',
      'pt': 'https://copydrum.com/pt',
      'ru': 'https://copydrum.com/ru',
      'th': 'https://copydrum.com/th',
      'tr': 'https://copydrum.com/tr',
      'uk': 'https://copydrum.com/uk',
      'vi': 'https://copydrum.com/vi',
      'zh-Hans': 'https://copydrum.com/zh-cn',
      'zh-Hant': 'https://copydrum.com/zh-tw',
      'x-default': 'https://copydrum.com',
    },
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get locale from middleware-set header (priority) or cookie (fallback)
  const headersList = await headers();
  const cookieStore = await cookies();

  const localeFromHeader = headersList.get('x-locale');
  const localeFromCookie = cookieStore.get('locale')?.value;
  const locale = localeFromHeader || localeFromCookie || 'en';

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          as="style"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css"
        />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <Providers locale={locale}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
