/**
 * Revocation cascade, at two levels. The first suite drives SQL directly against a `:memory:` db
 * from @testing/db (whose own `foreign_keys = ON` pragma it exercises) to pin the schema's cascade
 * rules; the second drives the oauth_client-reading server fns through the real server-fn RPC route
 * against the app's own db — which is where `src/database/index.ts`'s pragma is what's under test,
 * since a cascade silently no-ops when foreign keys are off.
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

/** A client registration plus one row in every table that hangs off it by ON DELETE CASCADE. */
function seedClient(db: Db, clientId: string, userId: string) {
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
      userId,
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
      userId,
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
      userId,
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
    seedClient(db, 'client-a', 'user-1');
    seedClient(db, 'client-b', 'user-1');

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

describe('/settings server fns (through the real server-fn RPC route)', () => {
  let server: TestServer;
  let ownerCookie: string;
  let getConsentClient: ServerFnCaller;
  let revokeMcpConnection: ServerFnCaller;

  beforeAll(async () => {
    const { db: appDb } = await import('@/database');
    const { seedOwner } = await import('@/lib/seed');

    await seedOwner(OWNER_EMAIL, OWNER_PASSWORD);

    const owner = appDb.select().from(user).limit(1).get();

    if (!owner) {
      throw new Error('seedOwner did not create the owner user');
    }

    seedClient(appDb, 'rpc-client', owner.id);

    server = await bootTestServer(new URL('../../vite.config.ts', import.meta.url));
    ownerCookie = await signInOwner(server, ORIGIN, OWNER_EMAIL, OWNER_PASSWORD);
    getConsentClient = await serverFnCaller(
      server,
      '/src/lib/account.ts',
      'getConsentClientFn',
      'GET',
      ORIGIN,
    );
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

  it('has foreign keys on, without which every cascade below silently no-ops', async () => {
    const { db: appDb } = await import('@/database');

    expect(appDb.$client.pragma('foreign_keys')).toEqual([{ foreign_keys: 1 }]);
  });

  it('reads the consent screen’s identity facts from the registration itself', async () => {
    // seedClient stores one redirect URI and no createdAt, so this also pins what the consent
    // screen shows for a registration of unknown age.
    expect(await getConsentClient({ clientId: 'rpc-client' }, { cookie: ownerCookie })).toEqual({
      name: null,
      redirectHosts: ['claude.ai'],
      createdAt: null,
    });
    expect(
      await getConsentClient({ clientId: 'no-such-client' }, { cookie: ownerCookie }),
    ).toBeNull();
  });

  it('rejects an unauthenticated read of the consent client', async () => {
    await expect(getConsentClient({ clientId: 'rpc-client' })).rejects.toThrow('Unauthorized');
  });

  it('revokes a real client registration for an authenticated caller, taking its tokens and consent with it', async () => {
    const { db: appDb } = await import('@/database');

    expect(
      appDb
        .select()
        .from(oauthRefreshToken)
        .where(eq(oauthRefreshToken.clientId, 'rpc-client'))
        .all(),
    ).toHaveLength(1);

    const result = await revokeMcpConnection({ clientId: 'rpc-client' }, { cookie: ownerCookie });

    expect(result).toEqual({ revoked: true });
    expect(
      appDb.select().from(oauthClient).where(eq(oauthClient.clientId, 'rpc-client')).all(),
    ).toEqual([]);

    // revokeMcpConnectionFn only deletes the client row; the promise the settings "Revoke" button
    // makes — that the connection can no longer reach anything — is kept entirely by these
    // cascades. Leftovers here would mean a revoked client keeps working.
    expect(
      appDb
        .select()
        .from(oauthRefreshToken)
        .where(eq(oauthRefreshToken.clientId, 'rpc-client'))
        .all(),
    ).toEqual([]);
    expect(
      appDb
        .select()
        .from(oauthAccessToken)
        .where(eq(oauthAccessToken.clientId, 'rpc-client'))
        .all(),
    ).toEqual([]);
    expect(
      appDb.select().from(oauthConsent).where(eq(oauthConsent.clientId, 'rpc-client')).all(),
    ).toEqual([]);
  });

  it('rejects an unauthenticated call', async () => {
    await expect(revokeMcpConnection({ clientId: 'rpc-client' })).rejects.toThrow('Unauthorized');
  });
});
