/** 나만의 악보집 제작용 파일 다운로드 도우미 (서버·브라우저 공용) */

export async function fetchBytes(url: string, retries = 1): Promise<Uint8Array> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** 순서를 유지하면서 동시에 limit 개씩 처리 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export function getCoverKind(fileNameOrPath: string | null | undefined): 'jpg' | 'png' | 'pdf' | null {
  const ext = fileNameOrPath?.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg';
  if (ext === 'png') return 'png';
  if (ext === 'pdf') return 'pdf';
  return null;
}

export const MY_BOOK_FONT_FILES = {
  regular: 'NanumGothic-Regular.ttf',
  bold: 'NanumGothic-Bold.ttf',
  extraBold: 'NanumGothic-ExtraBold.ttf',
} as const;
