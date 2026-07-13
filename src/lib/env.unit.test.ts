import { afterEach, describe, expect, it, vi } from 'vitest';

describe('env TRUSTED_PROXIES parsing', () => {
  afterEach(() => {
    delete process.env.TRUSTED_PROXIES;
    vi.resetModules();
  });

  it('is undefined when unset', async () => {
    const { env } = await import('./env');

    expect(env.TRUSTED_PROXIES).toBeUndefined();
  });

  it('is undefined when empty (compose `${VAR:-}` passthrough)', async () => {
    process.env.TRUSTED_PROXIES = '';

    const { env } = await import('./env');

    expect(env.TRUSTED_PROXIES).toBeUndefined();
  });

  it('parses a comma-separated list, trimming entries', async () => {
    process.env.TRUSTED_PROXIES = ' 10.0.0.1 , 192.168.0.0/24 ';

    const { env } = await import('./env');

    expect(env.TRUSTED_PROXIES).toEqual(['10.0.0.1', '192.168.0.0/24']);
  });
});
