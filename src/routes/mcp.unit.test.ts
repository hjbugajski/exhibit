import { describe, expect, it } from 'vitest';

import { getRouteHandler } from '@testing/routes';

const { Route } = await import('./mcp');

describe('/mcp', () => {
  it('returns 401 with the documented WWW-Authenticate header when no Authorization header is sent', async () => {
    const response = await getRouteHandler(
      Route,
      'POST',
    )({
      request: new Request('http://localhost:3000/mcp', { method: 'POST' }),
    } as never);

    if (!(response instanceof Response)) {
      throw new Error('handler did not return a Response');
    }

    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe(
      'Bearer resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource"',
    );
  });

  it('returns 401 invalid_token for a garbage bearer token', async () => {
    const response = await getRouteHandler(
      Route,
      'POST',
    )({
      request: new Request('http://localhost:3000/mcp', {
        method: 'POST',
        headers: { authorization: 'Bearer not-a-real-jwt' },
      }),
    } as never);

    if (!(response instanceof Response)) {
      throw new Error('handler did not return a Response');
    }

    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe(
      'Bearer error="invalid_token", resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource"',
    );
  });

  it('returns 405 with an Allow header for GET', async () => {
    const response = await getRouteHandler(
      Route,
      'GET',
    )({
      request: new Request('http://localhost:3000/mcp'),
    } as never);

    if (!(response instanceof Response)) {
      throw new Error('handler did not return a Response');
    }

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
  });

  it('returns 405 with an Allow header for DELETE', async () => {
    const response = await getRouteHandler(
      Route,
      'DELETE',
    )({
      request: new Request('http://localhost:3000/mcp', { method: 'DELETE' }),
    } as never);

    if (!(response instanceof Response)) {
      throw new Error('handler did not return a Response');
    }

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
  });
});
