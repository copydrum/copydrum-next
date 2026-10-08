import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * 서버 전용 service_role 클라이언트.
 * 잔액·주문 상태처럼 DB 트리거가 브라우저 쓰기를 막는 데이터는 이 클라이언트로만 변경한다.
 * anon 키로 폴백하지 않는다 (폴백하면 트리거에 막혀 결제가 반쯤만 처리된다).
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
