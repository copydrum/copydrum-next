import { createClient } from '@supabase/supabase-js';

/** Cookie-less Supabase client for public read-only data (ISR-safe). */
export function createPublicServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
