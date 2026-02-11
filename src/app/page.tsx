'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Detect locale from browser
    const browserLang = navigator.language.toLowerCase();
    let locale = 'en';

    if (browserLang.includes('ko')) {
      locale = 'ko';
    } else if (browserLang.includes('ja')) {
      locale = 'ja';
    } else if (browserLang.includes('de')) {
      locale = 'de';
    } else if (browserLang.includes('es')) {
      locale = 'es';
    } else if (browserLang.includes('fr')) {
      locale = 'fr';
    } else if (browserLang.includes('zh-cn')) {
      locale = 'zh-cn';
    } else if (browserLang.includes('zh-tw')) {
      locale = 'zh-tw';
    }

    router.replace(`/${locale}`);
  }, [router]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div>Loading...</div>
    </div>
  );
}
