/**
 * Relative imports (see src/lib/auth.ts) so this module stays importable by scripts/seed.ts, which
 * runs under plain `node` and cannot resolve the `@/*` alias.
 */
import { eq } from 'drizzle-orm';

import { db } from '../database/index.ts';
import { user } from '../database/schemas/auth.ts';
import { createAuth } from './auth.ts';
import { mailerConfigured } from './mailer.ts';

export interface SeedResult {
  created: boolean;
}

/**
 * Syncs the owner's email-verified flag to the mailer configuration. The flag exists for exactly
 * one reason: Better Auth requires it before /change-email sends its confirmation to the OLD
 * address instead of verifying the new one (see the changeEmail block in auth.ts), and that path
 * needs a mailer. Without one, /change-email takes its apply-immediately branch, which Better Auth
 * allows only for an UNVERIFIED user (`canUpdateWithoutVerification`, better-auth
 * dist/api/routes/update-user.mjs) — a stale flag in either direction 400s every email change, so
 * this syncs both ways rather than only setting. Trust is not the concern: the address came from
 * the deploy env or the owner's own authenticated session, never a public signup. Idempotent, and
 * safe to run against any database: this app has exactly one user by design.
 */
export function syncOwnerEmailVerified(): void {
  const verified = mailerConfigured();

  db.update(user).set({ emailVerified: verified }).where(eq(user.emailVerified, !verified)).run();
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
  // signUpEmail leaves email_verified at the schema default (false).
  syncOwnerEmailVerified();

  return { created: true };
}
