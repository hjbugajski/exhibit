/**
 * Relative imports (see src/lib/auth.ts) so this module stays importable by scripts/seed.ts, which
 * runs under plain `node` and cannot resolve the `@/*` alias.
 */
import { db } from '../database/index.ts';
import { user } from '../database/schemas/auth.ts';
import { createAuth } from './auth.ts';

export interface SeedResult {
  created: boolean;
}

/**
 * Creates the single owner user on first boot. Idempotent, and deliberately keyed on "any user
 * exists", not the email: OWNER_EMAIL/OWNER_PASSWORD are first-seed values only — the owner can
 * change both in /settings, and a later boot with the stale env email must not create a second
 * account.
 */
export async function seedOwner(email: string, password: string): Promise<SeedResult> {
  // Check-then-act, not wrapped in db.transaction: better-sqlite3/drizzle transactions are
  // synchronous and signUpEmail below is an async better-auth API call, so a transaction can't span
  // both without committing before the await resolves. Two concurrent callers racing past this
  // check would both hit signUpEmail with the same OWNER_EMAIL (single process, same env var), and
  // user.email is unique — the loser fails loudly (better-auth's own duplicate-email check, or the
  // DB constraint) instead of silently creating a second owner.
  const existing = db.select().from(user).limit(1).get();

  if (existing) {
    return { created: false };
  }

  // The app's normal Better Auth instance has sign-up disabled; build a separate instance (same
  // secret/db) with sign-up enabled just for this.
  const auth = createAuth({ disableSignUp: false });

  await auth.api.signUpEmail({ body: { email, password, name: email } });

  return { created: true };
}
