import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { google } from 'googleapis';
import type { GeneratedPost } from '../../../../src/lib/marketing/postTemplate.ts';
import type { AppConfig } from '../config.js';
import { BLOGGER_TOKEN_PATH } from '../config.js';

const SCOPES = ['https://www.googleapis.com/auth/blogger'];
const REDIRECT_PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/oauth2callback`;

interface StoredToken {
  refresh_token?: string;
  access_token?: string;
  expiry_date?: number;
  token_type?: string;
  scope?: string;
}

function loadClient(cfg: AppConfig) {
  const raw = JSON.parse(readFileSync(cfg.googleOAuthClientSecretPath, 'utf8'));
  const installed = raw.installed || raw.web;
  if (!installed?.client_id || !installed?.client_secret) {
    throw new Error('client_secret.json 형식이 올바르지 않습니다. Desktop app OAuth 클라이언트를 내려받으세요.');
  }
  return new google.auth.OAuth2(installed.client_id, installed.client_secret, REDIRECT_URI);
}

function loadToken(): StoredToken | null {
  if (!existsSync(BLOGGER_TOKEN_PATH)) return null;
  return JSON.parse(readFileSync(BLOGGER_TOKEN_PATH, 'utf8')) as StoredToken;
}

function saveToken(token: StoredToken): void {
  writeFileSync(BLOGGER_TOKEN_PATH, JSON.stringify(token, null, 2), 'utf8');
  console.log(`[blogger] 토큰 저장: ${BLOGGER_TOKEN_PATH}`);
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'win32'
      ? `cmd /c start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => undefined);
}

function startAuthServer(): Promise<{ codePromise: Promise<string>; close: () => void }> {
  let settleCode: (code: string) => void;
  let rejectCode: (err: Error) => void;
  const codePromise = new Promise<string>((resolve, reject) => {
    settleCode = resolve;
    rejectCode = reject;
  });

  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url || '/', `http://127.0.0.1:${REDIRECT_PORT}`);
      if (url.pathname !== '/oauth2callback') {
        res.writeHead(404);
        res.end();
        return;
      }
      const code = url.searchParams.get('code');
      const err = url.searchParams.get('error');
      if (err) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>인증 실패</h1><p>${err}</p>`);
        server.close();
        rejectCode(new Error(`OAuth error: ${err}`));
        return;
      }
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>code 없음</h1>');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>인증 완료</h1><p>이 창을 닫고 터미널로 돌아가세요.</p>');
      server.close();
      settleCode(code);
    } catch (e) {
      server.close();
      rejectCode(e instanceof Error ? e : new Error(String(e)));
    }
  });

  const timer = setTimeout(() => {
    server.close();
    rejectCode(new Error('OAuth 인증 타임아웃 (3분)'));
  }, 3 * 60 * 1000);

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(REDIRECT_PORT, '127.0.0.1', () => {
      resolve({
        codePromise: codePromise.finally(() => clearTimeout(timer)),
        close: () => {
          clearTimeout(timer);
          server.close();
        },
      });
    });
  });
}

export async function authorizeBlogger(cfg: AppConfig): Promise<void> {
  const oauth2 = loadClient(cfg);
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  const { codePromise } = await startAuthServer();

  console.log('\n브라우저가 열리면 Google 계정으로 로그인하고 권한을 허용하세요.');
  console.log('자동으로 안 열리면 아래 주소를 직접 열어주세요:\n');
  console.log(authUrl);
  console.log('');
  openBrowser(authUrl);

  const code = await codePromise;
  const { tokens } = await oauth2.getToken(code);
  saveToken(tokens as StoredToken);

  oauth2.setCredentials(tokens);
  const blogger = google.blogger({ version: 'v3', auth: oauth2 });
  const blogs = await blogger.blogs.listByUser({ userId: 'self' });
  const items = blogs.data.items || [];

  if (items.length === 0) {
    console.log('연결된 Blogger 블로그가 없습니다. blogger.com 에서 블로그를 만든 뒤 다시 실행하세요.');
    return;
  }

  console.log('\n사용 가능한 블로그:');
  for (const blog of items) {
    console.log(`  - name: ${blog.name}`);
    console.log(`    id:   ${blog.id}`);
    console.log(`    url:  ${blog.url}`);
  }
  console.log(`\n.env 에 다음을 추가하세요:\nBLOGGER_BLOG_ID=${items[0].id}`);
}

async function getAuthedClient(cfg: AppConfig) {
  const oauth2 = loadClient(cfg);
  const token = loadToken();
  if (!token?.refresh_token && !token?.access_token) {
    throw new Error('Blogger 토큰이 없습니다. 먼저 npm run auth:blogger 를 실행하세요.');
  }
  oauth2.setCredentials(token);
  oauth2.on('tokens', (tokens) => {
    saveToken({ ...token, ...tokens });
  });
  return oauth2;
}

export async function postToBlogger(
  cfg: AppConfig,
  post: GeneratedPost,
): Promise<{ url: string }> {
  if (!cfg.bloggerBlogId) {
    throw new Error('BLOGGER_BLOG_ID 가 .env 에 없습니다. npm run auth:blogger 결과를 참고하세요.');
  }

  const auth = await getAuthedClient(cfg);
  const blogger = google.blogger({ version: 'v3', auth });
  const labels = post.tags.slice(0, 15).filter((t) => t.length <= 50);

  const result = await blogger.posts.insert({
    blogId: cfg.bloggerBlogId,
    requestBody: {
      title: post.title,
      content: post.html,
      labels,
    },
  });

  const url = result.data.url;
  if (!url) throw new Error('Blogger API가 post URL을 반환하지 않았습니다.');
  return { url };
}
