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

describe('env validation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([
    ['RESEND_API_KEY', 'EMAIL_FROM', 'RESEND_API_KEY and EMAIL_FROM must be set together'],
    ['EMAIL_FROM', 'RESEND_API_KEY', 'RESEND_API_KEY and EMAIL_FROM must be set together'],
    ['OWNER_EMAIL', 'OWNER_PASSWORD', 'OWNER_EMAIL and OWNER_PASSWORD must be set together'],
    ['OWNER_PASSWORD', 'OWNER_EMAIL', 'OWNER_EMAIL and OWNER_PASSWORD must be set together'],
  ])('rejects %s without %s', async (setName, unsetName, message) => {
    vi.stubEnv(setName, 'value');
    vi.stubEnv(unsetName, undefined);

    await expect(import('./env')).rejects.toThrow(message);
  });

  it('rejects a BASE_URL that is not a URL', async () => {
    vi.stubEnv('BASE_URL', 'not a url');

    await expect(import('./env')).rejects.toThrow('Invalid environment');
  });

  it('rejects an unset BETTER_AUTH_SECRET', async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', undefined);

    await expect(import('./env')).rejects.toThrow('Invalid environment');
  });

  it('treats an empty RESEND_API_KEY as unset, so it needs no EMAIL_FROM', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('EMAIL_FROM', undefined);

    const { env } = await import('./env');

    expect(env.RESEND_API_KEY).toBeUndefined();
  });
});
