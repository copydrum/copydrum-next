import type { Profile } from '../lib/supabase';

/**
 * 사용자 표시명을 반환합니다.
 * 우선순위: profile.display_name > email.split('@')[0]
 * 
 * @param profile - 프로필 객체 (display_name, email 포함)
 * @param email - 이메일 주소 (profile이 없을 경우 사용)
 * @returns 사용자 표시명
 */
export function getUserDisplayName(profile?: Profile | null, email?: string | null): string {
  // display_name이 있으면 사용
  if (profile?.display_name) {
    return profile.display_name;
  }
  
  // email이 있으면 앞부분 사용
  const userEmail = profile?.email || email;
  if (userEmail) {
    return userEmail.split('@')[0];
  }
  
  // 둘 다 없으면 기본값
  return 'User';
}


























