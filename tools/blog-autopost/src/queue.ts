import type { MarketingSheet } from '../../../src/lib/marketing/postTemplate.ts';
import type { AutoPostPlatform } from './config.js';
import type { AppConfig } from './config.js';
import { getSupabase } from './supabase.js';

export interface QueueSheet extends MarketingSheet {
  created_at?: string;
}

const DONE_STATUSES = ['success', 'manual_copy', 'skipped'] as const;

/** 오늘(UTC) 이미 성공 발행한 건수 */
export async function countTodaySuccess(cfg: AppConfig, platform: AutoPostPlatform): Promise<number> {
  const supabase = getSupabase(cfg);
  const today = new Date().toISOString().slice(0, 10);

  const { count, error } = await supabase
    .from('marketing_posts')
    .select('*', { count: 'exact', head: true })
    .eq('platform', platform)
    .eq('status', 'success')
    .gte('posted_at', `${today}T00:00:00.000Z`)
    .lte('posted_at', `${today}T23:59:59.999Z`);

  if (error) throw new Error(`오늘 발행 수 조회 실패 (${platform}): ${error.message}`);
  return count || 0;
}

/** marketing_settings.daily_limit (없으면 1) */
export async function getDailyLimit(cfg: AppConfig, platform: AutoPostPlatform): Promise<number> {
  const supabase = getSupabase(cfg);
  const { data, error } = await supabase
    .from('marketing_settings')
    .select('daily_limit, is_enabled')
    .eq('platform', platform)
    .maybeSingle();

  if (error) {
    console.warn(`[queue] daily_limit 조회 실패 (${platform}): ${error.message} → 기본값 1 사용`);
    return 1;
  }
  if (data && data.is_enabled === false) {
    return 0;
  }
  return Math.max(0, data?.daily_limit ?? 1);
}

/** 아직 해당 플랫폼에 올리지 않은 활성 악보 */
export async function fetchUnpostedSheets(
  cfg: AppConfig,
  platform: AutoPostPlatform,
  limit: number,
): Promise<QueueSheet[]> {
  if (limit <= 0) return [];

  const supabase = getSupabase(cfg);

  const { data: posted, error: postedError } = await supabase
    .from('marketing_posts')
    .select('sheet_id')
    .eq('platform', platform)
    .in('status', [...DONE_STATUSES]);

  if (postedError) throw new Error(`포스팅 이력 조회 실패: ${postedError.message}`);

  const postedIds = (posted || []).map((row) => row.sheet_id).filter(Boolean);

  let query = supabase
    .from('drum_sheets')
    .select('id, title, artist, slug, preview_image_url, youtube_url, page_count, tempo, difficulty, description, created_at, categories (name)')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (postedIds.length > 0) {
    // PostgREST in-filter: (uuid1,uuid2,...)
    query = query.not('id', 'in', `(${postedIds.join(',')})`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`후보 악보 조회 실패: ${error.message}`);

  return (data || []) as unknown as QueueSheet[];
}

/** 발행 직전 재확인 — 레이스/수동완료 방지 */
export async function isAlreadyPosted(
  cfg: AppConfig,
  platform: AutoPostPlatform,
  sheetId: string,
): Promise<boolean> {
  const supabase = getSupabase(cfg);
  const { data, error } = await supabase
    .from('marketing_posts')
    .select('id')
    .eq('platform', platform)
    .eq('sheet_id', sheetId)
    .in('status', [...DONE_STATUSES])
    .limit(1);

  if (error) throw new Error(`중복 확인 실패: ${error.message}`);
  return (data?.length || 0) > 0;
}
