import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Route `beforeLoad` guards are UX only; `sessionMiddleware` is the auth boundary for every server
 * fn reachable over `/_serverFn/`. This test forces each server fn to carry it or to be a reviewed
 * `PUBLIC` entry. Adding an entry is a security review decision against the CLAUDE.md invariants.
 */

/** Unguarded on purpose, keyed `<path relative to src>#<export name>`. */
const PUBLIC = new Set([
  'lib/account.ts#passwordResetAvailableFn', // sign-in page reads it; reveals only mailer presence
  'lib/auth-session.ts#getServerSession', // the session lookup the guards themselves call
]);

const SRC_DIR = join(import.meta.dirname, '..');

const DECLARATION = /const\s+(\w+)\s*=\s*createServerFn\s*\(/g;
const CALL = /createServerFn\s*\(/g;
const SESSION_GUARD = /\.middleware\(\s*\[[^\]]*\bsessionMiddleware\b/;

interface ServerFn {
  key: string;
  guarded: boolean;
}

function sourceFiles(): { file: string; source: string }[] {
  return readdirSync(SRC_DIR, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(SRC_DIR, join(entry.parentPath, entry.name)))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => ({ file, source: readFileSync(join(SRC_DIR, file), 'utf8') }));
}

function serverFns(file: string, source: string): ServerFn[] {
  return [...source.matchAll(DECLARATION)].map((match) => {
    const handler = source.indexOf('.handler(', match.index);
    const chain = handler === -1 ? '' : source.slice(match.index + match[0].length, handler);
    // A handler past the next createServerFn call belongs to that call.
    const guarded = !chain.includes('createServerFn') && SESSION_GUARD.test(chain);

    return { key: `${file}#${match[1]}`, guarded };
  });
}

const files = sourceFiles();
const unguarded = files
  .flatMap(({ file, source }) => serverFns(file, source))
  .filter((fn) => !fn.guarded)
  .map((fn) => fn.key);

describe('server fn protection', () => {
  it('guards every server fn outside the public allowlist', () => {
    expect(unguarded.filter((key) => !PUBLIC.has(key))).toEqual([]);
  });

  it('has no stale allowlist entries', () => {
    expect([...PUBLIC].filter((key) => !unguarded.includes(key))).toEqual([]);
  });

  it('declares every server fn as a named const', () => {
    const anonymous = files
      .filter(({ source }) => source.match(CALL)?.length !== source.match(DECLARATION)?.length)
      .map(({ file }) => file);

    expect(anonymous).toEqual([]);
  });
});
