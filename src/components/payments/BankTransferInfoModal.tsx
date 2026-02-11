import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSiteCurrency, convertFromKrw, formatCurrency as formatCurrencyUtil } from '../../lib/currency';

interface BankTransferInfoModalProps {
  open: boolean;
  amount: number;
  userName?: string | null;
  onConfirm: (depositorName: string) => void;
  onClose: () => void;
  processing?: boolean;
  orderCreated?: boolean;
  successMessage?: string;
}

export const BankTransferInfoModal = ({
  open,
  amount,
  userName: _userName, // 사용하지 않음
  onConfirm,
  onClose,
  processing = false,
  orderCreated = false,
  successMessage,
}: BankTransferInfoModalProps) => {
  const [depositorName, setDepositorName] = useState(''); // 자동 입력 제거
  const { i18n, t } = useTranslation();

  useEffect(() => {
    if (open) {
      setDepositorName(''); // 모달 열릴 때마다 초기화
    }
  }, [open]);

  if (!open) return null;

  // 통화 결정 (locale 기반)
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'copydrum.com';
  const currency = getSiteCurrency(hostname, i18n.language);
  const formatCurrency = (value: number) => {
    const convertedAmount = convertFromKrw(value, currency);
    return formatCurrencyUtil(convertedAmount, currency);
  };

  const handleConfirm = () => {
    // 필수값 검증
    if (!depositorName.trim()) {
      alert('입금자명을 입력해 주세요.');
      return;
    }

    // 금액 검증
    if (!amount || amount <= 0) {
      alert('입금하실 금액이 올바르지 않습니다.');
      return;
    }

    // 처리 중이면 중복 클릭 방지
    if (processing) {
      return;
    }

    onConfirm(depositorName);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">무통장 입금 안내</h2>
        </div>

        <div className="px-5 py-6 space-y-5">
          {/* 입금 금액 */}
          <div className="bg-blue-50 rounded-lg px-4 py-3 border border-blue-200">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">입금하실 금액</span>
              <span className="text-lg font-bold text-blue-600">{formatCurrency(amount)}</span>
            </div>
          </div>

          {/* 입금 계좌 정보 */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">입금 계좌 정보</h3>
            <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">은행</span>
                <span className="text-sm font-medium text-gray-900">카카오뱅크</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">계좌번호</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">3333-15-0302437</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText('3333-15-0302437');
                      alert('계좌번호가 복사되었습니다.');
                    }}
                    className="text-blue-600 hover:text-blue-800"
                    title="계좌번호 복사"
                  >
                    <i className="ri-file-copy-line"></i>
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">예금주</span>
                <span className="text-sm font-medium text-gray-900">강만수</span>
              </div>
            </div>
          </div>

          {/* 입금자명 입력 */}
          {!orderCreated && (
            <div className="space-y-2">
              <label htmlFor="depositor-name" className="block text-sm font-semibold text-gray-900">
                입금자명 <span className="text-red-500">*</span>
              </label>
              <input
                id="depositor-name"
                type="text"
                value={depositorName}
                onChange={(e) => setDepositorName(e.target.value)}
                placeholder="입금자명을 입력하세요"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500">
                * 회원명과 입금자가 다른 경우, 입금자명을 기입해 주시기 바랍니다.
              </p>
            </div>
          )}

          {/* 주문 생성 성공 메시지 */}
          {orderCreated && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <div className="flex gap-2">
                <i className="ri-checkbox-circle-line text-green-600 text-lg flex-shrink-0"></i>
                <div className="text-sm text-gray-700">
                  <p className="font-semibold text-green-900 mb-1">
                    {successMessage || '무통장입금 계좌가 생성되었습니다. 입금을 완료해주세요.'}
                  </p>
                  <p className="text-xs text-gray-600">
                    입금 확인 후 관리자가 수동으로 구매를 완료 처리합니다.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 안내 문구 */}
          {!orderCreated && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
              <div className="flex gap-2">
                <i className="ri-information-line text-yellow-600 text-lg flex-shrink-0"></i>
                <div className="text-xs text-gray-700 space-y-1">
                  <p>• 입금 확인 후 관리자가 수동으로 구매를 완료 처리합니다.</p>
                  <p>• 입금자명이 일치하지 않으면 확인이 지연될 수 있습니다.</p>
                  <p>• 입금 확인은 영업일 기준 1~2일 소요될 수 있습니다.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 px-5 py-4 flex justify-end space-x-2">
          {orderCreated ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              확인
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={processing}
                className={`rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors ${
                  processing ? 'opacity-60 cursor-not-allowed' : ''
                }`}
              >
                {processing ? '처리 중...' : '확인'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

