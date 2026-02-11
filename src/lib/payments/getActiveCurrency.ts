import i18n from '../../i18n';
import { getCurrencyFromLocale, currencyByLocale } from '../../config/currencyByLocale';
import type { SupportedCurrency } from '../../config/currencyByLocale';

export function getActiveCurrency(): SupportedCurrency {
    // i18n.language가 초기화되지 않았거나 유효하지 않을 경우를 대비해 방어 코드 추가
    const currentLang = i18n.language;

    // currencyByLocale 키에 해당하는지 확인
    if (currentLang && currentLang in currencyByLocale) {
        return getCurrencyFromLocale(currentLang as keyof typeof currencyByLocale);
    }

    // 기본값은 USD (안전장치)
    // 단, 한국어 호스트인 경우 KRW가 되어야 하는데,
    // i18n.language가 'ko'로 잘 설정되어 있다면 위 조건문에서 처리됨.
    // 만약 i18n이 아직 로드되지 않은 시점이라면 window.location.host 체크 등 추가 로직이 필요할 수 있으나,
    // 현재 결제 시점은 이미 앱이 로드된 후이므로 i18n.language를 신뢰함.

    return 'USD';
}
