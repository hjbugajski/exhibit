/**
 * Pins the Better Auth security options that have no observable surface of their own: the rate
 * limiter being force-enabled outside production, and the IP-resolution config that decides which
 * forwarded hop the limiter (and every other IP-keyed check) believes. Asserted statically rather
 * than by driving a live 429 - a timing-dependent burst test buys no extra confidence here and
 * costs a flaky suite. The no-proxy case is doubly config-only: `getIp` short-circuits to a
 * localhost constant under dev/test (@better-auth/core/dist/utils/ip.mjs), so the header path it
 * pins only differs in production.
 *
 * TRUSTED_PROXIES is set before the app modules load so the assertion covers the real wiring
 * (env parsing, the comma-split transform, the `advanced.ipAddress` key) rather than echoing a
 * literal back. Safe to mutate process.env at module scope: vitest isolates each test file's module
 * registry, so src/lib/env.ts is parsed fresh here.
 */
process.env.TRUSTED_PROXIES = '10.0.0.1, 192.168.0.0/16';

import { describe, expect, it, vi } from 'vitest';

const CONFIGURED_PROXIES = process.env.TRUSTED_PROXIES;
const NODE_ENV = process.env.NODE_ENV;

const { auth } = await import('@/lib/auth');

describe('auth configuration', () => {
  it('has rate limiting enabled after Better Auth resolves its defaults', async () => {
    // $context is the resolved context, not the options object we passed in: it reflects Better
    // Auth's own defaulting (which would otherwise leave the limiter off outside production).
    const context = await auth.$context;

    expect(context.rateLimit.enabled).toBe(true);
  });

  it('resolves trusted proxies from TRUSTED_PROXIES and keeps reading forwarded headers', () => {
    expect(auth.options.advanced?.ipAddress?.trustedProxies).toEqual([
      '10.0.0.1',
      '192.168.0.0/16',
    ]);
    expect(auth.options.advanced?.ipAddress?.ipAddressHeaders).toBeUndefined();
  });

  /**
   * The collapsed bucket is deliberate (a spoofable per-header bucket defeats the limiter
   * outright), but it is also a real operational cost: a stranger POSTing /sign-in on a timer keeps
   * the owner's own bucket exhausted. Nothing in the app surfaces that, so the operator gets told
   * once at boot - outside dev/test, where it is the intended local behavior.
   */
  it('warns once at boot that rate-limit buckets are shared when TRUSTED_PROXIES is unset', async () => {
    delete process.env.TRUSTED_PROXIES;
    process.env.NODE_ENV = 'production';
    vi.resetModules();

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await import('@/lib/auth');

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain('TRUSTED_PROXIES');

      process.env.TRUSTED_PROXIES = CONFIGURED_PROXIES;
      warn.mockClear();
      vi.resetModules();

      await import('@/lib/auth');

      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      process.env.NODE_ENV = NODE_ENV;
      process.env.TRUSTED_PROXIES = CONFIGURED_PROXIES;
      vi.resetModules();
    }
  });

  it('ignores forwarded IP headers entirely when TRUSTED_PROXIES is unset', async () => {
    delete process.env.TRUSTED_PROXIES;
    vi.resetModules();

    try {
      // `ipAddressHeaders: []` is truthy, so it replaces the ["x-forwarded-for"] default rather than
      // falling back to it: with no proxy declared, a caller-supplied header can no longer buy its
      // own rate-limit bucket.
      const { auth: unproxied } = await import('@/lib/auth');

      expect(unproxied.options.advanced?.ipAddress?.ipAddressHeaders).toEqual([]);
      expect(unproxied.options.advanced?.ipAddress?.trustedProxies).toBeUndefined();
    } finally {
      process.env.TRUSTED_PROXIES = CONFIGURED_PROXIES;
      vi.resetModules();
    }
  });
});
