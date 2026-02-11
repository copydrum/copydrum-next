/**
 * 사용자 캐시 잔액 조회 훅
 * 
 * 캐시 잔액의 기준(source of truth): profiles 테이블의 credits 필드
 * - 관리자 페이지와 사용자 페이지 모두 동일한 소스를 사용합니다.
 * - RLS 정책에 따라 사용자는 자신의 프로필만 조회할 수 있습니다.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

interface UseUserCashBalanceResult {
  /** 캐시 잔액 (원) */
  credits: number;
  /** 로딩 중인지 여부 */
  loading: boolean;
  /** 에러 발생 여부 */
  error: Error | null;
  /** 캐시 잔액 새로고침 함수 */
  refresh: () => Promise<void>;
}

/**
 * 사용자의 캐시 잔액을 조회하는 훅
 * 
 * @param user - 현재 로그인한 사용자 (null이면 credits는 0)
 * @returns 캐시 잔액, 로딩 상태, 에러, 새로고침 함수
 */
export function useUserCashBalance(user: User | null): UseUserCashBalanceResult {
  const [credits, setCredits] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const loadCredits = useCallback(async () => {
    if (!user) {
      setCredits(0);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: queryError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', user.id)
        .single();

      if (queryError) {
        console.error('[useUserCashBalance] 캐시 조회 오류:', {
          error: queryError,
          user_id: user.id,
          email: user.email,
          message: queryError.message,
          details: queryError.details,
          hint: queryError.hint,
        });
        
        // RLS 정책 오류인지 확인
        if (queryError.code === 'PGRST301' || queryError.message?.includes('permission denied')) {
          console.error('[useUserCashBalance] RLS 정책 오류: profiles 테이블에 대한 SELECT 권한이 없습니다.');
          setError(new Error('캐시 잔액을 조회할 권한이 없습니다. RLS 정책을 확인해주세요.'));
        } else {
          setError(new Error(queryError.message || '캐시 잔액 조회에 실패했습니다.'));
        }
        
        setCredits(0);
        setLoading(false);
        return;
      }

      // credits가 null이거나 undefined인 경우 0으로 처리
      const creditsValue = data?.credits ?? 0;
      setCredits(creditsValue);
      
      console.log('[useUserCashBalance] 캐시 조회 성공:', {
        user_id: user.id,
        email: user.email,
        credits: creditsValue,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('알 수 없는 오류가 발생했습니다.');
      console.error('[useUserCashBalance] 예외 발생:', {
        error,
        user_id: user?.id,
        email: user?.email,
      });
      setError(error);
      setCredits(0);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadCredits();
  }, [loadCredits]);

  return {
    credits,
    loading,
    error,
    refresh: loadCredits,
  };
}

