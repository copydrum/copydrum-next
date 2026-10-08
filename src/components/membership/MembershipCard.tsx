'use client';

import { useTranslation } from 'react-i18next';
import { TIER_STYLE, ratePercent, type MembershipSummary } from '@/lib/membership';

export default function MembershipCard({ membership }: { membership: MembershipSummary }) {
  const { t } = useTranslation();
  const style = TIER_STYLE[membership.tier] ?? TIER_STYLE.rookie;
  const tierName = t(`mypage.membership.tier.${membership.tier}`);
  const hasNext = membership.next_tier !== null && membership.next_min_spend !== null && membership.remaining !== null;
  const progress = hasNext
    ? Math.min(100, Math.round((membership.lifetime_spend / Math.max(1, membership.next_min_spend!)) * 100))
    : 100;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${style.badge}`}>
            <i className={style.icon}></i>
            {tierName}
          </span>
          <span className="text-sm text-gray-600">
            {t('mypage.membership.earnRate', { rate: ratePercent(membership.earn_rate) })}
          </span>
        </div>
        <span className="text-xs text-gray-500">
          {t('mypage.membership.lifetimeSpend', { amount: membership.lifetime_spend.toLocaleString('ko-KR') })}
        </span>
      </div>

      <div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-sm text-gray-700">
          {hasNext
            ? t('mypage.membership.toNext', {
                tier: t(`mypage.membership.tier.${membership.next_tier}`),
                amount: membership.remaining!.toLocaleString('ko-KR'),
                rate: ratePercent(membership.next_earn_rate),
              })
            : t('mypage.membership.top')}
        </p>
      </div>

      <p className="text-xs text-gray-400">{t('mypage.membership.rule')}</p>
    </div>
  );
}
