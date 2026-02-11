export function formatCurrency(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency,
        }).format(amount);
    } catch (error) {
        // 통화 코드가 유효하지 않은 경우 등 예외 처리
        console.warn('[formatCurrency] Formatting failed', error);
        return `${amount} ${currency}`;
    }
}
