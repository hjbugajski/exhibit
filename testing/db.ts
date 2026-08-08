import { join } from 'node:path';

import { openDatabase } from '@/database/open';

/**
 * Boots an in-memory db through the app's real boot path (pragmas, migrations, integrity check) so
 * tests and production migrate identically. Callers close `sqlite` themselves (typically in
 * `afterEach`) since drizzle's wrapper doesn't expose a `.close()` of its own.
 */
export function createTestDb() {
  return openDatabase(':memory:', join(process.cwd(), 'src/database/migrations'));
}
