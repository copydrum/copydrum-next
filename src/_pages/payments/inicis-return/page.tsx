'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { approveInicisPayment } from '../../../lib/payments/inicis';

export default function InicisReturnPage() {
  const searchParams = useSearchParams();
  const router = useLocaleRouter();
  const [processing, setProcessing] = useState(true);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    resultCode?: string;
    resultMsg?: string;
    tid?: string;
    MOID?: string;
    TotPrice?: string;
    goodName?: string;
    applDate?: string;
    applTime?: string;
  } | null>(null);

  useEffect(() => {
    const processPaymentReturn = async () => {
      try {
        // KG이니시스 GET 전달 방식 사용 (관리자 콘솔에서 활성화)
        // GET 파라미터로 결제 결과 데이터 수신
        const resultCode = searchParams.get('resultCode') || '';
        const mid = searchParams.get('mid') || '';
        const authToken = searchParams.get('authToken') || '';
        const idcName = searchParams.get('idc_name') || '';
        const authUrl = searchParams.get('authUrl') || '';
        const netCancelUrl = searchParams.get('netCancelUrl') || '';
        const MOID = searchParams.get('MOID') || searchParams.get('oid') || '';
        const TotPrice = searchParams.get('TotPrice') || '';
        const goodName = searchParams.get('goodName') || '';
        const resultMsg = searchParams.get('resultMsg') || '';

        // sessionStorage에서 저장된 주문 정보 확인 (MOID가 없는 경우 대비)
        const savedOrderId = sessionStorage.getItem('inicis_order_id');
        const orderId = MOID || savedOrderId || '';

        // resultCode가 없으면 에러
        if (!resultCode) {
          setResult({
            success: false,
            message: '결제 정보를 받을 수 없습니다.',
          });
          setProcessing(false);
          return;
        }

        // resultCode가 "0000"이 아니면 실패
        if (resultCode !== '0000') {
          setResult({
            success: false,
            message: resultMsg || '결제가 취소되었거나 실패했습니다.',
            resultCode,
            resultMsg,
            MOID,
            TotPrice,
            goodName,
          });
          setProcessing(false);
          return;
        }

        if (!orderId) {
          setResult({
            success: false,
            message: '주문 정보를 찾을 수 없습니다.',
          });
          setProcessing(false);
          return;
        }

        // 승인 요청
        const approveResult = await approveInicisPayment({
          orderId,
          authToken,
          idcName,
          authUrl,
          amount: TotPrice ? Number(TotPrice) : undefined,
          rawResponse: {
            resultCode,
            mid,
            authToken,
            idcName,
            authUrl,
            MOID,
            TotPrice,
            goodName,
            resultMsg,
          },
        });

        if (approveResult && 'data' in approveResult) {
          // sessionStorage 정리
          sessionStorage.removeItem('inicis_order_id');
          
          setResult({
            success: true,
            message: '결제가 완료되었습니다.',
            resultCode: approveResult.data?.resultCode,
            resultMsg: approveResult.data?.resultMsg,
            tid: approveResult.data?.tid,
            MOID: approveResult.data?.MOID,
            TotPrice: approveResult.data?.TotPrice?.toString(),
            goodName: approveResult.data?.goodName,
            applDate: approveResult.data?.applDate,
            applTime: approveResult.data?.applTime,
          });
        } else {
          setResult({
            success: false,
            message: '결제 승인 처리 중 오류가 발생했습니다.',
          });
        }
      } catch (error) {
        console.error('결제 반환 처리 오류:', error);
        setResult({
          success: false,
          message: error instanceof Error ? error.message : '결제 처리 중 오류가 발생했습니다.',
        });
      } finally {
        setProcessing(false);
      }
    };

    processPaymentReturn();
  }, [searchParams]);

  const handleGoToOrders = () => {
    router.push('/my-orders');
  };

  const handleGoToHome = () => {
    router.push('/');
  };

  if (processing) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">결제 처리 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
        {result?.success ? (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">결제 완료</h2>
              <p className="text-gray-600">{result.message}</p>
            </div>

            {result.goodName && (
              <div className="border-t border-gray-200 pt-4 mb-4">
                <dl className="space-y-2">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">상품명</dt>
                    <dd className="text-sm text-gray-900">{result.goodName}</dd>
                  </div>
                  {result.TotPrice && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">결제금액</dt>
                      <dd className="text-sm text-gray-900">
                        {Number(result.TotPrice).toLocaleString('ko-KR')}원
                      </dd>
                    </div>
                  )}
                  {result.applDate && result.applTime && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">결제일시</dt>
                      <dd className="text-sm text-gray-900">
                        {result.applDate} {result.applTime}
                      </dd>
                    </div>
                  )}
                  {result.tid && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">거래번호</dt>
                      <dd className="text-sm text-gray-900 font-mono">{result.tid}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={handleGoToOrders}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                주문 내역 보기
              </button>
              <button
                onClick={handleGoToHome}
                className="w-full bg-gray-200 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                홈으로 이동
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">결제 실패</h2>
              <p className="text-gray-600">{result?.message || '결제 처리 중 오류가 발생했습니다.'}</p>
            </div>

            {result?.resultCode && (
              <div className="border-t border-gray-200 pt-4 mb-4">
                <dl className="space-y-2">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">오류코드</dt>
                    <dd className="text-sm text-gray-900">{result.resultCode}</dd>
                  </div>
                  {result.resultMsg && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">오류메시지</dt>
                      <dd className="text-sm text-gray-900">{result.resultMsg}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={handleGoToHome}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                홈으로 이동
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

