/**
 * The other half of auth.int.test.ts: the same real /api/auth surface, but with no mailer
 * configured — the deployment shape that runs without RESEND_API_KEY/EMAIL_FROM.
 *
 * Which of Better Auth's three change-email flows is reachable is decided by config AND by the
 * owner row's `emailVerified` (better-auth 1.6.25, dist/api/routes/update-user.mjs:449-455):
 * `updateEmailWithoutVerification` applies only to an UNVERIFIED user. So marking the owner
 * verified — which is right when a mailer exists, since it buys the confirm-to-the-old-address flow
 * — would 400 every email change here instead. src/lib/seed.ts gates the flag on the mailer for
 * exactly that reason, and this suite is the pin on it.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { user } from '@/database/schemas/auth';
import { bootTestServer, cookieHeader } from '@testing/server';
import type { TestServer } from '@testing/server';

const dbDir = mkdtempSync(join(tmpdir(), 'exhibit-auth-mailerless-int-'));

process.env.DATABASE_PATH = join(dbDir, 'app.db');

const ORIGIN = 'http://localhost:3000';
/** See auth.int.test.ts: declaring a proxy keeps the cases out of one shared rate-limit bucket. */
const TRUSTED_PROXY = '10.0.0.1';
const OWNER_EMAIL = 'owner@example.com';
const OWNER_PASSWORD = 'correct horse battery staple';
const MOVED_EMAIL = 'moved@example.com';

let server: TestServer;

function authFetch(
  path: string,
  init: { body?: unknown; cookie?: string; ip?: string } = {},
): Promise<Response> {
  return server.devServer.fetch(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: init.body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        ...(init.cookie ? { cookie: init.cookie } : {}),
        ...(init.ip ? { 'x-forwarded-for': `${init.ip}, ${TRUSTED_PROXY}` } : {}),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    }),
  );
}

beforeAll(async () => {
  const { seedOwner } = await import('@/lib/seed');

  await seedOwner(OWNER_EMAIL, OWNER_PASSWORD);

  // Set before the dev server boots: its Nitro runner is a worker thread that copies process.env at
  // creation, and src/lib/env.ts parses once at import time inside it. RESEND_API_KEY/EMAIL_FROM
  // are deliberately left unset - that is the configuration under test.
  process.env.TRUSTED_PROXIES = TRUSTED_PROXY;

  server = await bootTestServer(new URL('../../vite.config.ts', import.meta.url));
}, 30000);

afterAll(async () => {
  await server.vite.close();
  rmSync(dbDir, { recursive: true, force: true });

  delete process.env.TRUSTED_PROXIES;
});

describe('with no mailer configured', () => {
  it('leaves the seeded owner unverified, so the immediate change-email path stays open', async () => {
    const { db } = await import('@/database');

    expect(
      db
        .select()
        .from(user)
        .all()
        .map((row) => row.emailVerified),
    ).toEqual([false]);
  });

  it('applies an email change immediately instead of 400ing for a missing verification email', async () => {
    const { db } = await import('@/database');

    const signInResponse = await authFetch('/sign-in/email', {
      body: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
      ip: '203.0.113.10',
    });

    expect(signInResponse.status).toBe(200);

    const changeResponse = await authFetch('/change-email', {
      cookie: cookieHeader(signInResponse),
      body: { newEmail: MOVED_EMAIL, callbackURL: '/' },
    });

    expect(changeResponse.status).toBe(200);
    expect(
      db
        .select()
        .from(user)
        .all()
        .map((row) => row.email),
    ).toEqual([MOVED_EMAIL]);
  });
});
