import { describe, expect, it, vi } from 'vitest';

const { db } = await import('@/database');
const { user } = await import('@/database/schemas/auth');
const { seedOwner, syncOwnerEmailVerified } = await import('./seed');

function verifiedFlags(): boolean[] {
  return db
    .select()
    .from(user)
    .all()
    .map((row) => row.emailVerified);
}

describe('seedOwner', () => {
  it('creates the owner user then is idempotent on a second call', async () => {
    const first = await seedOwner('owner@example.com', 'correct horse battery staple');
    expect(first).toEqual({ created: true });

    const second = await seedOwner('owner@example.com', 'correct horse battery staple');
    expect(second).toEqual({ created: false });
  });

  it('does not create a second user when a user exists under a different email', async () => {
    // OWNER_EMAIL is a first-seed value: after the owner changes their email in /settings, a reboot
    // with the stale env email must be a no-op. Make this test self-establishing (not dependent on
    // the previous test having already created a user in the shared module-level db) by seeding the
    // first email itself before asserting.
    await seedOwner('owner@example.com', 'correct horse battery staple');

    const result = await seedOwner('stale-env-email@example.com', 'correct horse battery staple');
    expect(result).toEqual({ created: false });
  });

  /**
   * The flag exists only to steer Better Auth's /change-email: verified takes the confirm-to-the-
   * OLD-address path (which needs a mailer), unverified takes the apply-immediately path, and
   * Better Auth refuses that one for a verified user. So without a mailer the row must stay
   * unverified or email changes 400 outright. No mailer is configured in this suite (see
   * testing/setup.ts).
   */
  it('leaves the owner unverified without a mailer', async () => {
    await seedOwner('owner@example.com', 'correct horse battery staple');

    expect(verifiedFlags()).toEqual([false]);
  });

  it('marks the owner verified when a mailer is configured', async () => {
    process.env.RESEND_API_KEY = 're_stub_key';
    process.env.EMAIL_FROM = 'exhibit@example.com';
    vi.resetModules();

    try {
      // Re-imported under the new env: src/lib/env.ts parses once at import time, and the reset
      // registry brings its own fresh in-memory database along with it.
      const { db: mailerDb } = await import('@/database');
      const { user: mailerUser } = await import('@/database/schemas/auth');
      const { seedOwner: seedWithMailer } = await import('./seed');

      await seedWithMailer('owner@example.com', 'correct horse battery staple');

      expect(
        mailerDb
          .select()
          .from(mailerUser)
          .all()
          .map((row) => row.emailVerified),
      ).toEqual([true]);
    } finally {
      delete process.env.RESEND_API_KEY;
      delete process.env.EMAIL_FROM;
      vi.resetModules();
    }
  });

  it('un-verifies a row left verified by a since-dropped mailer', async () => {
    // A deployment that had a mailer (row verified) and then removed RESEND_API_KEY/EMAIL_FROM
    // must sync back down, or /change-email 400s forever ("Verification email isn't enabled").
    await seedOwner('owner@example.com', 'correct horse battery staple');
    db.update(user).set({ emailVerified: true }).run();

    syncOwnerEmailVerified();
    expect(verifiedFlags()).toEqual([false]);
  });
});
