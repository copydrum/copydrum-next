/**
 * CopyDrum 블로그 자동 포스팅 CLI
 *
 * 사용 예:
 *   npm run dry-run
 *   npm run post -- --platform=google --limit=1
 *   npm run post -- --platform=naver,tistory,google --limit=1
 *   npm run post -- --platform=all --limit=1
 */

import { generateMarketingPost, type MarketingPlatform } from '../../../src/lib/marketing/postTemplate.ts';
import {
  ALL_PLATFORMS,
  loadConfig,
  type AutoPostPlatform,
} from './config.js';
import { countTodaySuccess, fetchUnpostedSheets, getDailyLimit, isAlreadyPosted } from './queue.js';
import { logPost } from './log.js';
import { parseArgs, randomDelay } from './utils.js';
import { postToBlogger } from './platforms/blogger.js';
import { postToTistory } from './platforms/tistory.js';
import { postToNaver } from './platforms/naver.js';

function resolvePlatforms(raw: string | boolean | undefined): AutoPostPlatform[] {
  if (!raw || raw === true || raw === 'all') return [...ALL_PLATFORMS];
  const list = String(raw)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as AutoPostPlatform[];

  for (const p of list) {
    if (!ALL_PLATFORMS.includes(p)) {
      throw new Error(`알 수 없는 플랫폼: ${p}. 사용 가능: ${ALL_PLATFORMS.join(', ')}, all`);
    }
  }
  return list;
}

async function postOne(
  platform: AutoPostPlatform,
  sheet: Awaited<ReturnType<typeof fetchUnpostedSheets>>[number],
  cfg: ReturnType<typeof loadConfig>,
  dryRun: boolean,
): Promise<'success' | 'failed' | 'skipped'> {
  const post = generateMarketingPost(sheet, platform as MarketingPlatform);

  console.log(`\n── [${platform}] ${sheet.artist} - ${sheet.title}`);
  console.log(`   제목: ${post.title}`);
  console.log(`   URL : ${post.productUrl}`);

  if (dryRun) {
    console.log('   [dry-run] 본문 미리보기 (앞 400자):');
    console.log('   ' + post.text.slice(0, 400).replace(/\n/g, '\n   '));
    return 'skipped';
  }

  if (await isAlreadyPosted(cfg, platform, sheet.id)) {
    console.log('   이미 포스팅됨 — 건너뜀');
    return 'skipped';
  }

  try {
    let url = '';
    if (platform === 'google') {
      ({ url } = await postToBlogger(cfg, post));
    } else if (platform === 'tistory') {
      ({ url } = await postToTistory(cfg, post));
    } else if (platform === 'naver') {
      ({ url } = await postToNaver(cfg, post, {
        previewImageUrl: sheet.preview_image_url,
        sheetId: sheet.id,
      }));
    }

    await logPost(cfg, {
      platform,
      sheetId: sheet.id,
      status: 'success',
      postUrl: url,
    });
    console.log(`   ✅ 발행 완료: ${url}`);
    return 'success';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`   ❌ 실패: ${message}`);
    await logPost(cfg, {
      platform,
      sheetId: sheet.id,
      status: 'failed',
      errorMessage: message.slice(0, 500),
    });
    return 'failed';
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = Boolean(args['dry-run']);
  const platforms = resolvePlatforms(args.platform);
  const limitOverride = args.limit !== undefined ? Number(args.limit) : undefined;

  const cfg = loadConfig({
    requireBlogger: !dryRun && platforms.includes('google'),
    requireTistory: !dryRun && platforms.includes('tistory'),
    requireNaver: !dryRun && platforms.includes('naver'),
  });

  console.log(`CopyDrum blog autopost${dryRun ? ' (dry-run)' : ''}`);
  console.log(`플랫폼: ${platforms.join(', ')}`);

  const summary: Record<string, { success: number; failed: number; skipped: number }> = {};

  for (const platform of platforms) {
    summary[platform] = { success: 0, failed: 0, skipped: 0 };

    const dailyLimit = await getDailyLimit(cfg, platform);
    const todayCount = await countTodaySuccess(cfg, platform);
    const remaining = Math.max(0, dailyLimit - todayCount);
    const limit = Math.min(remaining, limitOverride ?? remaining);

    console.log(`\n=== ${platform} ===`);
    console.log(`일일 한도 ${dailyLimit} / 오늘 ${todayCount} / 이번 실행 ${limit}`);

    if (limit <= 0) {
      console.log('남은 할당량 없음 — 건너뜀');
      continue;
    }

    const sheets = await fetchUnpostedSheets(cfg, platform, limit);
    if (sheets.length === 0) {
      console.log('포스팅할 새 악보 없음');
      continue;
    }

    for (let i = 0; i < sheets.length; i++) {
      const result = await postOne(platform, sheets[i], cfg, dryRun);
      summary[platform][result]++;

      // 네이버는 글 사이 랜덤 대기 (어뷰징 완화)
      if (!dryRun && platform === 'naver' && i < sheets.length - 1 && result === 'success') {
        await randomDelay(3 * 60 * 1000, 10 * 60 * 1000);
      }
    }
  }

  console.log('\n======== 결과 ========');
  for (const [platform, s] of Object.entries(summary)) {
    console.log(`${platform}: success=${s.success} failed=${s.failed} skipped=${s.skipped}`);
  }
}

main().catch((err) => {
  console.error('\n치명적 오류:', err instanceof Error ? err.message : err);
  process.exit(1);
});
