/**
 * 디바이스 감지 유틸리티 함수
 */

/**
 * 모바일 디바이스인지 확인
 * @returns 모바일 디바이스이면 true, 아니면 false
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // 1. 화면 너비로 판단 (768px 이하를 모바일로 간주)
  if (window.innerWidth <= 768) {
    return true;
  }

  // 2. User Agent로 판단
  const userAgent = window.navigator.userAgent.toLowerCase();
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
  
  if (mobileRegex.test(userAgent)) {
    return true;
  }

  // 3. 터치 스크린 지원 여부로 판단 (보조 지표)
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    // 터치 스크린이 있어도 화면이 크면 데스크톱으로 간주
    if (window.innerWidth > 1024) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * 태블릿 디바이스인지 확인
 * @returns 태블릿이면 true, 아니면 false
 */
export function isTabletDevice(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  const tabletRegex = /ipad|android(?!.*mobile)|tablet/i;
  
  return tabletRegex.test(userAgent) && window.innerWidth > 768 && window.innerWidth <= 1024;
}

/**
 * 데스크톱 디바이스인지 확인
 * @returns 데스크톱이면 true, 아니면 false
 */
export function isDesktopDevice(): boolean {
  return !isMobileDevice() && !isTabletDevice();
}

