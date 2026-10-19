'use client';

import { useTranslation } from 'react-i18next';
import { POINT_SIGNUP_BONUS, POINT_VALID_DAYS } from '@/lib/points/config';

/** 가입 보너스 안내는 포인트가 원(P) 단위로 보이는 한국어 사이트에서만 노출한다 */
export function useSignupBonus() {
  const { t, i18n } = useTranslation();
  const show = i18n.language === 'ko';
  const opts = { points: `${POINT_SIGNUP_BONUS.toLocaleString('ko-KR')}P`, days: POINT_VALID_DAYS };

  return {
    show,
    badge: t('authRegister.bonus.badge', opts),
    headline: t('authRegister.bonus.headline', opts),
    detail: t('authRegister.bonus.detail', opts),
    short: t('authRegister.bonus.short', opts),
  };
}

const BADGE_VARIANTS = {
  corner: 'absolute -right-2 -top-2.5 px-1.5 py-0.5 text-[11px]',
  cornerSm: 'absolute -right-1.5 -top-2 px-1 py-0.5 text-[11px]',
  inline: 'ml-2 px-2 py-1 text-[11px]',
};

/** 회원가입 버튼에 붙는 배지. corner 계열은 버튼에 relative 필요 */
export function SignupBonusBadge({ variant = 'corner' }: { variant?: keyof typeof BADGE_VARIANTS }) {
  const { show, badge } = useSignupBonus();
  if (!show) return null;

  return (
    <span
      className={`pointer-events-none whitespace-nowrap rounded-full bg-red-500 font-bold leading-none text-white ${BADGE_VARIANTS[variant]}`}
    >
      {badge}
    </span>
  );
}

/** 회원가입 페이지 상단 안내 카드 */
export function SignupBonusBanner() {
  const { show, headline, detail } = useSignupBonus();
  if (!show) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <i className="ri-gift-2-fill text-2xl leading-none text-amber-500"></i>
      <div className="min-w-0">
        <p className="text-sm font-bold text-gray-900">{headline}</p>
        <p className="mt-0.5 text-xs text-gray-600">{detail}</p>
      </div>
    </div>
  );
}
