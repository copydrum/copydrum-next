'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface VirtualAccountInfo {
  bankName?: string | null;
  accountNumber?: string | null;
  accountHolder?: string | null;
  expiresAt?: string | null;
}

// PortOne V2 가 은행을 코드(KOOKMIN 등)로 줄 때 화면에 보일 이름
const BANK_NAMES: Record<string, string> = {
  KOOKMIN: 'KB국민은행',
  SHINHAN: '신한은행',
  WOORI: '우리은행',
  HANA: '하나은행',
  NONGHYUP: 'NH농협은행',
  LOCAL_NONGHYUP: '지역농축협',
  IBK: 'IBK기업은행',
  KDB: 'KDB산업은행',
  SUHYUP: '수협은행',
  STANDARD_CHARTERED: 'SC제일은행',
  CITI: '한국씨티은행',
  DAEGU: 'iM뱅크(대구)',
  BUSAN: '부산은행',
  KYONGNAM: '경남은행',
  KWANGJU: '광주은행',
  JEONBUK: '전북은행',
  JEJU: '제주은행',
  POST: '우체국',
  SAEMAUL: '새마을금고',
  SHINHYUP: '신협',
  KAKAO: '카카오뱅크',
  K_BANK: '케이뱅크',
  TOSS: '토스뱅크',
};

export const bankDisplayName = (bank?: string | null) => (bank ? BANK_NAMES[bank] ?? bank : '-');

interface VirtualAccountInfoCardProps {
  info: VirtualAccountInfo;
  amountLabel: string;
}

export default function VirtualAccountInfoCard({ info, amountLabel }: VirtualAccountInfoCardProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copyAccount = async () => {
    if (!info.accountNumber) return;
    try {
      await navigator.clipboard.writeText(info.accountNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 복사 권한이 없으면 무시 */
    }
  };

  const rows: { label: string; value: string; copy?: boolean }[] = [
    { label: t('checkout.cashCharge.vaBank'), value: bankDisplayName(info.bankName) },
    { label: t('checkout.cashCharge.vaAccount'), value: info.accountNumber || '-', copy: !!info.accountNumber },
    { label: t('checkout.cashCharge.vaHolder'), value: info.accountHolder || '-' },
    { label: t('checkout.cashCharge.vaAmount'), value: amountLabel },
    {
      label: t('checkout.cashCharge.vaDue'),
      value: info.expiresAt ? new Date(info.expiresAt).toLocaleString('ko-KR') : '-',
    },
  ];

  return (
    <div className="space-y-3">
      <dl className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-gray-50">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <dt className="shrink-0 text-gray-500">{row.label}</dt>
            <dd className="flex min-w-0 items-center gap-2 text-right font-semibold text-gray-900">
              <span className="break-all">{row.value}</span>
              {row.copy && (
                <button
                  type="button"
                  onClick={copyAccount}
                  className="shrink-0 rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  {copied ? t('checkout.cashCharge.vaCopied') : t('checkout.cashCharge.vaCopy')}
                </button>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs leading-relaxed text-gray-500">{t('checkout.cashCharge.vaNotice')}</p>
    </div>
  );
}
