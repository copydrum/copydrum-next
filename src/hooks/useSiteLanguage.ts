import { useTranslation } from 'react-i18next';

/**
 * 현재 사이트의 언어를 기반으로 한국어 사이트인지 확인하는 훅
 * @returns {boolean} 한국어 사이트인 경우 true, 그렇지 않으면 false (글로벌 사이트)
 */
export function useSiteLanguage() {
  const { i18n } = useTranslation();
  
  // i18n.language가 'ko'이면 한국어 사이트
  const isKoreanSite = i18n.language === 'ko';
  
  return {
    isKoreanSite,
    language: i18n.language,
  };
}

