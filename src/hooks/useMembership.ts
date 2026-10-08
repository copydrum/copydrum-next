import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { parseMembership, type MembershipSummary } from '@/lib/membership';

/** 본인 멤버십 등급·누적 구매 금액·다음 등급까지 남은 금액 */
export function useMembership(userId: string | null | undefined) {
  const [data, setData] = useState<MembershipSummary | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase.rpc('get_member_membership', { p_user_id: userId }).then(({ data: result }) => {
      if (cancelled) return;
      setData(parseMembership(result));
      setLoadedFor(userId);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const membership = userId && loadedFor === userId ? data : null;

  return { membership, loading: Boolean(userId) && loadedFor !== userId, refresh };
}
