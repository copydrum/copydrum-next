import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from './config.js';

let cached: SupabaseClient | null = null;

export function getSupabase(cfg: AppConfig): SupabaseClient {
  if (cached) return cached;
  cached = createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
