import { chromium, type BrowserContext, type Page } from 'playwright';
import { mkdir } from 'node:fs/promises';
import type { GeneratedPost } from '../../../../src/lib/marketing/postTemplate.ts';
import type { AppConfig } from '../config.js';
import { profileDir } from '../config.js';
import { saveFailureScreenshot, sleep } from '../utils.js';

async function launchContext(): Promise<BrowserContext> {
  const dir = profileDir('tistory');
  await mkdir(dir, { recursive: true });
  return chromium.launchPersistentContext(dir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR',
  });
}

/** 최초 1회: 사용자가 직접 카카오/티스토리 로그인 */
export async function loginTistory(cfg: AppConfig): Promise<void> {
  const blog = cfg.tistoryBlogName;
  if (!blog) throw new Error('TISTORY_BLOG_NAME 이 필요합니다.');

  const context = await launchContext();
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(`https://${blog}.tistory.com/manage`, { waitUntil: 'domcontentloaded' });

  console.log('\n[티스토리] 브라우저에서 직접 로그인하세요.');
  console.log('관리자 화면(글 목록)이 보이면 이 터미널에서 Enter 를 누르세요.\n');
  await waitForEnter();

  await context.close();
  console.log('[티스토리] 로그인 세션이 .profiles/tistory 에 저장되었습니다.');
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });
}

async function switchToHtmlMode(page: Page): Promise<void> {
  // 티스토리 에디터: "HTML" / "모드" 토글 버튼 시도
  const candidates = [
    'button:has-text("HTML")',
    'button[aria-label*="HTML"]',
    '.mce-i-code',
    'button:has-text("소스")',
    '#editor-mode-html',
    'button.html-mode',
  ];

  for (const sel of candidates) {
    const btn = page.locator(sel).first();
    if (await btn.count()) {
      try {
        await btn.click({ timeout: 2000 });
        await sleep(800);
        return;
      } catch {
        // try next
      }
    }
  }

  // TinyMCE code view 단축키 시도
  await page.keyboard.press('Control+Shift+H').catch(() => undefined);
  await sleep(500);
}

async function fillTitle(page: Page, title: string): Promise<void> {
  const titleSelectors = [
    '#post-title-inp',
    'input#title',
    'textarea#title',
    'input[name="title"]',
    'input[placeholder*="제목"]',
    '.textarea_tit',
  ];

  for (const sel of titleSelectors) {
    const el = page.locator(sel).first();
    if (await el.count()) {
      await el.click({ timeout: 3000 });
      await el.fill(title);
      return;
    }
  }
  throw new Error('티스토리 제목 입력란을 찾지 못했습니다.');
}

async function fillHtmlBody(page: Page, html: string): Promise<void> {
  // HTML 모드 textarea
  const htmlAreas = [
    'textarea.mce-edit-area',
    'textarea#editor-tistory',
    'textarea.CodeMirror-code',
    '.CodeMirror textarea',
    'textarea[name="content"]',
    '#html-editor-container textarea',
    'textarea',
  ];

  for (const sel of htmlAreas) {
    const area = page.locator(sel).first();
    if (!(await area.count())) continue;
    try {
      await area.click({ timeout: 2000 });
      await area.fill(html);
      return;
    } catch {
      // continue
    }
  }

  // contenteditable fallback
  const editable = page.locator('[contenteditable="true"]').first();
  if (await editable.count()) {
    await editable.click();
    await page.evaluate((content) => {
      const el = document.querySelector('[contenteditable="true"]') as HTMLElement | null;
      if (el) el.innerHTML = content;
    }, html);
    return;
  }

  throw new Error('티스토리 본문 입력란을 찾지 못했습니다. HTML 모드로 전환됐는지 확인하세요.');
}

async function clickPublish(page: Page): Promise<void> {
  const publishSelectors = [
    'button:has-text("완료")',
    'button:has-text("공개 발행")',
    'button:has-text("발행")',
    '#publish-layer-btn',
    'button.btn-publish',
    'button[type="submit"]',
  ];

  for (const sel of publishSelectors) {
    const btn = page.locator(sel).first();
    if (!(await btn.count())) continue;
    try {
      await btn.click({ timeout: 3000 });
      await sleep(1000);

      // 공개 설정 레이어가 뜨면 공개 + 발행 확인
      const confirm = page.locator('button:has-text("공개 발행"), button:has-text("발행"), #publish-btn').first();
      if (await confirm.count()) {
        // 공개 라디오
        const publicRadio = page.locator('label:has-text("공개"), input[value="0"], input[value="3"]').first();
        if (await publicRadio.count()) {
          await publicRadio.click({ timeout: 1500 }).catch(() => undefined);
        }
        await confirm.click({ timeout: 3000 });
      }
      return;
    } catch {
      // try next
    }
  }
  throw new Error('티스토리 발행 버튼을 찾지 못했습니다.');
}

export async function postToTistory(
  cfg: AppConfig,
  post: GeneratedPost,
): Promise<{ url: string }> {
  const blog = cfg.tistoryBlogName;
  if (!blog) throw new Error('TISTORY_BLOG_NAME 이 필요합니다.');

  const context = await launchContext();
  const page = context.pages()[0] || (await context.newPage());

  try {
    const writeUrl = `https://${blog}.tistory.com/manage/newpost`;
    await page.goto(writeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(2000);

    // 로그인 풀림 감지
    if (page.url().includes('login') || page.url().includes('accounts.kakao.com')) {
      throw new Error('티스토리 로그인이 만료되었습니다. npm run login -- --platform=tistory 를 다시 실행하세요.');
    }

    await fillTitle(page, post.title);
    await switchToHtmlMode(page);
    await fillHtmlBody(page, post.html);
    await clickPublish(page);
    await sleep(3000);

    // 발행 후 URL 추정
    let url = page.url();
    if (url.includes('/manage')) {
      // 목록으로 갔다면 최신 글 링크 시도
      const link = page.locator(`a[href*="${blog}.tistory.com/"]`).first();
      if (await link.count()) {
        const href = await link.getAttribute('href');
        if (href) url = href.startsWith('http') ? href : `https://${blog}.tistory.com${href}`;
      } else {
        url = `https://${blog}.tistory.com/`;
      }
    }

    return { url };
  } catch (err) {
    await saveFailureScreenshot(page, 'tistory', 'error');
    throw err;
  } finally {
    await context.close();
  }
}
