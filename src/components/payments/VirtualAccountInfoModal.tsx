import { useTranslation } from 'react-i18next';
import { getSiteCurrency, convertFromKrw, formatCurrency as formatCurrencyUtil } from '../../lib/currency';
import type { VirtualAccountInfo } from '../../lib/payments/types';

interface VirtualAccountInfoModalProps {
  open: boolean;
  amount: number;
  virtualAccountInfo: VirtualAccountInfo | null;
  onClose: () => void;
}

export const VirtualAccountInfoModal = ({
  open,
  amount,
  virtualAccountInfo,
  onClose,
}: VirtualAccountInfoModalProps) => {
  const { i18n } = useTranslation();

  if (!open || !virtualAccountInfo) return null;

  // 통화 결정 (locale 기반)
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'copydrum.com';
  const currency = getSiteCurrency(hostname, i18n.language);
  const formatCurrency = (value: number) => {
    const convertedAmount = convertFromKrw(value, currency);
    return formatCurrencyUtil(convertedAmount, currency);
  };

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">가상계좌 발급 완료</h2>
        </div>

        <div className="px-5 py-6 space-y-5">
          {/* 발급 완료 메시지 */}
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <div className="flex gap-2">
              <i className="ri-checkbox-circle-line text-green-600 text-lg flex-shrink-0"></i>
              <div className="text-sm text-gray-700">
                <p className="font-semibold text-green-900 mb-1">가상계좌 발급이 완료되었습니다.</p>
                <p className="text-xs text-gray-600">아래 계좌로 입금해주시면 자동으로 결제가 완료됩니다.</p>
              </div>
            </div>
          </div>

          {/* 입금 금액 */}
          <div className="bg-blue-50 rounded-lg px-4 py-3 border border-blue-200">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">입금하실 금액</span>
              <span className="text-lg font-bold text-blue-600">{formatCurrency(amount)}</span>
            </div>
          </div>

          {/* 가상계좌 정보 */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">가상계좌 정보</h3>
            <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-2">
              {virtualAccountInfo.bankName && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">은행</span>
                  <span className="text-sm font-medium text-gray-900">{virtualAccountInfo.bankName}</span>
                </div>
              )}
              {virtualAccountInfo.accountNumber && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">계좌번호</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{virtualAccountInfo.accountNumber}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(virtualAccountInfo.accountNumber || '');
                        alert('계좌번호가 복사되었습니다.');
                      }}
                      className="text-blue-600 hover:text-blue-800"
                      title="계좌번호 복사"
                    >
                      <i className="ri-file-copy-line"></i>
                    </button>
                  </div>
                </div>
              )}
              {virtualAccountInfo.accountHolder && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">예금주</span>
                  <span className="text-sm font-medium text-gray-900">{virtualAccountInfo.accountHolder}</span>
                </div>
              )}
              {virtualAccountInfo.expiresAt && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">입금 기한</span>
                  <span className="text-sm font-medium text-gray-900">
                    {new Date(virtualAccountInfo.expiresAt).toLocaleString('ko-KR')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 안내 문구 */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
            <div className="flex gap-2">
              <i className="ri-information-line text-yellow-600 text-lg flex-shrink-0"></i>
              <div className="text-xs text-gray-700 space-y-1">
                <p>• 입금 확인 후 자동으로 결제가 완료됩니다.</p>
                <p>• 입금 기한 내에 입금하지 않으면 주문이 자동 취소됩니다.</p>
                <p>• 입금 확인은 영업일 기준 1~2일 소요될 수 있습니다.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 px-5 py-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
};

