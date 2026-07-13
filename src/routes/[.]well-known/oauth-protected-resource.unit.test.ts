import { describe, expect, it } from 'vitest';

import { getRouteHandler } from '@testing/routes';

const { Route } = await import('./oauth-protected-resource');

describe('/.well-known/oauth-protected-resource', () => {
  it('returns valid protected resource metadata', async () => {
    const response = await getRouteHandler(
      Route,
      'GET',
    )({
      request: new Request('http://localhost:3000/.well-known/oauth-protected-resource'),
    } as never);
    if (!(response instanceof Response)) {
      throw new Error('handler did not return a Response');
    }

    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;

    expect(body.resource).toBe('http://localhost:3000/mcp');
    expect(body.authorization_servers).toEqual(['http://localhost:3000']);
    expect(body.bearer_methods_supported).toEqual(['header']);
  });
});
