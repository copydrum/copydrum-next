'use client';

import { useTranslation } from 'react-i18next';
import { useRewardPoints, type PointTransaction } from '@/hooks/useRewardPoints';
import { POINT_EARN_RATE, POINT_VALID_DAYS } from '@/lib/points/config';

const TYPE_STYLE: Record<PointTransaction['type'], string> = {
  earn: 'bg-emerald-100 text-emerald-700',
  signup: 'bg-emerald-100 text-emerald-700',
  admin_add: 'bg-emerald-100 text-emerald-700',
  release: 'bg-blue-100 text-blue-700',
  use: 'bg-gray-100 text-gray-700',
  revoke: 'bg-red-100 text-red-700',
  expire: 'bg-red-100 text-red-700',
  admin_deduct: 'bg-red-100 text-red-700',
};

/** 소멸일(한국시간 자정)의 전날 = 사용 가능한 마지막 날 */
function formatLastUsableDate(expiresAt: string): string {
  const lastDay = new Date(new Date(expiresAt).getTime() - 1);
  return lastDay.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
}

export default function PointsPanel({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { balance, expiringSoon, nextExpiryAt, transactions, loading } = useRewardPoints(userId, {
    withHistory: true,
  });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">{t('mypage.points.balance', '보유 포인트')}</p>
            <p className="text-3xl font-extrabold text-emerald-600">{balance.toLocaleString('ko-KR')} P</p>
          </div>
          {expiringSoon > 0 && nextExpiryAt && (
            <div className="text-right">
              <p className="text-xs text-gray-500">{t('mypage.points.expiringSoon', '30일 내 소멸 예정')}</p>
              <p className="text-lg font-bold text-red-600">{expiringSoon.toLocaleString('ko-KR')} P</p>
              <p className="text-[11px] text-gray-400">
                {t('mypage.points.lastUsableDate', '{{date}}까지 사용 가능', { date: formatLastUsableDate(nextExpiryAt) })}
              </p>
            </div>
          )}
        </div>
        <ul className="text-xs text-gray-500 space-y-1 border-t border-gray-100 pt-3">
          <li>
            •{' '}
            {t('mypage.points.ruleEarn', '악보 구매 시 결제 금액의 {{rate}}%가 적립됩니다.', {
              rate: Math.round(POINT_EARN_RATE * 100),
            })}
          </li>
          <li>• {t('mypage.points.ruleUse', '결제할 때 1P = 1원으로 사용할 수 있고, 남은 금액은 다른 결제수단으로 결제됩니다.')}</li>
          <li>
            •{' '}
            {t('mypage.points.ruleExpiry', '포인트는 적립일로부터 {{days}}일이 지나면 소멸되며, 현금으로 환불되지 않습니다.', {
              days: POINT_VALID_DAYS,
            })}
          </li>
        </ul>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">{t('mypage.points.history', '포인트 내역')}</h3>
        </div>
        {loading ? (
          <p className="px-6 py-10 text-center text-sm text-gray-500">{t('mypage.points.loading', '불러오는 중입니다...')}</p>
        ) : transactions.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-gray-500">{t('mypage.points.empty', '아직 포인트 내역이 없습니다.')}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {transactions.map((tx) => (
              <li key={tx.id} className="px-6 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TYPE_STYLE[tx.type]}`}>
                      {t(`mypage.points.type.${tx.type}`)}
                    </span>
                    <span className="truncate text-sm text-gray-700">{tx.description}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">{new Date(tx.created_at).toLocaleString('ko-KR')}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-bold ${tx.amount >= 0 ? 'text-emerald-600' : 'text-gray-700'}`}>
                    {tx.amount >= 0 ? '+' : ''}
                    {tx.amount.toLocaleString('ko-KR')} P
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {t('mypage.points.balanceAfter', '잔액 {{points}} P', { points: tx.balance_after.toLocaleString('ko-KR') })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
