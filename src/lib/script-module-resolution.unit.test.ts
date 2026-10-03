/**
 * `pnpm seed` and `scripts/dev-publish.ts` run under plain `node`, which cannot resolve the `@/*`
 * alias, so their import chains must stay relative (see CLAUDE.md). Vite resolves the alias, so only
 * a real `node` run catches a leak before `pnpm seed` breaks in production.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * ESM resolves the whole graph before any module evaluates, so the script's own env error proves
 * every import resolved. The empty env keeps both scripts off the database and the network.
 */
function runWithEmptyEnv(script: string) {
  return spawnSync(process.execPath, [script], { cwd: repoRoot, env: {}, encoding: 'utf8' });
}

describe('plain-node script import chains', () => {
  it.each([
    ['scripts/seed.ts', 'Invalid environment'],
    ['scripts/dev-publish.ts', 'BASE_URL environment variable is required'],
  ])('%s resolves every import and stops at its env check', (script, envError) => {
    const result = runWithEmptyEnv(script);

    expect(result.status).not.toBe(0);
    expect(result.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
    expect(result.stderr).toContain(envError);
  });
});
