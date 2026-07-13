import { describe, expect, it } from 'vitest';

const { seedOwner } = await import('./seed');

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
});
