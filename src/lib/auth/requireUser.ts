import { createClient as createSsrServerClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

/**
 * API Route 에서 쿠키 세션 기반으로 인증된 사용자를 반환한다.
 * 세션이 없으면 null 을 반환한다.
 */
export async function getAuthenticatedUser(): Promise<User | null> {
  try {
    const ssr = await createSsrServerClient();
    const { data } = await ssr.auth.getUser();
    return data?.user ?? null;
  } catch {
    return null;
  }
}
