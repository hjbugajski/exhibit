import { describe, expect, it } from 'vitest';

const { db } = await import('@/database');
const { user } = await import('@/database/schemas/auth');
const { markOwnerEmailVerified, seedOwner } = await import('./seed');

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
   * signUpEmail leaves the row unverified, and Better Auth only sends a change-email confirmation
   * to the CURRENT address when it is verified - otherwise it verifies the address the request
   * asked to move to, which a session thief chooses. The seed email is trusted by construction.
   */
  it('marks the owner verified on creation', async () => {
    await seedOwner('owner@example.com', 'correct horse battery staple');

    expect(verifiedFlags()).toEqual([true]);
  });

  it('backfills an owner row that predates the flag, and is a no-op afterwards', async () => {
    await seedOwner('owner@example.com', 'correct horse battery staple');
    db.update(user).set({ emailVerified: false }).run();

    markOwnerEmailVerified();
    expect(verifiedFlags()).toEqual([true]);

    markOwnerEmailVerified();
    expect(verifiedFlags()).toEqual([true]);
  });
});
