'use client';

import { useEffect } from 'react';
import i18n from '@/i18n';

/**
 * URL의 [locale] 파라미터를 i18n 라이브러리에 강제 동기화하는 컴포넌트.
 * - 루트 레이아웃의 Providers가 헤더/쿠키 기반으로 i18n을 설정하지만,
 *   미들웨어가 없는 환경에서는 기본값('en')으로 초기화됨.
 * - 이 컴포넌트가 URL 경로의 locale을 i18n에 덮어씌워서 정확한 언어를 보장함.
 */
export default function LocaleSync({ locale }: { locale: string }) {
  useEffect(() => {
    if (locale && i18n.language !== locale) {
      i18n.changeLanguage(locale);
    }
  }, [locale]);

  return null;
}
