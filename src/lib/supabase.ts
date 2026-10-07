'use client';
import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 비밀번호 재설정 메일 링크(?code=)는 클라이언트 초기화 중에 비동기로 교환되는데,
// 교환 결과에는 '재설정 링크였는지'가 남지 않는다(SIGNED_IN 이벤트만 발생).
// 재설정 요청 시 저장되는 code-verifier 쿠키에만 '/PASSWORD_RECOVERY' 표시가 있고
// 교환 직후 삭제되므로, 클라이언트 생성 전에 동기적으로 미리 읽어 둔다.
export const IS_PASSWORD_RECOVERY_CODE_LINK: boolean = (() => {
  if (typeof window === 'undefined') return false;
  try {
    if (!new URLSearchParams(window.location.search).has('code')) return false;
    return document.cookie.split(';').some((part) => {
      const eq = part.indexOf('=');
      if (eq < 0) return false;
      if (!part.slice(0, eq).trim().endsWith('-auth-token-code-verifier')) return false;
      let value = decodeURIComponent(part.slice(eq + 1).trim());
      if (value.startsWith('base64-')) {
        const b64 = value.slice('base64-'.length).replace(/-/g, '+').replace(/_/g, '/');
        value = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
      }
      return value.includes('/PASSWORD_RECOVERY');
    });
  } catch {
    return false;
  }
})();

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

export type Profile = {
  id: string;
  email: string;
  name: string;
  display_name?: string | null;
  phone?: string;
  role: 'user' | 'admin';
  created_at: string;
  updated_at: string;
  migrated_at?: string | null;
};
