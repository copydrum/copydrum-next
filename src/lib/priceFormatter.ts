import { isKoreanSiteHost, isJapaneseSiteHost } from '../config/hostType';

const ENV_USD_RATE = Number(process.env.NEXT_PUBLIC_DEFAULT_USD_RATE);
export const DEFAULT_USD_RATE = Number.isFinite(ENV_USD_RATE) && ENV_USD_RATE > 0 ? ENV_USD_RATE : 0.00077; // ≈ KRW → USD (1 USD ≈ 1,300 KRW)
export const DEFAULT_JPY_RATE = 0.11; // ≈ KRW → JPY (1 KRW ≈ 0.11 JPY)

export interface FormatPriceOptions {
  amountKRW: number | null | undefined;
  usdRate?: number;
  jpyRate?: number;
  currencyMode?: 'auto' | 'krw' | 'usd' | 'jpy';
  locale?: string;
  host?: string;
  language?: string;
}

export interface FormatPriceResult {
  currency: 'KRW' | 'USD' | 'JPY';
  amount: number;
  formatted: string;
  isKRW: boolean;
}

const DEFAULTS = {
  localeKR: 'ko-KR',
  localeUS: 'en-US',
  localeJP: 'ja-JP',
};

const getRuntimeUsdRate = () => {
  if (typeof window !== 'undefined') {
    const runtimeRate = Number((window as any).__USD_RATE__);
    if (Number.isFinite(runtimeRate) && runtimeRate > 0) {
      return runtimeRate;
    }
  }
  return undefined;
};

const resolveUsdRate = (overrideRate?: number) => {
  if (Number.isFinite(overrideRate) && overrideRate && overrideRate > 0) {
    return overrideRate;
  }
  const runtimeRate = getRuntimeUsdRate();
  if (Number.isFinite(runtimeRate) && runtimeRate && runtimeRate > 0) {
    return runtimeRate;
  }
  return DEFAULT_USD_RATE;
};

const resolveJpyRate = (overrideRate?: number) => {
  if (Number.isFinite(overrideRate) && overrideRate && overrideRate > 0) {
    return overrideRate;
  }
  return DEFAULT_JPY_RATE;
};

const getHost = (explicitHost?: string) => {
  if (explicitHost) return explicitHost;
  if (typeof window !== 'undefined') {
    return window.location.host;
  }
  return undefined;
};

const formatCurrency = (value: number, locale: string, currency: 'KRW' | 'USD' | 'JPY') =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KRW' || currency === 'JPY' ? 0 : 2,
  }).format(value);

export const formatPrice = ({
  amountKRW,
  usdRate,
  jpyRate,
  currencyMode = 'auto',
  locale,
  host,
  language,
}: FormatPriceOptions): FormatPriceResult => {
  const safeAmount = Number(amountKRW ?? 0);
  const resolvedHost = getHost(host);

  // 일본어 사이트 체크
  const isJapaneseContext = language === 'ja' || (!language && isJapaneseSiteHost(resolvedHost || ''));

  // 언어가 영어이거나 글로벌 사이트이고 currencyMode가 auto일 때는 달러 사용
  const isGlobalContext = language?.startsWith('en') || (!language && typeof window !== 'undefined' && !isKoreanSiteHost(resolvedHost || '') && !isJapaneseContext);

  const shouldUseKRW =
    currencyMode === 'krw' ||
    (currencyMode === 'auto' && !isGlobalContext && !isJapaneseContext && isKoreanSiteHost(resolvedHost || ''));

  const shouldUseJPY =
    currencyMode === 'jpy' ||
    (currencyMode === 'auto' && isJapaneseContext);

  if (shouldUseKRW) {
    return {
      currency: 'KRW',
      amount: safeAmount,
      formatted: formatCurrency(safeAmount, locale ?? DEFAULTS.localeKR, 'KRW'),
      isKRW: true,
    };
  }

  if (shouldUseJPY) {
    const appliedJpyRate = resolveJpyRate(jpyRate);
    const jpyAmountRaw = safeAmount * appliedJpyRate;
    const jpyAmount = Math.round(jpyAmountRaw); // JPY is usually integer

    return {
      currency: 'JPY',
      amount: jpyAmount,
      formatted: formatCurrency(jpyAmount, locale ?? DEFAULTS.localeJP, 'JPY'),
      isKRW: false,
    };
  }

  const appliedUsdRate = resolveUsdRate(usdRate);
  const usdAmountRaw = safeAmount * appliedUsdRate;
  const usdAmount = Math.round(usdAmountRaw * 100) / 100; // round to cents

  return {
    currency: 'USD',
    amount: usdAmount,
    formatted: formatCurrency(usdAmount, locale ?? DEFAULTS.localeUS, 'USD'),
    isKRW: false,
  };
};

export const getCurrencySymbol = (currency: 'KRW' | 'USD' | 'JPY') => {
  if (currency === 'KRW') return '₩';
  if (currency === 'JPY') return '¥';
  return '$';
};

// USD를 KRW로 변환
export const convertUSDToKRW = (usdAmount: number, usdRate?: number): number => {
  const rate = resolveUsdRate(usdRate);
  return Math.round(usdAmount / rate);
};

// KRW를 USD로 변환
export const convertKRWToUSD = (krwAmount: number, usdRate?: number): number => {
  const rate = resolveUsdRate(usdRate);
  return Math.round(krwAmount * rate * 100) / 100;
};

// KRW를 JPY로 변환
export const convertKRWToJPY = (krwAmount: number, jpyRate?: number): number => {
  const rate = resolveJpyRate(jpyRate);
  return Math.round(krwAmount * rate);
};

