import { describe, expect, it } from 'vitest';

import { getRouteHandler } from '@testing/routes';

const { Route } = await import('./oauth-authorization-server');

describe('/.well-known/oauth-authorization-server', () => {
  it('returns valid authorization server metadata', async () => {
    const response = await getRouteHandler(
      Route,
      'GET',
    )({
      request: new Request('http://localhost:3000/.well-known/oauth-authorization-server'),
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
    expect(body.registration_endpoint).toBe('http://localhost:3000/api/auth/oauth2/register');
    expect(body.response_types_supported).toContain('code');
    expect(body.grant_types_supported).toEqual(
      expect.arrayContaining(['authorization_code', 'refresh_token']),
    );
    expect(body.code_challenge_methods_supported).toContain('S256');
  });
});
