import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import type { Db } from '@/database/repository';

export interface TestDb {
  db: Db;
  sqlite: Database.Database;
}

/**
 * Boots an in-memory, migrated better-sqlite3 db for tests. Callers close `sqlite` themselves
 * (typically in `afterEach`) since drizzle's wrapper doesn't expose a `.close()` of its own.
 */
export function createTestDb(): TestDb {
  const sqlite = new Database(':memory:');

  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite);

  migrate(db, { migrationsFolder: join(process.cwd(), 'src/database/migrations') });

  return { db, sqlite };
}
