import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openDatabase } from '@/database/open';

const migrationsFolder = join(process.cwd(), 'src/database/migrations');

let dir: string;

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Copies only the initial migration into a fresh temp folder so a test can seed rows before head. */
function createBaseFolder() {
  dir = mkdtempSync(join(tmpdir(), 'exhibit-migrations-'));

  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, 'meta/_journal.json'), 'utf8'),
  ) as {
    entries: { idx: number; tag: string }[];
  };
  const [first] = journal.entries;

  if (!first) {
    throw new Error('migration journal is empty');
  }

  const baseFolder = join(dir, 'base');

  mkdirSync(join(baseFolder, 'meta'), { recursive: true });
  cpSync(join(migrationsFolder, `${first.tag}.sql`), join(baseFolder, `${first.tag}.sql`));
  cpSync(
    join(migrationsFolder, `meta/${first.idx.toString().padStart(4, '0')}_snapshot.json`),
    join(baseFolder, `meta/${first.idx.toString().padStart(4, '0')}_snapshot.json`),
  );
  writeFileSync(
    join(baseFolder, 'meta/_journal.json'),
    JSON.stringify({ ...journal, entries: [first] }),
  );

  return baseFolder;
}

/**
 * Boots the real migration path twice: once with only the initial migration, then — after data
 * exists — with the rest. Migrating a database that already holds rows is exactly what the empty
 * in-memory test databases never exercise, and it is where 0001's table recreate cascade-deleted
 * every artifact_versions/artifact_states row until openDatabase disabled foreign keys around the
 * migrator.
 */
describe('openDatabase migrations', () => {
  it('preserves child rows across the 0001 table recreate and widens the type CHECK', () => {
    const baseFolder = createBaseFolder();
    const dbPath = join(dir, 'app.db');
    const seeded = openDatabase(dbPath, baseFolder);

    seeded.sqlite
      .prepare(
        "insert into artifacts (id, title, type, created_at, updated_at) values ('a1', 'T', 'spec', 1, 1)",
      )
      .run();
    seeded.sqlite
      .prepare(
        "insert into artifact_versions (id, artifact_id, version, body, created_at) values ('v1', 'a1', 1, '{}', 1)",
      )
      .run();
    seeded.sqlite
      .prepare(
        "insert into artifact_states (artifact_id, state, updated_at) values ('a1', '{}', 1)",
      )
      .run();
    seeded.sqlite.close();

    const migrated = openDatabase(dbPath, migrationsFolder);
    const count = (table: string) =>
      (migrated.sqlite.prepare(`select count(*) c from ${table}`).get() as { c: number }).c;

    expect(count('artifacts')).toBe(1);
    expect(count('artifact_versions')).toBe(1);
    expect(count('artifact_states')).toBe(1);

    expect(() =>
      migrated.sqlite
        .prepare(
          "insert into artifacts (id, title, type, created_at, updated_at) values ('a2', 'M', 'markdown', 1, 1)",
        )
        .run(),
    ).not.toThrow();

    migrated.sqlite.close();
  });

  it('drops account.issuer and its index while preserving credential accounts', () => {
    const baseFolder = createBaseFolder();
    const dbPath = join(dir, 'app.db');
    const seeded = openDatabase(dbPath, baseFolder);

    seeded.sqlite
      .prepare(
        "insert into user (id, name, email, created_at, updated_at) values ('u1', 'Owner', 'owner@example.com', 1, 1)",
      )
      .run();
    seeded.sqlite
      .prepare(
        "insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at) values ('acc1', 'u1', 'credential', 'u1', 'hash', 1, 1)",
      )
      .run();
    seeded.sqlite.close();

    const migrated = openDatabase(dbPath, migrationsFolder);

    expect(migrated.sqlite.prepare("select password from account where id = 'acc1'").get()).toEqual(
      { password: 'hash' },
    );
    expect(
      (migrated.sqlite.prepare('pragma table_info(account)').all() as { name: string }[]).map(
        (column) => column.name,
      ),
    ).not.toContain('issuer');
    expect(
      migrated.sqlite
        .prepare("select name from sqlite_master where type = 'index' and name = ?")
        .get('account_issuer_accountId_idx'),
    ).toBeUndefined();

    migrated.sqlite.close();
  });

  /**
   * The owner, a registered MCP client and its grants must all survive every auth-schema migration,
   * or an upgrade silently signs the owner out and disconnects Claude. Raw SQL because the current
   * drizzle schema no longer matches 0000.
   */
  it('preserves the owner, sessions and OAuth rows and backfills application_type', () => {
    const baseFolder = createBaseFolder();
    const dbPath = join(dir, 'app.db');
    const seeded = openDatabase(dbPath, baseFolder);

    seeded.sqlite.exec(`
      insert into user (id, name, email) values ('u1', 'Owner', 'owner@example.com');
      insert into account (id, account_id, provider_id, user_id, password, updated_at)
        values ('acc1', 'u1', 'credential', 'u1', 'hash', 1);
      insert into session (id, expires_at, token, updated_at, user_id)
        values ('s1', 1, 'session-token', 1, 'u1');
      insert into oauth_client (id, client_id, redirect_uris, type)
        values ('c1', 'client-1', '["https://example.com/callback"]', 'web');
      insert into oauth_consent (id, client_id, user_id, scopes, created_at, updated_at)
        values ('consent1', 'client-1', 'u1', '["openid"]', 1, 1);
      insert into oauth_refresh_token (id, token, client_id, session_id, user_id, expires_at, created_at, scopes)
        values ('r1', 'refresh-token', 'client-1', 's1', 'u1', 1, 1, '["openid"]');
      insert into oauth_access_token (id, token, client_id, session_id, user_id, refresh_id, expires_at, created_at, scopes)
        values ('t1', 'access-token', 'client-1', 's1', 'u1', 'r1', 1, 1, '["openid"]');
    `);
    seeded.sqlite.close();

    const migrated = openDatabase(dbPath, migrationsFolder);
    const count = (table: string) =>
      (migrated.sqlite.prepare(`select count(*) c from ${table}`).get() as { c: number }).c;

    for (const table of [
      'user',
      'account',
      'session',
      'oauth_client',
      'oauth_consent',
      'oauth_refresh_token',
      'oauth_access_token',
    ]) {
      expect(count(table), table).toBe(1);
    }
    expect(migrated.sqlite.prepare('select application_type from oauth_client').get()).toEqual({
      application_type: 'web',
    });

    migrated.sqlite.close();
  });
});
