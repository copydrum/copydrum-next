import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

loadEnv({ path: resolve(ROOT, '.env') });

export const ROOT_DIR = ROOT;
export const PROFILES_DIR = resolve(ROOT, '.profiles');
export const TMP_DIR = resolve(ROOT, '.tmp');
export const LOGS_DIR = resolve(PROFILES_DIR, 'logs');
export const BLOGGER_TOKEN_PATH = resolve(ROOT, 'token.blogger.json');

export type AutoPostPlatform = 'naver' | 'tistory' | 'google';

export const ALL_PLATFORMS: AutoPostPlatform[] = ['naver', 'tistory', 'google'];

export interface AppConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  naverBlogId: string;
  tistoryBlogName: string;
  googleOAuthClientSecretPath: string;
  bloggerBlogId: string;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`환경변수 ${name} 이(가) 비어 있습니다. tools/blog-autopost/.env 를 확인하세요.`);
  }
  return value;
}

export function loadConfig(opts: { requireBlogger?: boolean; requireTistory?: boolean; requireNaver?: boolean } = {}): AppConfig {
  const cfg: AppConfig = {
    supabaseUrl: requireEnv('SUPABASE_URL'),
    supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    naverBlogId: process.env.NAVER_BLOG_ID?.trim() || 'white0028',
    tistoryBlogName: process.env.TISTORY_BLOG_NAME?.trim() || '',
    googleOAuthClientSecretPath: process.env.GOOGLE_OAUTH_CLIENT_SECRET_PATH?.trim()
      ? resolve(ROOT, process.env.GOOGLE_OAUTH_CLIENT_SECRET_PATH.trim())
      : resolve(ROOT, 'client_secret.json'),
    bloggerBlogId: process.env.BLOGGER_BLOG_ID?.trim() || '',
  };

  if (opts.requireNaver && !cfg.naverBlogId) {
    throw new Error('NAVER_BLOG_ID 가 필요합니다.');
  }
  if (opts.requireTistory && !cfg.tistoryBlogName) {
    throw new Error('TISTORY_BLOG_NAME 가 필요합니다. (예: myblog)');
  }
  if (opts.requireBlogger) {
    if (!existsSync(cfg.googleOAuthClientSecretPath)) {
      throw new Error(`Google OAuth 클라이언트 파일이 없습니다: ${cfg.googleOAuthClientSecretPath}`);
    }
    if (!cfg.bloggerBlogId && !existsSync(BLOGGER_TOKEN_PATH)) {
      // auth:blogger 단계에서는 blogId가 아직 없을 수 있음
    }
  }

  return cfg;
}

export function profileDir(platform: 'naver' | 'tistory'): string {
  return resolve(PROFILES_DIR, platform);
}
