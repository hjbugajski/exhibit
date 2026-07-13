import { describe, expect, it } from 'vitest';

import { getRouteHandler } from '@testing/routes';

const { Route } = await import('./openid-configuration');

describe('/.well-known/openid-configuration', () => {
  it('returns valid OIDC discovery metadata derived from BASE_URL', async () => {
    const response = await getRouteHandler(
      Route,
      'GET',
    )({
      request: new Request('http://localhost:3000/.well-known/openid-configuration'),
    } as never);
    if (!(response instanceof Response)) {
      throw new Error('handler did not return a Response');
    }

    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;

    expect(body.issuer).toBe('http://localhost:3000');
    expect(body.authorization_endpoint).toBe('http://localhost:3000/api/auth/oauth2/authorize');
    expect(body.token_endpoint).toBe('http://localhost:3000/api/auth/oauth2/token');
    expect(body.jwks_uri).toBe('http://localhost:3000/api/auth/jwks');
  });
});
