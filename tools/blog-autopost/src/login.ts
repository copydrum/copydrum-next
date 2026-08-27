import { loadConfig, type AutoPostPlatform } from './config.js';
import { parseArgs } from './utils.js';
import { loginNaver } from './platforms/naver.js';
import { loginTistory } from './platforms/tistory.js';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const platform = String(args.platform || '').toLowerCase() as AutoPostPlatform;

  if (platform !== 'naver' && platform !== 'tistory') {
    console.log('사용법:');
    console.log('  npm run login -- --platform=naver');
    console.log('  npm run login -- --platform=tistory');
    process.exit(1);
  }

  if (platform === 'naver') {
    const cfg = loadConfig({ requireNaver: true });
    await loginNaver(cfg);
    return;
  }

  const cfg = loadConfig({ requireTistory: true });
  await loginTistory(cfg);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
