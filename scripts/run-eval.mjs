// Runs the search evaluation against the local test database and rewrites docs/evaluation-results.md.
// Usage: npm run eval
import { spawnSync } from 'node:child_process';

const r = spawnSync('npx', ['jest', '--config', 'jest.int.config.js', 'test-int/search-eval'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, WRITE_EVAL_REPORT: '1' },
});
process.exit(r.status ?? 1);
