import { isGlobalSiteHost } from '../config/hostType';

/**
 * 현재 호스트가 글로벌 사이트(en, ja, vi 등)인지 확인합니다.
 * @param {string} host - 호스트 이름 (예: en.copydrum.com, localhost:3000)
 * @returns {boolean} 글로벌 사이트인 경우 true, 그렇지 않으면 false (한국 사이트)
 */
export const isGlobalSite = (host: string) => {
  if (!host) return false;

  // isGlobalSiteHost 함수를 사용하여 글로벌 사이트 여부 확인
  return isGlobalSiteHost(host);
};
