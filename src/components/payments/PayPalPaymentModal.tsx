import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getSiteCurrency, convertFromKrw, formatCurrency as formatCurrencyUtil } from '../../lib/currency';
import { isMobileDevice } from '../../utils/device';

interface PayPalPaymentModalProps {
    open: boolean;
    amount: number;
    orderTitle: string;
    onClose: () => void;
    onSuccess: (response: any) => void;
    onError: (error: any) => void;
    initiatePayment: (elementId: string) => Promise<void>;
}

export default function PayPalPaymentModal({
    open,
    amount,
    orderTitle,
    onClose,
    onSuccess,
    onError,
    initiatePayment,
}: PayPalPaymentModalProps) {
    const { t, i18n } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Use fixed container ID - must match portone.ts
    const containerId = 'portone-ui-container';
    const initializedRef = useRef(false);

    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'copydrum.com';
    const currency = useMemo(() => getSiteCurrency(hostname, i18n.language), [hostname, i18n.language]);

    const formatCurrency = useCallback((value: number) => {
        const converted = convertFromKrw(value, currency);
        return formatCurrencyUtil(converted, currency);
    }, [currency]);

    const loadPayPalButtons = useCallback(async () => {
        if (!open || initializedRef.current) return;

        // 모바일 디바이스 감지
        const isMobile = isMobileDevice();

        // 초기화 시작 즉시 플래그 설정하여 중복 호출 방지
        initializedRef.current = true;
        setLoading(true);
        setError(null);

        try {
            // DOM 렌더링 확보를 위한 지연
            await new Promise(resolve => setTimeout(resolve, 0));

            console.log('[PayPalPaymentModal] Props on open:', {
                amount,
                orderTitle,
                open,
                isMobile,
            });

            // 모바일: REDIRECTION 방식 (버튼 클릭 시 리다이렉트)
            // PC: POPUP 방식
            const container = document.querySelector('.portone-ui-container');
            console.log('[PayPalPaymentModal] Container check:', {
                containerId,
                found: !!container,
                innerHTML: container?.innerHTML?.substring(0, 100),
            });

            if (!container) {
                throw new Error(`Container element .portone-ui-container not found`);
            }

            // Check for duplicate containers
            const allContainers = document.querySelectorAll('.portone-ui-container');
            if (allContainers.length > 1) {
                console.warn(`[PayPalPaymentModal] Warning: Found ${allContainers.length} containers with class="portone-ui-container"`);
            }

            await initiatePayment(containerId);

            // Check container content after loadPaymentUI
            setTimeout(() => {
                const el = document.querySelector('.portone-ui-container');
                console.log('[PayPalPaymentModal] After loadPaymentUI innerHTML:', {
                    found: !!el,
                    innerHTML: el?.innerHTML?.substring(0, 200),
                    hasContent: !!el?.innerHTML && el.innerHTML.length > 0,
                });
            }, 1000);

            setLoading(false);
        } catch (err) {
            console.error('PayPal initialization failed:', err);
            setError(err instanceof Error ? err.message : 'Failed to load PayPal buttons');
            onError(err);
            // 실패 시 재시도 가능하도록 플래그 초기화
            initializedRef.current = false;
            setLoading(false);
        }
    }, [open, initiatePayment, onError, containerId, onClose]);

    useEffect(() => {
        if (open) {
            const el = document.querySelector('.portone-ui-container');
            console.log('[PayPalPaymentModal] Container check on mount:', {
                found: !!el,
                innerHTML: el?.innerHTML?.substring(0, 100),
            });
            loadPayPalButtons();
        } else {
            initializedRef.current = false;
        }
    }, [open, loadPayPalButtons]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden">
                <div className="border-b border-gray-200 px-5 py-4 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-gray-900">{t('payments.modalTitle')}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <i className="ri-close-line text-xl"></i>
                    </button>
                </div>

                <div className="px-5 py-6">
                    <div className="mb-6 text-center">
                        <p className="text-sm text-gray-600 mb-1">{orderTitle}</p>
                        <p className="text-2xl font-bold text-gray-900">{formatCurrency(amount)}</p>
                    </div>

                    {error ? (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center text-red-600 text-sm mb-4">
                            {error}
                            <button
                                onClick={onClose}
                                className="block w-full mt-3 px-4 py-2 bg-white border border-red-300 rounded text-red-700 hover:bg-red-50"
                            >
                                {t('button.close')}
                            </button>
                        </div>
                    ) : (
                        <div className="min-h-[150px] flex flex-col items-center justify-center relative">
                            {loading && (
                                <div className="absolute flex flex-col items-center z-10">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                                    <p className="text-sm text-gray-500">{t('payments.loadingPayPal')}</p>
                                </div>
                            )}
                            {/* PortOne SDK PayPal container - must have class and visible */}
                            <div
                                id={containerId}
                                className="portone-ui-container"
                                style={{ width: '100%', minHeight: '45px' }}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
