/**
 * Revocation cascade against a real migrated :memory: sqlite db (FKs must be ON — see
 * src/database/index.ts's comment pinning `foreign_keys = ON`, since cascades silently no-op
 * otherwise).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '@/database/repository';
import {
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
  user,
} from '@/database/schemas/auth';
import { createTestDb } from '@testing/db';
import { bootTestServer, serverFnCaller, signInOwner } from '@testing/server';
import type { ServerFnCaller, TestServer } from '@testing/server';

/**
 * Separate from the `:memory:` db above (used by the FK-cascade suite below, which drives SQL
 * directly): this one backs the real server-fn RPC suite, which needs a db the in-process dev
 * server can also see - see src/lib/artifacts.int.test.ts's file comment for why a server fn's
 * inline handler body can only be exercised through that real route, and how this harness drives
 * it.
 */
const dbDir = mkdtempSync(join(tmpdir(), 'exhibit-account-int-'));

process.env.DATABASE_PATH = join(dbDir, 'app.db');
process.env.TSS_SERVER_FN_BASE = '/_serverFn/';

const ORIGIN = 'http://localhost:3000';
const OWNER_EMAIL = 'owner@example.com';
const OWNER_PASSWORD = 'correct horse battery staple';

let sqlite: Database.Database;
let db: Db;

function seedClient(db: Db, clientId: string) {
  db.insert(oauthClient)
    .values({
      id: `${clientId}-row`,
      clientId,
      redirectUris: ['https://claude.ai/callback'],
    })
    .run();

  db.insert(oauthRefreshToken)
    .values({
      id: `${clientId}-refresh`,
      token: `${clientId}-refresh-token`,
      clientId,
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      scopes: ['openid'],
    })
    .run();

  db.insert(oauthAccessToken)
    .values({
      id: `${clientId}-access`,
      token: `${clientId}-access-token`,
      clientId,
      userId: 'user-1',
      refreshId: `${clientId}-refresh`,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      scopes: ['openid'],
    })
    .run();

  db.insert(oauthConsent)
    .values({
      id: `${clientId}-consent`,
      clientId,
      userId: 'user-1',
      scopes: ['openid'],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
}

beforeEach(() => {
  ({ db, sqlite } = createTestDb());
  db.insert(user).values({ id: 'user-1', name: 'Owner', email: 'owner@example.com' }).run();
});

afterEach(() => {
  sqlite.close();
});

afterAll(() => {
  rmSync(dbDir, { recursive: true, force: true });
});

describe('oauth_client FK cascade', () => {
  it('deleting the oauth_client row cascades to its refresh/access/consent rows, sparing other clients', () => {
    seedClient(db, 'client-a');
    seedClient(db, 'client-b');

    db.delete(oauthClient).where(eq(oauthClient.clientId, 'client-a')).run();

    expect(db.select().from(oauthClient).where(eq(oauthClient.clientId, 'client-a')).all()).toEqual(
      [],
    );
    expect(
      db.select().from(oauthRefreshToken).where(eq(oauthRefreshToken.clientId, 'client-a')).all(),
    ).toEqual([]);
    expect(
      db.select().from(oauthAccessToken).where(eq(oauthAccessToken.clientId, 'client-a')).all(),
    ).toEqual([]);
    expect(
      db.select().from(oauthConsent).where(eq(oauthConsent.clientId, 'client-a')).all(),
    ).toEqual([]);

    expect(
      db.select().from(oauthClient).where(eq(oauthClient.clientId, 'client-b')).all(),
    ).toHaveLength(1);
    expect(
      db.select().from(oauthRefreshToken).where(eq(oauthRefreshToken.clientId, 'client-b')).all(),
    ).toHaveLength(1);
    expect(
      db.select().from(oauthAccessToken).where(eq(oauthAccessToken.clientId, 'client-b')).all(),
    ).toHaveLength(1);
    expect(
      db.select().from(oauthConsent).where(eq(oauthConsent.clientId, 'client-b')).all(),
    ).toHaveLength(1);
  });
});

describe('revokeMcpConnectionFn (through the real server-fn RPC route)', () => {
  let server: TestServer;
  let ownerCookie: string;
  let revokeMcpConnection: ServerFnCaller;

  beforeAll(async () => {
    const { db: appDb } = await import('@/database');
    const { seedOwner } = await import('@/lib/seed');

    await seedOwner(OWNER_EMAIL, OWNER_PASSWORD);
    appDb
      .insert(oauthClient)
      .values({
        id: 'rpc-client-row',
        clientId: 'rpc-client',
        redirectUris: ['https://claude.ai/callback'],
      })
      .run();

    server = await bootTestServer(new URL('../../vite.config.ts', import.meta.url));
    ownerCookie = await signInOwner(server, ORIGIN, OWNER_EMAIL, OWNER_PASSWORD);
    revokeMcpConnection = await serverFnCaller(
      server,
      '/src/lib/account.ts',
      'revokeMcpConnectionFn',
      'POST',
      ORIGIN,
    );
  }, 30000);

  afterAll(async () => {
    await server.vite.close();
  });

  it('revokes a real client registration for an authenticated caller', async () => {
    const { db: appDb } = await import('@/database');

    const result = await revokeMcpConnection({ clientId: 'rpc-client' }, { cookie: ownerCookie });

    expect(result).toEqual({ revoked: true });
    expect(
      appDb.select().from(oauthClient).where(eq(oauthClient.clientId, 'rpc-client')).all(),
    ).toEqual([]);
  });

  it('rejects an unauthenticated call', async () => {
    await expect(revokeMcpConnection({ clientId: 'rpc-client' })).rejects.toThrow('Unauthorized');
  });
});
