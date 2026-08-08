import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Relative imports (see src/lib/auth.ts): this module is loaded by plain `node` via
 * scripts/seed.ts, which resolves no aliases.
 */
import { env } from '../lib/env.ts';
import { openDatabase } from './open.ts';

const databasePath = env.DATABASE_PATH;
const migrationsFolder = env.MIGRATIONS_PATH ?? join(process.cwd(), 'src/database/migrations');

if (databasePath !== ':memory:') {
  mkdirSync(dirname(databasePath), { recursive: true });
}

/**
 * Importing this module is effectful: it opens (or creates) the database at env.DATABASE_PATH and
 * synchronously runs pending migrations.
 */
export const db = openDatabase(databasePath, migrationsFolder).db;
