/**
 * 로그인이 필요한 경우 로그인 페이지로 리다이렉트하는 헬퍼 함수
 * @param user - 현재 사용자 객체 (null이면 비로그인 상태)
 * @param navigate - React Router의 navigate 함수
 * @returns 리다이렉트했으면 true, 아니면 false
 */
export function redirectToLoginIfNeeded(
  user: any | null,
  navigate: (path: string) => void
): boolean {
  if (!user) {
    const redirectPath = window.location.pathname + window.location.search;
    navigate(`/auth/login?redirect=${encodeURIComponent(redirectPath)}`);
    return true; // 리다이렉트 했다는 표시
  }
  return false;
}





















