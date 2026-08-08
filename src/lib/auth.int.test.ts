/**
 * Credential flows (change password, change email) driven against the app's REAL /api/auth surface
 * through the dev-server harness, so what's asserted is Better Auth's actual behavior under this
 * app's config rather than a mock of it. The settings-view component tests stay mocked - the seam
 * under test here is the server.
 *
 * The only thing stubbed is Resend's HTTP endpoint: `RESEND_BASE_URL` points the real Resend client
 * at a loopback recorder, so src/lib/mailer.ts, the `mailerConfigured()` branches in
 * src/lib/auth.ts, and Better Auth's own send callbacks all run for real and nothing leaves the
 * machine.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { user } from '@/database/schemas/auth';
import { bootTestServer, cookieHeader } from '@testing/server';
import type { TestServer } from '@testing/server';

const dbDir = mkdtempSync(join(tmpdir(), 'exhibit-auth-int-'));

process.env.DATABASE_PATH = join(dbDir, 'app.db');

const ORIGIN = 'http://localhost:3000';
/**
 * The one hop this suite's requests claim to arrive through. With no trusted proxy declared,
 * src/lib/auth.ts pins `ipAddressHeaders: []` and every caller collapses into one rate-limit bucket
 * (the point of that setting) - which would make the cases below race each other into a 429 rather
 * than exercise the credential checks they mean to. Declaring a proxy is also the shape of a real
 * deployment, so the suite runs the config an owner behind a reverse proxy actually gets.
 */
const TRUSTED_PROXY = '10.0.0.1';
const OWNER_EMAIL = 'owner@example.com';
const OWNER_PASSWORD = 'correct horse battery staple';
const NEW_PASSWORD = 'a different correct horse battery staple';

interface SentEmail {
  to: string[];
  subject: string;
  text: string;
}

let server: TestServer;
let resendStub: Server;
let sentEmails: SentEmail[] = [];

/** Records what the app tries to send instead of reaching api.resend.com. */
async function startResendStub(): Promise<Server> {
  const stub = createServer((req, res) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      sentEmails.push(JSON.parse(Buffer.concat(chunks).toString()) as SentEmail);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'stub-email-id' }));
    });
  });

  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));

  return stub;
}

function authFetch(
  path: string,
  init: { body?: unknown; cookie?: string; ip?: string; method?: string } = {},
): Promise<Response> {
  return server.devServer.fetch(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: {
        'content-type': 'application/json',
        ...(init.cookie ? { cookie: init.cookie } : {}),
        // Better Auth's rate limiter buckets by (client IP, path) and caps credential paths at 3
        // requests / 10s, so giving each sign-in its own address keeps the cases independent -
        // otherwise a later "the old password is rejected" assertion could pass on a 429 instead of
        // on the credential check it means to exercise. The trailing hop is what makes the address
        // believed: TRUSTED_PROXIES is set below, and Better Auth walks the chain from the right to
        // the first untrusted entry.
        ...(init.ip ? { 'x-forwarded-for': `${init.ip}, ${TRUSTED_PROXY}` } : {}),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    }),
  );
}

function signIn(password: string, ip: string): Promise<Response> {
  return authFetch('/sign-in/email', { body: { email: OWNER_EMAIL, password }, ip });
}

async function getSessionUserEmail(cookie: string): Promise<string | null> {
  const response = await authFetch('/get-session', { cookie });
  const session = (await response.json()) as { user?: { email: string } } | null;

  return session?.user?.email ?? null;
}

beforeAll(async () => {
  const { seedOwner } = await import('@/lib/seed');

  await seedOwner(OWNER_EMAIL, OWNER_PASSWORD);

  resendStub = await startResendStub();
  const address = resendStub.address();

  if (!address || typeof address === 'string') {
    throw new Error('failed to determine the Resend stub port');
  }

  // Set before the dev server boots: its Nitro runner is a worker thread that copies process.env at
  // creation, and src/lib/env.ts parses once at import time inside it.
  process.env.RESEND_BASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.RESEND_API_KEY = 're_stub_key';
  process.env.EMAIL_FROM = 'exhibit@example.com';
  process.env.TRUSTED_PROXIES = TRUSTED_PROXY;

  server = await bootTestServer(new URL('../../vite.config.ts', import.meta.url));
}, 30000);

