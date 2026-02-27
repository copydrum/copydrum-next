/**
 * normalized_key 생성 유틸리티 함수 (강화된 버전)
 * artist와 title을 결합하여 정규화된 키를 생성합니다.
 * 
 * 규칙:
 * 1. artist + title을 결합
 * 2. trim()으로 앞뒤 공백 제거
 * 3. 소문자로 변환
 * 4. 괄호와 그 내용 제거 (예: "쿠빈(KUBIN)" -> "쿠빈")
 * 5. 모든 공백 제거
 * 6. 특수문자 제거 (한글, 영문, 숫자만 유지)
 * 
 * 예시:
 * - "BTS", "Butter " -> "btsbutter"
 * - "NewJeans", "OMG" -> "newjeansomg"
 * - "IVE", "I AM" -> "iveiam"
 * - "쿠빈(KUBIN)", "굿하이(Good High)" -> "쿠빈굿하이"
 * - "허회경", "이런 사람 되어버렸네" -> "허회경이런사람되어버렸네"
 */
export function generateNormalizedKey(artist: string, title: string): string {
  if (!artist || !title) {
    throw new Error('Artist and title are required to generate normalized key');
  }

  // trim으로 앞뒤 공백 제거
  const trimmedArtist = artist.trim();
  const trimmedTitle = title.trim();

  if (!trimmedArtist || !trimmedTitle) {
    throw new Error('Artist and title cannot be empty after trimming');
  }

  // artist와 title을 결합
  const combined = `${trimmedArtist}${trimmedTitle}`;

  // 정규화 과정:
  // 1. 소문자로 변환 (영문만 영향)
  // 2. 괄호와 그 내용 제거 (예: "쿠빈(KUBIN)" -> "쿠빈")
  // 3. 모든 공백 제거
  // 4. 특수문자 제거 (한글, 영문, 숫자만 유지)
  const normalized = combined
    .toLowerCase()
    .replace(/\([^)]*\)/g, '') // 괄호와 그 내용 제거
    .replace(/\[[^\]]*\]/g, '') // 대괄호와 그 내용 제거
    .replace(/\s+/g, '') // 모든 공백 제거
    .replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ]/g, ''); // 한글, 영문, 숫자만 유지

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
  // 한글, 영문자, 숫자만 포함되어야 함
  return /^[a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ]+$/.test(key);
}
