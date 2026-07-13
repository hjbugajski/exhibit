import { describe, expect, it } from 'vitest';

import { getRouteHandler } from '@testing/routes';

const { Route } = await import('./healthz');

describe('/healthz', () => {
  it('returns 200 with ok status', async () => {
    const response = await getRouteHandler(
      Route,
      'GET',
    )({
      request: new Request('http://localhost/healthz'),
    } as never);
    if (!(response instanceof Response)) {
      throw new Error('handler did not return a Response');
    }
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok', db: true });
  });
});
