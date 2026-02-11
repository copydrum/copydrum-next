// 한국 전용 사이트인지 여부
export function isKoreanSiteHost(hostname: string): boolean {
    // 개발 환경에서 강제로 글로벌 모드로 테스트하고 싶은 경우
    if (process.env.NEXT_PUBLIC_FORCE_GLOBAL_SITE === 'true') {
        return false;
    }

    // 개발 환경: localhost, 127.0.0.1, 사설 IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    const isLocalDev =
        hostname.includes('localhost') ||
        hostname.includes('127.0.0.1') ||
        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname);

    if (isLocalDev) {
        // 브라우저 환경에서 쿼리 파라미터 확인
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const lang = params.get('lang');
            // lang 파라미터가 있고 'ko'가 아니면 글로벌 사이트로 취급
            if (lang && lang !== 'ko') {
                return false;
            }
        }
        return true;
    }

    return (
        hostname === 'copydrum.com' ||
        hostname === 'www.copydrum.com'
    );
}

// 글로벌 사이트(영문 + 다국어)인지 여부
export function isGlobalSiteHost(hostname: string): boolean {
    // 한국 사이트가 아니면 전부 글로벌로 취급
    if (isKoreanSiteHost(hostname)) return false;
    return true;
}

// (선택) 영어 사이트만 특정해서 보고 싶을 때용 (기존 호환성 위해 유지하되 사용 지양)
export function isEnglishSiteHost(hostname: string): boolean {
    return hostname === 'en.copydrum.com';
}

// 일본어 사이트인지 여부
export function isJapaneseSiteHost(hostname: string): boolean {
    return hostname === 'jp.copydrum.com' || hostname === 'ja.copydrum.com';
}
