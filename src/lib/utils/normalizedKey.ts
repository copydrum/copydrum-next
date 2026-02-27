/**
 * normalized_key 생성 유틸리티 함수
 * artist와 title을 결합하여 정규화된 키를 생성합니다.
 * 
 * 규칙:
 * 1. artist + title을 결합
 * 2. 소문자로 변환
 * 3. 띄어쓰기와 특수문자 모두 제거
 * 
 * 예시:
 * - "BTS", "Butter " -> "btsbutter"
 * - "NewJeans", "OMG" -> "newjeansomg"
 * - "IVE", "I AM" -> "iveiam"
 */
export function generateNormalizedKey(artist: string, title: string): string {
  if (!artist || !title) {
    throw new Error('Artist and title are required to generate normalized key');
  }

  // artist와 title을 결합
  const combined = `${artist}${title}`;

  // 소문자로 변환하고, 모든 공백과 특수문자 제거
  const normalized = combined
    .toLowerCase()
    .replace(/\s+/g, '') // 모든 공백 제거
    .replace(/[^a-z0-9]/g, ''); // 영문자와 숫자만 남기고 나머지 제거

  return normalized;
}

/**
 * normalized_key 검증 함수
 * 생성된 키가 유효한지 확인합니다.
 */
export function validateNormalizedKey(key: string): boolean {
  if (!key || key.length === 0) {
    return false;
  }
  // 영문자와 숫자만 포함되어야 함
  return /^[a-z0-9]+$/.test(key);
}
