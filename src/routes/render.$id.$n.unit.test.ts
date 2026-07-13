import { describe, expect, it, vi } from 'vitest';

import { getRouteHandler } from '@testing/routes';

/**
 * Handler-level test in the style of src/routes/mcp.unit.test.ts: stub the session helper (cheapest
 * reliable approach - a real cookie would need a full Better Auth sign-in round trip, which the
 * auth-session unit tests and the OAuth integration test already cover) and call the route's
 * exported GET handler directly with a plain Request.
 */
vi.mock('@/lib/request-session', () => ({
  getSessionForRequest: vi.fn(),
}));

const { getSessionForRequest } = await import('@/lib/request-session');
const { db } = await import('@/database');
const { createArtifact } = await import('@/database/repository');
const { Route, RENDER_CSP } = await import('./render.$id.$n');

const fakeSession = { user: { id: '1', email: 'owner@example.com' }, session: { id: 's1' } };

async function callHandler(args: {
  request: Request;
  params: { id: string; n: string };
}): Promise<Response> {
  const response = await getRouteHandler(Route, 'GET')(args as never);

  if (!(response instanceof Response)) {
    throw new Error('handler did not return a Response');
  }

  return response;
}

describe('/render/$id/$n', () => {
  it('returns 401 when there is no session', async () => {
    vi.mocked(getSessionForRequest).mockResolvedValue(null);

    const response = await callHandler({
      request: new Request('http://localhost:3000/render/x/1'),
      params: { id: 'x', n: '1' },
    });

    expect(response.status).toBe(401);
  });

  it.each(['abc', '0', '1e21'])('returns 400 for an invalid version param %s', async (n) => {
    vi.mocked(getSessionForRequest).mockResolvedValue(fakeSession as never);

    const response = await callHandler({
      request: new Request(`http://localhost:3000/render/x/${n}`),
      params: { id: 'x', n },
    });

    expect(response.status).toBe(400);
  });

  it('returns 4xx for a spec-type artifact', async () => {
    vi.mocked(getSessionForRequest).mockResolvedValue(fakeSession as never);

    const { artifact } = createArtifact(db, {
      title: 'A Spec',
      type: 'spec',
      body: '{"root":"a","elements":{}}',
    });

    const response = await callHandler({
      request: new Request(`http://localhost:3000/render/${artifact.id}/1`),
      params: { id: artifact.id, n: '1' },
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it('returns 200 with the CSP/nosniff headers and the raw HTML body for an html artifact', async () => {
    vi.mocked(getSessionForRequest).mockResolvedValue(fakeSession as never);

    const html = '<html><body><script>alert(1)</script></body></html>';
    const { artifact } = createArtifact(db, { title: 'An HTML doc', type: 'html', body: html });

    const response = await callHandler({
      request: new Request(`http://localhost:3000/render/${artifact.id}/1`),
      params: { id: artifact.id, n: '1' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('Content-Security-Policy')).toBe(RENDER_CSP);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await response.text()).toBe(html);
  });

  it('returns 404 for an unknown artifact id', async () => {
    vi.mocked(getSessionForRequest).mockResolvedValue(fakeSession as never);

    const response = await callHandler({
      request: new Request('http://localhost:3000/render/does-not-exist/1'),
      params: { id: 'does-not-exist', n: '1' },
    });

    expect(response.status).toBe(404);
  });
});
