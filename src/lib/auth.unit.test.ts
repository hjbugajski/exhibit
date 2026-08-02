/**
 * Pins the two Better Auth security options that have no observable surface of their own: the rate
 * limiter being force-enabled outside production, and the trusted-proxy list that decides which
 * forwarded hop the limiter (and every other IP-keyed check) believes. Asserted statically rather
 * than by driving a live 429 - a timing-dependent burst test buys no extra confidence here and
 * costs a flaky suite.
 *
 * TRUSTED_PROXIES is set before the app modules load so the assertion covers the real wiring
 * (env parsing, the comma-split transform, the `advanced.ipAddress` key) rather than echoing a
 * literal back. Safe to mutate process.env at module scope: vitest isolates each test file's module
 * registry, so src/lib/env.ts is parsed fresh here.
 */
process.env.TRUSTED_PROXIES = '10.0.0.1, 192.168.0.0/16';

import { describe, expect, it } from 'vitest';

const { auth } = await import('@/lib/auth');

describe('auth configuration', () => {
  it('has rate limiting enabled after Better Auth resolves its defaults', async () => {
    // $context is the resolved context, not the options object we passed in: it reflects Better
    // Auth's own defaulting (which would otherwise leave the limiter off outside production).
    const context = await auth.$context;

    expect(context.rateLimit.enabled).toBe(true);
  });

  it('resolves trusted proxies from TRUSTED_PROXIES', () => {
    expect(auth.options.advanced?.ipAddress?.trustedProxies).toEqual([
      '10.0.0.1',
      '192.168.0.0/16',
    ]);
  });
});
