// PDF.js 클라이언트 설정 - 버전 불일치 방지
// 같은 패키지에서 worker를 가져와 API와 Worker 버전을 일치시킴

import * as pdfjsLib from 'pdfjs-dist';

// 브라우저 환경에서만 Worker 설정
if (typeof window !== 'undefined') {
  try {
    // ✅ 같은 패키지 경로에서 모듈 워커 생성 (버전 불일치 방지)
    // Vite에서 node_modules의 worker 파일을 직접 사용
    const worker = new Worker(
      new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
      { type: 'module' }
    );

    // workerPort로 직접 지정 (workerSrc는 사용하지 않음 - 충돌 방지)
    // @ts-ignore
    pdfjsLib.GlobalWorkerOptions.workerPort = worker;

    // 버전 확인 (디버깅용)
    console.log('PDF.js version:', (pdfjsLib as any).version);
  } catch (error) {
    console.error('PDF.js Worker 초기화 실패:', error);
    // Fallback: workerSrc 사용 (하지만 동일 패키지에서)
    try {
      const workerUrl = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
      // @ts-ignore
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    } catch (fallbackError) {
      console.error('PDF.js Worker Fallback 실패:', fallbackError);
    }
  }
}

export { pdfjsLib };

