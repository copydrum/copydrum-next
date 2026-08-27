import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LOGS_DIR, TMP_DIR } from './config.js';

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** min~max 밀리초 사이 랜덤 대기 (네이버 어뷰징 완화용) */
export async function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(minMs + Math.random() * (maxMs - minMs));
  console.log(`[wait] ${(ms / 1000).toFixed(0)}초 대기...`);
  await sleep(ms);
}

export async function ensureDirs(): Promise<void> {
  await mkdir(LOGS_DIR, { recursive: true });
  await mkdir(TMP_DIR, { recursive: true });
}

export async function downloadToTemp(url: string, filename: string): Promise<string> {
  await ensureDirs();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`이미지 다운로드 실패 (${res.status}): ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const path = resolve(TMP_DIR, filename);
  await writeFile(path, buf);
  return path;
}

export async function saveFailureScreenshot(
  page: { screenshot: (opts: { path: string; fullPage?: boolean }) => Promise<Buffer> },
  platform: string,
  label: string,
): Promise<string | null> {
  try {
    await ensureDirs();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = resolve(LOGS_DIR, `${platform}_${label}_${stamp}.png`);
    await page.screenshot({ path, fullPage: true });
    console.error(`[screenshot] ${path}`);
    return path;
  } catch (err) {
    console.error('[screenshot] 저장 실패:', err);
    return null;
  }
}

export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}