afterAll(async () => {
  await server.vite.close();
  await new Promise<void>((resolve, reject) =>
    resendStub.close((error) => (error ? reject(error) : resolve())),
  );
  rmSync(dbDir, { recursive: true, force: true });

  // Vitest reuses a worker process across test files, so leaving these set would silently hand a
  // configured mailer (and a dead stub URL) to whichever suite runs next in this worker.
  delete process.env.RESEND_BASE_URL;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.TRUSTED_PROXIES;
});

describe('changing the password', () => {
  it('revokes the other sessions and leaves the caller signed in', async () => {
    const first = await signIn(OWNER_PASSWORD, '203.0.113.1');
    const second = await signIn(OWNER_PASSWORD, '203.0.113.2');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const firstCookie = cookieHeader(first);
    const secondCookie = cookieHeader(second);

    expect(await getSessionUserEmail(secondCookie)).toBe(OWNER_EMAIL);

    const changeResponse = await authFetch('/change-password', {
      cookie: firstCookie,
      body: {
        currentPassword: OWNER_PASSWORD,
        newPassword: NEW_PASSWORD,
        revokeOtherSessions: true,
      },
    });

    expect(changeResponse.status).toBe(200);

    // The point of revokeOtherSessions: a session opened before the password changed (a shared
    // machine, a stolen cookie) must stop working, while the owner doing the change stays in.
    expect(await getSessionUserEmail(secondCookie)).toBeNull();
    expect(await getSessionUserEmail(cookieHeader(changeResponse) || firstCookie)).toBe(
      OWNER_EMAIL,
    );
  });

  it('accepts only the new password afterwards', async () => {
    const withOld = await signIn(OWNER_PASSWORD, '203.0.113.3');

    expect(withOld.ok).toBe(false);

    const withNew = await signIn(NEW_PASSWORD, '203.0.113.4');

    expect(withNew.status).toBe(200);
    expect(cookieHeader(withNew).length).toBeGreaterThan(0);
  });
});

describe('with a mailer configured', () => {
  it('sends the password reset link through the real mailer', async () => {
    sentEmails = [];

    const response = await authFetch('/request-password-reset', {
      body: { email: OWNER_EMAIL, redirectTo: '/reset-password' },
    });

    expect(response.status).toBe(200);
    // Also proves the Resend stub is wired: an empty `sentEmails` in the next case would otherwise
    // be indistinguishable from a stub the app never reached.
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]?.to).toEqual([OWNER_EMAIL]);
    expect(sentEmails[0]?.subject).toBe('Reset your Exhibit password');
    expect(sentEmails[0]?.text).toContain('/reset-password');
  });

  /**
   * Which of Better Auth's three change-email flows runs is decided by config
   * (better-auth 1.6.25, dist/api/routes/update-user.mjs:449-455), and two of the three are wrong
   * for this app: without `emailVerification.sendVerificationEmail` the endpoint 400s outright,
   * and with it but an unverified owner row it verifies the NEW address - which, for someone who
   * has stolen the session, is an address they chose. Only the seeded-verified owner reaches the
   * flow asserted here. That makes this test the pin on both halves of the fix.
   */
  it('sends the change-email confirmation to the OLD address and applies nothing until it is followed', async () => {
    const { db } = await import('@/database');

    sentEmails = [];

    const signInResponse = await signIn(NEW_PASSWORD, '203.0.113.5');

    expect(signInResponse.status).toBe(200);

    const changeResponse = await authFetch('/change-email', {
      cookie: cookieHeader(signInResponse),
      body: { newEmail: 'moved@example.com', callbackURL: '/' },
    });

    expect(changeResponse.status).toBe(200);
    expect(sentEmails).toHaveLength(1);
    // The anti-takeover property: the confirmation goes to the address on file, never to the one
    // the request asked to move to.
    expect(sentEmails[0]?.to).toEqual([OWNER_EMAIL]);
    expect(sentEmails[0]?.subject).toBe('Confirm your Exhibit email change');
    expect(sentEmails[0]?.text).toContain('/verify-email?token=');
    expect(
      db
        .select()
        .from(user)
        .all()
        .map((row) => row.email),
    ).toEqual([OWNER_EMAIL]);
  });
});
