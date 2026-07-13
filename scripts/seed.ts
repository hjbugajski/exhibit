/**
 * Creates the single owner user from OWNER_EMAIL/OWNER_PASSWORD env vars.
 *
 * Run with: pnpm seed  (or: node scripts/seed.ts)
 *
 * Idempotent: if any user already exists, exits 0 without making changes (not keyed on OWNER_EMAIL
 * — see src/lib/seed.ts for why). See src/lib/seed.ts for the (tested) implementation.
 *
 * Executed via plain `node` (Node 26 strips TS types natively), so this file uses a relative import
 * with an explicit extension rather than the `@/*` alias, which only Vite resolves.
 */

import { env } from '../src/lib/env.ts';
import { seedOwner } from '../src/lib/seed.ts';

const email = env.OWNER_EMAIL;
const password = env.OWNER_PASSWORD;

if (!email || !password) {
  console.error('OWNER_EMAIL and OWNER_PASSWORD environment variables are required');
  process.exit(1);
}

const { created } = await seedOwner(email, password);

console.log(
  created ? `Created owner user ${email}` : `Owner user ${email} already exists, skipping`,
);
