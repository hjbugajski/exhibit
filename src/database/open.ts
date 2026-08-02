import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

/**
 * Opens (or creates) the database, runs pending migrations, and returns the enforcing connection.
 * Import-safe (no environment reads, no module effects): the app boots through src/database/index.ts,
 * tests through @testing/db — both land here so migrations run identically everywhere.
 */
export function openDatabase(path: string, migrationsFolder: string) {
  const sqlite = new Database(path);

  /**
   * WAL lets readers (UI) and writers (/mcp) proceed concurrently against the same file, per the
   * better-sqlite3 README; busy_timeout backs off instead of throwing SQLITE_BUSY on brief write
   * contention. No-op (and harmless) on the in-memory DB used by tests.
   */
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');

  const db = drizzle(sqlite);

  /**
   * Migrations must run with foreign keys DISABLED. drizzle's migrator wraps them in one
   * transaction, where SQLite ignores the `PRAGMA foreign_keys=OFF` drizzle-kit emits inside its
   * table-recreate migrations — so with enforcement on, the recreate's `DROP TABLE` cascade-deletes
   * every child row (artifact_versions/artifact_states, verified against 0001). Disabling here,
   * outside any transaction, actually works; foreign_key_check then covers what the disabled window
   * skipped, per SQLite's documented recreate procedure.
   */
  sqlite.pragma('foreign_keys = OFF');
  migrate(db, { migrationsFolder });
  const violations = sqlite.pragma('foreign_key_check') as unknown[];

  if (violations.length > 0) {
    throw new Error(`Migrations left ${violations.length} foreign key violation(s)`);
  }

  /**
   * ON by default in current better-sqlite3, but the auth schema's cascades depend on it — pin it
   * against upstream default changes.
   */
  sqlite.pragma('foreign_keys = ON');

  return { sqlite, db };
}
