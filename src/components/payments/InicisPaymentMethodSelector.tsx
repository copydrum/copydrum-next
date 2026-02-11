import { useState } from 'react';

type InicisPayMethod = 'CARD' | 'VIRTUAL_ACCOUNT' | 'TRANSFER';

interface InicisPaymentMethodSelectorProps {
  open: boolean;
  amount: number;
  onClose: () => void;
  onSelect: (payMethod: InicisPayMethod) => void;
}

export type { InicisPayMethod };

// KG이니시스 결제 수단 상수 데이터
const PAYMENT_METHODS = [
  { value: 'CARD' as const, label: '신용카드', description: '신용카드로 결제', icon: 'ri-bank-card-line' },
  { value: 'VIRTUAL_ACCOUNT' as const, label: '무통장입금 (가상계좌)', description: '가상계좌로 입금', icon: 'ri-bank-line' },
  { value: 'TRANSFER' as const, label: '실시간 계좌이체', description: '실시간 계좌이체로 결제', icon: 'ri-exchange-line' },
];

export const InicisPaymentMethodSelector = ({
  open,
  amount,
  onClose,
  onSelect,
}: InicisPaymentMethodSelectorProps) => {
  const [selectedMethod, setSelectedMethod] = useState<InicisPayMethod>('CARD');

  if (!open) return null;

  const handleConfirm = () => {
    onSelect(selectedMethod);
  };

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">KG이니시스 결제 수단 선택</h2>
          <div className="mt-1">
            <p className="text-sm text-gray-600">
              결제 금액 <span className="font-semibold text-gray-900">{amount.toLocaleString()}원</span>
            </p>
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="space-y-3">
            {PAYMENT_METHODS.map((method) => (
              <label
                key={method.value}
                className={`flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3 transition-colors ${
                  selectedMethod === method.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    name="inicisPayMethod"
                    value={method.value}
                    checked={selectedMethod === method.value}
                    onChange={() => setSelectedMethod(method.value)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                  />
                  <i className={`${method.icon} text-blue-600 text-xl`}></i>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{method.label}</p>
                    <p className="text-xs text-gray-500">{method.description}</p>
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div className="mt-6 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

