import { describe, expect, it, vi } from 'vitest';

import { getRouteHandler } from '@testing/routes';

vi.mock('@/lib/request-session', () => ({
  getSessionForRequest: vi.fn(),
}));

const { getSessionForRequest } = await import('@/lib/request-session');
const { db } = await import('@/database');
const { createArtifact } = await import('@/database/repository');
const { Route } = await import('./download.$id.$n');

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

describe('/download/$id/$n', () => {
  it('returns 401 when there is no session', async () => {
    vi.mocked(getSessionForRequest).mockResolvedValue(null);

    const response = await callHandler({
      request: new Request('http://localhost:3000/download/x/1'),
      params: { id: 'x', n: '1' },
    });

    expect(response.status).toBe(401);
  });

  it.each(['abc', '0', '1e21'])('returns 400 for an invalid version param %s', async (n) => {
    vi.mocked(getSessionForRequest).mockResolvedValue(fakeSession as never);

    const response = await callHandler({
      request: new Request(`http://localhost:3000/download/x/${n}`),
      params: { id: 'x', n },
    });

    expect(response.status).toBe(400);
  });

  it('serves a spec artifact as pretty-printed JSON with a Content-Disposition header', async () => {
    vi.mocked(getSessionForRequest).mockResolvedValue(fakeSession as never);

    const { artifact } = createArtifact(db, {
      title: 'Download Me',
      type: 'spec',
      body: '{"root":"a","elements":{}}',
    });

    const response = await callHandler({
      request: new Request(`http://localhost:3000/download/${artifact.id}/1`),
      params: { id: artifact.id, n: '1' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="download-me-v1.json"',
    );
    expect(await response.text()).toBe('{\n  "root": "a",\n  "elements": {}\n}');
  });

  it('serves an html artifact as raw HTML with a Content-Disposition header', async () => {
    vi.mocked(getSessionForRequest).mockResolvedValue(fakeSession as never);

    const html = '<html><body>hi</body></html>';
    const { artifact } = createArtifact(db, { title: 'HTML Download', type: 'html', body: html });

    const response = await callHandler({
      request: new Request(`http://localhost:3000/download/${artifact.id}/1`),
      params: { id: artifact.id, n: '1' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="html-download-v1.html"',
    );
    expect(await response.text()).toBe(html);
  });

  it('serves the raw body when a spec artifact has a malformed stored body', async () => {
    vi.mocked(getSessionForRequest).mockResolvedValue(fakeSession as never);

    const { artifact } = createArtifact(db, {
      title: 'Malformed Spec',
      type: 'spec',
      body: 'not valid json',
    });

    const response = await callHandler({
      request: new Request(`http://localhost:3000/download/${artifact.id}/1`),
      params: { id: artifact.id, n: '1' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await response.text()).toBe('not valid json');
  });

  it('returns 404 for an unknown artifact id', async () => {
    vi.mocked(getSessionForRequest).mockResolvedValue(fakeSession as never);

    const response = await callHandler({
      request: new Request('http://localhost:3000/download/does-not-exist/1'),
      params: { id: 'does-not-exist', n: '1' },
    });

    expect(response.status).toBe(404);
  });
});
