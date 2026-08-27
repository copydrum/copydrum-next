import { loadConfig } from './config.js';
import { authorizeBlogger } from './platforms/blogger.js';

async function main() {
  const cfg = loadConfig({ requireBlogger: true });
  await authorizeBlogger(cfg);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
