/**
 * 멤버십 등급 (DB membership_tiers / get_member_membership 과 값을 맞춘다)
 * 평생 누적 구매 금액 기준이며 등급은 내려가지 않는다.
 */
export type TierCode = 'rookie' | 'session' | 'master';

export interface MembershipSummary {
  tier: TierCode;
  earn_rate: number;
  lifetime_spend: number;
  next_tier: TierCode | null;
  next_earn_rate: number | null;
  next_min_spend: number | null;
  remaining: number | null;
}

export const TIER_STYLE: Record<TierCode, { badge: string; bar: string; icon: string }> = {
  rookie: { badge: 'bg-sky-100 text-sky-700', bar: 'bg-sky-500', icon: 'ri-seedling-line' },
  session: { badge: 'bg-violet-100 text-violet-700', bar: 'bg-violet-500', icon: 'ri-music-2-line' },
  master: { badge: 'bg-amber-100 text-amber-800', bar: 'bg-amber-500', icon: 'ri-vip-crown-2-line' },
};

export function ratePercent(rate: number | null | undefined): number {
  return Math.round((Number(rate) || 0) * 100);
}

export function parseMembership(data: unknown): MembershipSummary | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Record<string, unknown>;
  const toNum = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    tier: (raw.tier as TierCode) ?? 'rookie',
    earn_rate: Number(raw.earn_rate) || 0,
    lifetime_spend: Number(raw.lifetime_spend) || 0,
    next_tier: (raw.next_tier as TierCode | null) ?? null,
    next_earn_rate: toNum(raw.next_earn_rate),
    next_min_spend: toNum(raw.next_min_spend),
    remaining: toNum(raw.remaining),
  };
}
