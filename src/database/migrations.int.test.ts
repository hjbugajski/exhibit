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

/**
 * Boots the real migration path twice: once with only the initial migration, then — after data
 * exists — with the rest. Migrating a database that already holds rows is exactly what the empty
 * in-memory test databases never exercise, and it is where 0001's table recreate cascade-deleted
 * every artifact_versions/artifact_states row until openDatabase disabled foreign keys around the
 * migrator.
 */
describe('openDatabase migrations', () => {
  it('preserves child rows across the 0001 table recreate and widens the type CHECK', () => {
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
});
