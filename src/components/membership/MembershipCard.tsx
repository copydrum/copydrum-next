'use client';

import { useTranslation } from 'react-i18next';
import { TIER_STYLE, ratePercent, type MembershipSummary } from '@/lib/membership';
import { formatWalletAmount, isKrwLocale } from '@/lib/wallet/display';

interface MembershipCardProps {
  membership: MembershipSummary;
  /** 마이페이지 요약 카드 안에 넣는 테두리 없는 한 줄 버전 */
  compact?: boolean;
}

export default function MembershipCard({ membership, compact = false }: MembershipCardProps) {
  const { t, i18n } = useTranslation();
  const style = TIER_STYLE[membership.tier] ?? TIER_STYLE.rookie;
  const tierName = t(`mypage.membership.tier.${membership.tier}`);
  const hasNext = membership.next_tier !== null && membership.next_min_spend !== null && membership.remaining !== null;
  const progress = hasNext
    ? Math.min(100, Math.round((membership.lifetime_spend / Math.max(1, membership.next_min_spend!)) * 100))
    : 100;
  // 한국어 문구는 "원"을 포함하고 있어 숫자만 넘긴다
  const amount = (krw: number) =>
    isKrwLocale(i18n.language) ? krw.toLocaleString('ko-KR') : formatWalletAmount(krw, i18n.language);

  const nextText = hasNext
    ? t('mypage.membership.toNext', {
        tier: t(`mypage.membership.tier.${membership.next_tier}`),
        amount: amount(membership.remaining!),
        rate: ratePercent(membership.next_earn_rate),
      })
    : t('mypage.membership.top');
  const ruleText = t('mypage.membership.rule', {
    session: formatWalletAmount(30000, i18n.language),
    master: formatWalletAmount(100000, i18n.language),
  });

  if (compact) {
    return (
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${style.badge}`}>
              <i className={style.icon}></i>
              {tierName}
            </span>
            <span className="truncate text-xs text-gray-600">
              {t('mypage.membership.earnRate', { rate: ratePercent(membership.earn_rate) })}
            </span>
          </div>
          <details className="group relative flex-shrink-0">
            <summary
              className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 [&::-webkit-details-marker]:hidden"
              aria-label={ruleText}
            >
              <i className="ri-information-line text-base" />
            </summary>
            <p className="absolute right-0 top-7 z-10 w-64 rounded-xl border border-gray-100 bg-white p-3 text-xs leading-relaxed text-gray-600 shadow-lg">
              {ruleText}
            </p>
          </details>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-gray-500">{nextText}</p>
      </div>
    );
  }

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
          {t('mypage.membership.lifetimeSpend', { amount: amount(membership.lifetime_spend) })}
        </span>
      </div>

      <div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-sm text-gray-700">{nextText}</p>
      </div>

      <p className="text-xs text-gray-400">{ruleText}</p>
    </div>
  );
}
