/**
 * 사용자 포인트(credits) 조회 훅
 * 
 * profiles 테이블의 credits 필드를 조회합니다.
 * 기존 useUserCashBalance와 동일한 로직을 사용하지만,
 * 포인트 관련 기능에 특화된 이름으로 제공합니다.
 */

import { useUserCashBalance } from './useUserCashBalance';
import type { User } from '@supabase/supabase-js';

/**
 * 사용자의 포인트 잔액을 조회하는 훅
 * 
 * @param user - 현재 로그인한 사용자 (null이면 credits는 0)
 * @returns 포인트 잔액, 로딩 상태, 에러, 새로고침 함수
 */
export function useUserCredits(user: User | null) {
  const { credits, loading, error, refresh } = useUserCashBalance(user);
  
  return {
    credits,
    isLoading: loading,
    error,
    refresh,
  };
}

