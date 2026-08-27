import type { AutoPostPlatform } from './config.js';
import type { AppConfig } from './config.js';
import { getSupabase } from './supabase.js';

export type PostStatus = 'success' | 'failed' | 'skipped';

export async function logPost(
  cfg: AppConfig,
  opts: {
    platform: AutoPostPlatform;
    sheetId: string;
    status: PostStatus;
    postUrl?: string | null;
    errorMessage?: string | null;
  },
): Promise<void> {
  const supabase = getSupabase(cfg);
  const { error } = await supabase.from('marketing_posts').insert({
    platform: opts.platform,
    sheet_id: opts.sheetId,
    status: opts.status,
    post_url: opts.postUrl ?? null,
    error_message: opts.errorMessage ?? null,
    posted_at: new Date().toISOString(),
  });

  if (error) {
    // 유니크 인덱스 충돌이면 이미 기록된 것으로 간주
    if (error.code === '23505') {
      console.warn(`[log] 이미 기록된 포스팅 (${opts.platform}/${opts.sheetId}) — 건너뜀`);
      return;
    }
    throw new Error(`marketing_posts 기록 실패: ${error.message}`);
  }
}
