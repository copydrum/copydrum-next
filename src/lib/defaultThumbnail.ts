// 기본 썸네일 생성 유틸리티
// Spotify에서 썸네일을 가져오지 못했을 때 사용

export const generateDefaultThumbnail = (width: number = 400, height: number = 400): string => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return '';
  }

  // 파란색 배경
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#1e3a8a');  // 진한 파란색
  gradient.addColorStop(1, '#3b82f6');  // 밝은 파란색

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // 하얀색 텍스트
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // COPYDRUM 텍스트
  ctx.font = 'bold 32px Arial';
  ctx.fillText('COPYDRUM', width / 2, height / 2 - 30);

  // DRUM SHEET MUSIC 텍스트
  ctx.font = 'bold 24px Arial';
  ctx.fillText('DRUM SHEET MUSIC', width / 2, height / 2 + 10);

  // Data URL로 변환
  return canvas.toDataURL('image/jpeg', 0.9);
};






































