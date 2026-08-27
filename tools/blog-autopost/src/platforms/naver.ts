import { chromium, type BrowserContext, type Page } from 'playwright';
import { mkdir } from 'node:fs/promises';
import type { GeneratedPost } from '../../../../src/lib/marketing/postTemplate.ts';
import type { AppConfig } from '../config.js';
import { profileDir } from '../config.js';
import { downloadToTemp, saveFailureScreenshot, sleep } from '../utils.js';

async function launchContext(): Promise<BrowserContext> {
  const dir = profileDir('naver');
  await mkdir(dir, { recursive: true });
  return chromium.launchPersistentContext(dir, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    locale: 'ko-KR',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
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

/** 최초 1회: 사용자가 직접 네이버 로그인 (캡차 회피) */
export async function loginNaver(cfg: AppConfig): Promise<void> {
  const context = await launchContext();
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(`https://blog.naver.com/${cfg.naverBlogId}`, { waitUntil: 'domcontentloaded' });

  console.log('\n[네이버] 브라우저에서 white0028 계정으로 직접 로그인하세요.');
  console.log('블로그 내 글쓰기 버튼이 보이면 이 터미널에서 Enter 를 누르세요.\n');
  await waitForEnter();

  await context.close();
  console.log('[네이버] 로그인 세션이 .profiles/naver 에 저장되었습니다.');
}

async function openWritePage(page: Page, blogId: string): Promise<void> {
  // 스마트에디터 ONE 글쓰기
  const candidates = [
    `https://blog.naver.com/${blogId}?Redirect=Write&`,
    `https://blog.naver.com/PostWriteForm.naver?blogId=${blogId}`,
    `https://blog.naver.com/${blogId}/postwrite`,
  ];

  for (const url of candidates) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(2500);
    if (!page.url().includes('nidlogin') && !page.url().includes('login')) {
      return;
    }
  }
  throw new Error('네이버 로그인이 만료되었습니다. npm run login -- --platform=naver 를 다시 실행하세요.');
}

async function getEditorFrame(page: Page) {
  // 스마트에디터는 mainFrame iframe 안에 있음
  const frame = page.frame({ name: 'mainFrame' }) || page.mainFrame();
  return frame;
}

async function dismissPopups(page: Page): Promise<void> {
  const dismissers = [
    'button:has-text("닫기")',
    'button:has-text("취소")',
    '.se-popup-button-cancel',
    '.se-help-panel-close-button',
    'button.se-popup-close-button',
  ];
  for (const sel of dismissers) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 500 })) {
        await btn.click({ timeout: 1000 });
        await sleep(300);
      }
    } catch {
      // ignore
    }
  }
  // iframe 안에서도
  for (const frame of page.frames()) {
    for (const sel of dismissers) {
      try {
        const btn = frame.locator(sel).first();
        if (await btn.isVisible({ timeout: 300 })) {
          await btn.click({ timeout: 800 });
        }
      } catch {
        // ignore
      }
    }
  }
}

async function typeTitle(page: Page, title: string): Promise<void> {
  await dismissPopups(page);
  const frame = await getEditorFrame(page);

  const titleSelectors = [
    '.se-section-documentTitle',
    '.se-title-text',
    'div.se-module-text span',
    '[contenteditable="true"].se-text-paragraph',
    '.se-documentTitle',
  ];

  for (const sel of titleSelectors) {
    const el = frame.locator(sel).first();
    if (!(await el.count())) continue;
    try {
      await el.click({ timeout: 3000 });
      await sleep(300);
      // 전체 선택 후 입력
      await page.keyboard.press('Control+A');
      await page.keyboard.type(title, { delay: 20 });
      return;
    } catch {
      // try next
    }
  }

  // fallback: 첫 contenteditable
  const editable = frame.locator('[contenteditable="true"]').first();
  if (await editable.count()) {
    await editable.click();
    await page.keyboard.type(title, { delay: 20 });
    return;
  }

  throw new Error('네이버 제목 영역을 찾지 못했습니다.');
}

async function typeBody(page: Page, text: string): Promise<void> {
  const frame = await getEditorFrame(page);

  // 본문 영역 클릭
  const bodySelectors = [
    '.se-section-text',
    '.se-component-content',
    '.se-text-paragraph',
    '[contenteditable="true"]',
  ];

  let focused = false;
  for (const sel of bodySelectors) {
    const els = frame.locator(sel);
    const count = await els.count();
    // 제목 다음 본문 블록을 우선
    for (let i = Math.min(1, count - 1); i < count; i++) {
      try {
        await els.nth(i).click({ timeout: 2000 });
        focused = true;
        break;
      } catch {
        // next
      }
    }
    if (focused) break;
  }

  if (!focused) {
    throw new Error('네이버 본문 영역을 찾지 못했습니다.');
  }

  await sleep(400);
  // 줄 단위로 입력 (긴 본문 안정성)
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.trim() === '') {
      await page.keyboard.press('Enter');
    } else {
      await page.keyboard.type(line, { delay: 12 });
      await page.keyboard.press('Enter');
    }
  }
}

