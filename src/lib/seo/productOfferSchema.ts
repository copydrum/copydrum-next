/**
 * Google Merchant listing용 Offer 보조 스키마.
 * PDF 디지털 상품: 배송비 0 · 즉시 다운로드, 환불은 사이트 정책(/policy/refund)과 동일.
 * @see https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
 */

/** i18n locale → ISO 3166-1 alpha-2 (Offer 대상 국가) */
const LOCALE_TO_COUNTRY: Record<string, string> = {
  en: 'US',
  ko: 'KR',
  ja: 'JP',
  'zh-CN': 'CN',
  'zh-TW': 'TW',
  de: 'DE',
  fr: 'FR',
  es: 'ES',
  vi: 'VN',
  th: 'TH',
  hi: 'IN',
  id: 'ID',
  pt: 'PT',
  ru: 'RU',
  it: 'IT',
  tr: 'TR',
  uk: 'UA',
};

/** 미다운로드 시 환불 가능 기간(일) — refundPolicy.json 과 동일 */
const MERCHANT_RETURN_DAYS = 7;

export interface DigitalOfferMerchantExtras {
  hasMerchantReturnPolicy: {
    '@type': 'MerchantReturnPolicy';
    applicableCountry: string;
    returnPolicyCategory: string;
    merchantReturnDays: number;
    returnFees: string;
    url: string;
  };
  shippingDetails: {
    '@type': 'OfferShippingDetails';
    shippingRate: {
      '@type': 'MonetaryAmount';
      value: number;
      currency: string;
    };
    shippingDestination: {
      '@type': 'DefinedRegion';
      addressCountry: string;
    };
    deliveryTime: {
      '@type': 'ShippingDeliveryTime';
      handlingTime: {
        '@type': 'QuantitativeValue';
        minValue: number;
        maxValue: number;
        unitCode: 'DAY';
      };
      transitTime: {
        '@type': 'QuantitativeValue';
        minValue: number;
        maxValue: number;
        unitCode: 'DAY';
      };
    };
  };
}

/**
 * 디지털 PDF Offer에 Google Merchant listing 권장 필드를 붙인다.
 */
export function buildDigitalOfferMerchantExtras(
  offerCurrency: string,
  locale: string,
  refundPolicyUrl: string,
): DigitalOfferMerchantExtras {
  const addressCountry = LOCALE_TO_COUNTRY[locale] ?? 'US';

  return {
    hasMerchantReturnPolicy: {
      '@type': 'MerchantReturnPolicy',
      applicableCountry: addressCountry,
      returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
      merchantReturnDays: MERCHANT_RETURN_DAYS,
      returnFees: 'https://schema.org/FreeReturn',
      url: refundPolicyUrl,
    },
    shippingDetails: {
      '@type': 'OfferShippingDetails',
      shippingRate: {
        '@type': 'MonetaryAmount',
        value: 0,
        currency: offerCurrency,
      },
      shippingDestination: {
        '@type': 'DefinedRegion',
        addressCountry,
      },
      deliveryTime: {
        '@type': 'ShippingDeliveryTime',
        // 결제 후 즉시 다운로드(디지털 제공)
        handlingTime: {
          '@type': 'QuantitativeValue',
          minValue: 0,
          maxValue: 0,
          unitCode: 'DAY',
        },
        transitTime: {
          '@type': 'QuantitativeValue',
          minValue: 0,
          maxValue: 0,
          unitCode: 'DAY',
        },
      },
    },
  };
}
