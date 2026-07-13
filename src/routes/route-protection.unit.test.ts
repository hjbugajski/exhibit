import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Route protection is allowlist-shaped, not default-deny: a new route file is public unless it
 * lives under _authed/ or guards itself. This test forces every route outside _authed/ to be an
 * explicit, reviewed entry below.
 */

/**
 * Reachable without a session — must stay in sync with the CLAUDE.md "Security invariants" list.
 */
const PUBLIC = new Set([
  '__root.tsx', // document shell, no content of its own
  '[.]well-known/oauth-authorization-server.ts',
  '[.]well-known/oauth-protected-resource.ts',
  '[.]well-known/openid-configuration.ts',
  'api/auth/$.ts',
  'healthz.ts',
  'sign-in.tsx',
  'reset-password.tsx',
]);

// Not under _authed/, but carries its own auth check.
const SELF_GUARDED = new Set([
  'consent.tsx', // beforeLoad session guard
  'download.$id.$n.ts', // resolveArtifactVersion session check
  'mcp.ts', // Bearer token via verifyMcpBearer
  'render.$id.$n.ts', // resolveArtifactVersion session check
]);

const ROUTES_DIR = import.meta.dirname;

function routeFiles(): string[] {
  return readdirSync(ROUTES_DIR, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(ROUTES_DIR, join(entry.parentPath, entry.name)))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));
}

describe('route protection', () => {
  it('accounts for every route outside _authed/', () => {
    const unaccounted = routeFiles().filter(
      (file) => !file.startsWith('_authed') && !PUBLIC.has(file) && !SELF_GUARDED.has(file),
    );

    expect(unaccounted).toEqual([]);
  });

  it('has no stale allowlist entries', () => {
    const files = new Set(routeFiles());
    const stale = [...PUBLIC, ...SELF_GUARDED].filter((file) => !files.has(file));

    expect(stale).toEqual([]);
  });
});
