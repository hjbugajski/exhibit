import evlog from 'evlog/nitro/v3';
import type { Nitro, NitroApp } from 'nitro/types';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { requestLogOptions } from '@/lib/request-log-options';

/** Same shape as Better Auth's `generateId(24)` reset token. */
const TOKEN = 'Xq7Lm2Pz9Rt4Vw8Ya1Bc6Dn3';

type Hook = (...args: unknown[]) => Promise<void> | void;

const hooks = new Map<string, Hook>();

/**
 * Registers evlog's real Nitro plugin the way the build does: the module's `setup()` publishes the
 * serialized options and the plugin path, then the plugin runs against a stub app that records its
 * hook handlers.
 */
beforeAll(async () => {
  const nitro = { options: {} } as unknown as Nitro;

  evlog({ ...requestLogOptions, enabled: true, pretty: false }).setup(nitro);

  const [pluginPath] = nitro.options.plugins as string[];
  const { default: plugin } = (await import(`${pluginPath}.mjs`)) as {
    default: (app: NitroApp) => Promise<void>;
  };
  const app = {
    hooks: {
      hook: (name: string, handler: Hook) => hooks.set(name, handler),
      callHook: async () => {},
    },
  };

  await plugin(app as unknown as NitroApp);
});

/** `setup()` also publishes the options to the worker's env, where any later Nitro boot reads them. */
afterAll(() => {
  delete process.env.__EVLOG_CONFIG;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Drives one request through the plugin's `request` and `response` hooks; returns emitted lines. */
async function logRequest(method: string, url: string): Promise<string[]> {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const event = { req: Object.assign(new Request(url, { method }), { context: {} }) };

  await hooks.get('request')?.(event);
  await hooks.get('response')?.(new Response(null, { status: 200 }), event);

  return info.mock.calls.map((call) => call.map(String).join(' '));
}

describe('requestLogOptions', () => {
  it('omits the token-bearing reset-password link from the request log', async () => {
    const lines = await logRequest(
      'GET',
      `http://localhost/api/auth/reset-password/${TOKEN}?callbackURL=%2Freset-password`,
    );

    expect(lines).toEqual([]);
  });

  it('logs the token-free reset-password submission', async () => {
    const lines = await logRequest('POST', 'http://localhost/api/auth/reset-password');

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ path: '/api/auth/reset-password' });
  });

  it('logs the reset-password page without its token query', async () => {
    const lines = await logRequest('GET', `http://localhost/reset-password?token=${TOKEN}`);

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ path: '/reset-password' });
    expect(lines[0]).not.toContain(TOKEN);
  });
});