async function uploadPreviewImage(page: Page, imageUrl: string, sheetId: string): Promise<void> {
  const localPath = await downloadToTemp(imageUrl, `preview_${sheetId}.jpg`);
  const frame = await getEditorFrame(page);

  const photoButtons = [
    'button[data-name="image"]',
    'button.se-image-toolbar-button',
    'button:has-text("사진")',
    '.se-toolbar-item-image button',
    'button[aria-label*="사진"]',
    'button[aria-label*="이미지"]',
  ];

  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 15000 }).catch(() => null);

  let clicked = false;
  for (const sel of photoButtons) {
    const btn = frame.locator(sel).first();
    if (!(await btn.count())) {
      const pageBtn = page.locator(sel).first();
      if (await pageBtn.count()) {
        await pageBtn.click({ timeout: 2000 }).catch(() => undefined);
        clicked = true;
        break;
      }
      continue;
    }
    try {
      await btn.click({ timeout: 2000 });
      clicked = true;
      break;
    } catch {
      // next
    }
  }

  if (!clicked) {
    console.warn('[naver] 사진 버튼을 찾지 못해 이미지 업로드를 건너뜁니다.');
    return;
  }

  const chooser = await fileChooserPromise;
  if (chooser) {
    await chooser.setFiles(localPath);
    await sleep(3000);
    return;
  }

  // file input 직접 찾기
  const input = frame.locator('input[type="file"]').first();
  if (await input.count()) {
    await input.setInputFiles(localPath);
    await sleep(3000);
    return;
  }

  const pageInput = page.locator('input[type="file"]').first();
  if (await pageInput.count()) {
    await pageInput.setInputFiles(localPath);
    await sleep(3000);
    return;
  }

  console.warn('[naver] 파일 선택기를 찾지 못해 이미지 업로드를 건너뜁니다.');
}

async function publish(page: Page): Promise<string> {
  const frame = await getEditorFrame(page);

  const publishSelectors = [
    'button.publish_btn__m9KHH',
    'button:has-text("발행")',
    'button[data-click-area="tpb.publish"]',
    '.publish_btn',
    'button.se-publish-button',
  ];

  for (const root of [frame, page]) {
    for (const sel of publishSelectors) {
      const btn = root.locator(sel).first();
      if (!(await btn.count())) continue;
      try {
        await btn.click({ timeout: 3000 });
        await sleep(1500);

        // 확인 레이어의 발행 버튼
        const confirm = page.locator('button:has-text("발행"), button.confirm_btn, button[data-testid="seOnePublishBtn"]').first();
        if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirm.click();
        }
        await sleep(4000);

        // URL 수집
        const url = page.url();
        if (url.includes('/PostView') || url.includes('/')) {
          return url;
        }
        return url;
      } catch {
        // try next
      }
    }
  }

  throw new Error('네이버 발행 버튼을 찾지 못했습니다.');
}

export async function postToNaver(
  cfg: AppConfig,
  post: GeneratedPost,
  opts: { previewImageUrl?: string | null; sheetId: string },
): Promise<{ url: string }> {
  const context = await launchContext();
  const page = context.pages()[0] || (await context.newPage());

  try {
    await openWritePage(page, cfg.naverBlogId);
    await dismissPopups(page);
    await typeTitle(page, post.title);

    if (opts.previewImageUrl) {
      await uploadPreviewImage(page, opts.previewImageUrl, opts.sheetId);
      await sleep(1000);
    }

    // 본문은 플레인 텍스트 + 상품 URL (스마트에디터 HTML 붙여넣기 불안정)
    const bodyText = [
      post.text,
      '',
      `상품 링크: ${post.productUrl}`,
      `카피드럼: https://www.copydrum.com`,
      '',
      post.tags.map((t) => `#${t}`).join(' '),
    ].join('\n');

    await typeBody(page, bodyText);
    const url = await publish(page);
    return { url };
  } catch (err) {
    await saveFailureScreenshot(page, 'naver', 'error');
    throw err;
  } finally {
    await context.close();
  }
}
