import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { POINT_EXPIRY_NOTICE_DAYS } from '@/lib/points/config';

export interface PointTransaction {
  id: string;
  type: 'earn' | 'signup' | 'use' | 'release' | 'revoke' | 'expire' | 'admin_add' | 'admin_deduct';
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
}

interface RewardPointsData {
  balance: number;
  expiringSoon: number;
  nextExpiryAt: string | null;
  transactions: PointTransaction[];
}

const EMPTY: RewardPointsData = { balance: 0, expiringSoon: 0, nextExpiryAt: null, transactions: [] };

async function fetchRewardPoints(userId: string, withHistory: boolean): Promise<RewardPointsData> {
  const noticeUntil = new Date(Date.now() + POINT_EXPIRY_NOTICE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [profileRes, expiringRes, historyRes] = await Promise.all([
    supabase.from('profiles').select('points').eq('id', userId).maybeSingle(),
    supabase
      .from('point_lots')
      .select('remaining, expires_at')
      .eq('user_id', userId)
      .gt('remaining', 0)
      .gt('expires_at', new Date().toISOString())
      .lte('expires_at', noticeUntil)
      .order('expires_at', { ascending: true }),
    withHistory
      ? supabase
          .from('point_transactions')
          .select('id, type, amount, balance_after, description, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(100)
      : Promise.resolve({ data: null }),
  ]);

  const lots = expiringRes.data ?? [];
  return {
    balance: Number(profileRes.data?.points) || 0,
    expiringSoon: lots.reduce((sum, lot) => sum + (Number(lot.remaining) || 0), 0),
    nextExpiryAt: lots[0]?.expires_at ?? null,
    transactions: (historyRes.data as PointTransaction[] | null) ?? [],
  };
}

/** 적립 포인트 잔액·소멸 예정·내역 (RLS 로 본인 데이터만 조회된다) */
export function useRewardPoints(userId: string | null | undefined, { withHistory = false } = {}) {
  const [data, setData] = useState<RewardPointsData>(EMPTY);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchRewardPoints(userId, withHistory).then((result) => {
      if (cancelled) return;
      setData(result);
      setLoadedFor(userId);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, withHistory, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const current = userId && loadedFor === userId ? data : EMPTY;

  return { ...current, loading: Boolean(userId) && loadedFor !== userId, refresh };
}
