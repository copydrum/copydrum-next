import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getSiteCurrency } from '../lib/currency';

export interface SiteConfig {
    isPointSystemEnabled: boolean;
    isFreeSheetEnabled: boolean;
    isBundleEnabled: boolean;
    isEventEnabled: boolean;
    paymentMethods: ('bank' | 'paypal')[];
    currency: string;
}

export function useSiteConfig(): SiteConfig {
    const { i18n } = useTranslation();
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'copydrum.com';
    const currency = useMemo(() => getSiteCurrency(hostname, i18n.language), [hostname, i18n.language]);

    const paymentMethods: ('bank' | 'paypal')[] = useMemo(() => {
        return currency === 'KRW' ? ['bank'] : ['paypal'];
    }, [currency]);

    return {
        isPointSystemEnabled: false,
        isFreeSheetEnabled: false,
        isBundleEnabled: false,
        isEventEnabled: false,
        paymentMethods,
        currency,
    };
}
