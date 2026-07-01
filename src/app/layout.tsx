import type { Metadata } from 'next';
import Script from 'next/script';
import { cookies, headers } from 'next/headers';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: {
    default: 'COPYDRUM | High-Quality Drum Sheet Music Store',
    template: '%s | COPYDRUM',
  },
  description: 'High-quality drum sheet music and drum scores for pop, rock, K-POP, CCM and more. Download professional drum notation for your favorite songs.',
  metadataBase: new URL('https://www.copydrum.com'),
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    siteName: 'COPYDRUM',
    type: 'website',
  },
  verification: {
    google: 'google-site-verification=-rcYbyDQYm1eyHBKXEXCjdyrVhmzA3fnVzorZTx1CUg',
    other: {
      'p:domain_verify': '9e40cd0675293ed6bb3bc9006a2a9a46',
    },
  },
  alternates: {
    canonical: 'https://www.copydrum.com',
    languages: {
      'en': 'https://www.copydrum.com/en',
      'ko': 'https://www.copydrum.com/ko',
      'ja': 'https://www.copydrum.com/ja',
      'de': 'https://www.copydrum.com/de',
      'es': 'https://www.copydrum.com/es',
      'fr': 'https://www.copydrum.com/fr',
      'hi': 'https://www.copydrum.com/hi',
      'id': 'https://www.copydrum.com/id',
      'it': 'https://www.copydrum.com/it',
      'pt': 'https://www.copydrum.com/pt',
      'ru': 'https://www.copydrum.com/ru',
      'th': 'https://www.copydrum.com/th',
      'tr': 'https://www.copydrum.com/tr',
      'uk': 'https://www.copydrum.com/uk',
      'vi': 'https://www.copydrum.com/vi',
      'zh-Hans': 'https://www.copydrum.com/zh-cn',
      'zh-Hant': 'https://www.copydrum.com/zh-tw',
      'x-default': 'https://www.copydrum.com/en',
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
        <Script
          id="google-adsense"
          strategy="beforeInteractive"
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9057801691949443"
          crossOrigin="anonymous"
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
