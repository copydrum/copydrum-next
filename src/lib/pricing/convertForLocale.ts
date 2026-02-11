import { DEFAULT_USD_RATE, convertKRWToUSD } from '../priceFormatter';
import type { SupportedCurrency } from '../../config/currencyByLocale';

/**
 * Converts a KRW amount to the target currency based on locale.
 * 
 * @param amountKRW The base amount in KRW
 * @param locale The current locale (e.g., 'en', 'ja', 'ko')
 * @param currency The target currency (e.g., 'USD', 'JPY', 'KRW')
 * @returns The converted amount
 */
export function convertPriceForLocale(
    amountKRW: number,
    locale: string,
    currency: SupportedCurrency
): number {
    if (currency === 'KRW') {
        return amountKRW;
    }

    if (currency === 'USD') {
        return convertKRWToUSD(amountKRW, DEFAULT_USD_RATE);
    }

    if (currency === 'JPY') {
        // 1 KRW approx 0.11 JPY (100 JPY approx 900 KRW)
        // This is a fixed rate for now. In the future, we might want to fetch this dynamically.
        const JPY_RATE = 0.11;
        return Math.floor(amountKRW * JPY_RATE);
    }

    // Default fallback to KRW if currency is unknown
    return amountKRW;
}
