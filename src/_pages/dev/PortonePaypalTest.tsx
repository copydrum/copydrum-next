import { useEffect, useRef } from 'react';
import { loadPaymentUI } from '@portone/browser-sdk/v2';

export default function PortonePaypalTest() {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // 유저가 제공한 정보
        const TEST_CHANNEL_KEY = 'channel-key-1530a3c5-16eb-44ff-bbb1-688cdde309af';
        // 유저가 제공한 Store ID
        const TEST_STORE_ID = 'store-21731740-b1df-492c-832a-8f38448d0ebd';

        // 환경 변수가 잘못 설정되어 있을 수 있으므로 테스트 값을 우선 사용
        const storeId = TEST_STORE_ID; // process.env.NEXT_PUBLIC_PORTONE_TEST_STORE_ID || TEST_STORE_ID;
        const channelKey = TEST_CHANNEL_KEY; // process.env.NEXT_PUBLIC_PORTONE_TEST_PAYPAL_CHANNEL_KEY || TEST_CHANNEL_KEY;

        if (!storeId || !channelKey) {
            console.error('[PortonePaypalTest] 설정 오류:', { storeId, channelKey });
            alert(`설정 오류: Store ID 또는 Channel Key가 없습니다.\nStore ID: ${storeId}\nChannel Key: ${channelKey}`);
            return;
        }

        if (!containerRef.current) {
            return;
        }

        const initPayment = async () => {
            try {
                const paymentId = `paypal-test-${Date.now()}`;
                const orderName = 'COPYDRUM PayPal 테스트 결제';
                const totalAmount = 100; // 1.00 USD (in cents)
                const currency = 'USD';
                const payMethod = 'PAYPAL';

                // loadPaymentUI는 동기 함수일 수도 있고 비동기일 수도 있음. 
                // SDK 버전에 따라 다를 수 있으므로 확인 필요.
                // portone.ts에서는 await 없이 사용함.
                // @ts-ignore: SDK 타입 정의 불일치 회피
                const paymentUI = await loadPaymentUI({
                    uiType: 'PAYPAL_SPB',
                    storeId,
                    channelKey,
                    paymentId,
                    orderName,
                    totalAmount,
                    currency,
                    payMethod,
                    // PayPal SPB는 element에 버튼을 렌더링함
                    element: '#portone-ui-container',
                    customer: {
                        fullName: 'Test User',
                        phoneNumber: '010-1234-5678',
                        email: 'test@example.com',
                    },
                    windowType: {
                        pc: 'IFRAME',
                        mobile: 'POPUP',
                    },
                    redirectUrl: window.location.href,
                    onPaymentSuccess: (response: any) => {
                        console.log('[PortonePaypalTest] 결제 성공', response);
                        alert('테스트 결제 성공: ' + JSON.stringify(response));
                    },
                    onPaymentFail: (error: any) => {
                        console.error('[PortonePaypalTest] 결제 실패', error);
                        alert('테스트 결제 실패: ' + (error.message || JSON.stringify(error)));
                    },
                });

                console.log('[PortonePaypalTest] paymentUI 로드 완료', paymentUI);

            } catch (error: any) {
                console.error('[PortonePaypalTest] 오류 발생', error);
                alert(`오류 발생: ${error.message || JSON.stringify(error)}`);
            }
        };

        initPayment();

        return () => {
            // Cleanup if needed
        };
    }, []);

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-2xl mx-auto">
                <h1 className="text-2xl font-bold text-gray-900 mb-4">
                    포트원 PayPal 테스트 페이지
                </h1>
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="mb-4 text-sm text-gray-600">
                        <p>Store ID: {process.env.NEXT_PUBLIC_PORTONE_TEST_STORE_ID || 'store-21731740-b1df-492c-832a-8f38448d0ebd'}</p>
                        <p>Channel Key: {process.env.NEXT_PUBLIC_PORTONE_TEST_PAYPAL_CHANNEL_KEY || 'channel-key-...'}</p>
                    </div>
                    <div id="portone-ui-container" ref={containerRef} className="portone-ui-container min-h-[200px] flex items-center justify-center border-2 border-dashed border-gray-200 rounded">
                        {/* 포트원 UI가 렌더링될 영역 */}
                        <p className="text-gray-400">결제 창이 여기에 표시되거나 팝업으로 뜹니다.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
