'use client';

import { useMemo } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { pathToLanguageCode } from '@/i18n/languages';

/**
 * 서버 렌더링에서도 URL의 [locale] 언어로 번역하도록 i18n 인스턴스를 공급한다.
 * - 전역 i18n은 서버에서 항상 기본 언어('en')로 초기화되므로, 그대로 쓰면
 *   서버 HTML("Home")과 클라이언트 첫 렌더("홈")가 달라 하이드레이션 경고가 난다.
 * - 서버 i18n 인스턴스는 요청 간에 공유되므로 changeLanguage 대신 렌더별 clone을 사용한다.
 */
export default function LocaleI18nProvider({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  const instance = useMemo(() => {
    if (typeof window !== 'undefined') return i18n;
    const lng = pathToLanguageCode[locale.toLowerCase()] ?? locale;
    return i18n.cloneInstance({ lng });
  }, [locale]);

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
