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

/**
 * Spelled out here rather than compared against the imported RENDER_CSP: asserting
 * `toBe(RENDER_CSP)` would stay green if someone deleted `sandbox allow-scripts`, which is the
 * entire containment story for hostile AI-authored HTML. Changing the served CSP must require
 * changing this literal too - and the directive-level assertions below name what each one protects,
 * so a diff that weakens one fails with an explanation instead of a string mismatch.
 */
const EXPECTED_RENDER_CSP =
  "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline' https://cdnjs.cloudflare.com; img-src https: data:; font-src https: data:; connect-src 'none'; frame-ancestors 'none'";

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

describe('RENDER_CSP', () => {
  it('is exactly the reviewed policy', () => {
    expect(RENDER_CSP).toBe(EXPECTED_RENDER_CSP);
  });

  it('sandboxes the document into an opaque origin, never same-origin with the app', () => {
    expect(RENDER_CSP).toContain('sandbox allow-scripts');
    // `allow-same-origin` would hand hostile artifact script the app's origin: its cookies, its
    // localStorage, and same-origin fetches to every authenticated route.
    expect(RENDER_CSP).not.toContain('allow-same-origin');
  });

  it('forbids the document from talking to the network', () => {
    expect(RENDER_CSP).toContain("connect-src 'none'");
  });

  it('forbids being framed, and limits script/style to inline plus the one allowed CDN', () => {
    expect(RENDER_CSP).toContain("frame-ancestors 'none'");
    expect(RENDER_CSP).toContain("default-src 'none'");
    expect(RENDER_CSP).toContain("script-src 'unsafe-inline' https://cdnjs.cloudflare.com");
    expect(RENDER_CSP).toContain("style-src 'unsafe-inline' https://cdnjs.cloudflare.com");
  });
});

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
    expect(response.headers.get('Content-Security-Policy')).toBe(EXPECTED_RENDER_CSP);
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
