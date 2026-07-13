import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

/**
 * Relative import (see src/lib/auth.ts): this module is loaded by plain `node` via scripts/seed.ts,
 * which resolves no aliases.
 */
import { env } from '../lib/env.ts';

const databasePath = env.DATABASE_PATH;
const migrationsFolder = env.MIGRATIONS_PATH ?? join(process.cwd(), 'src/database/migrations');

if (databasePath !== ':memory:') {
  mkdirSync(dirname(databasePath), { recursive: true });
}

const sqlite = new Database(databasePath);
/**
 * ON by default in current better-sqlite3, but the auth schema's cascades depend on it — pin it
 * against upstream default changes.
 */
sqlite.pragma('foreign_keys = ON');
/**
 * WAL lets readers (UI) and writers (/mcp) proceed concurrently against the same file, per the
 * better-sqlite3 README; busy_timeout backs off instead of throwing SQLITE_BUSY on brief write
 * contention. No-op (and harmless) on the in-memory DB used by tests.
 */
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');
/**
 * Importing this module is effectful: it opens (or creates) the database at env.DATABASE_PATH and
 * synchronously runs pending migrations.
 */
export const db = drizzle(sqlite);

migrate(db, { migrationsFolder });
