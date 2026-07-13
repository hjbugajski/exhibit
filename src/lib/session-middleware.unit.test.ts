import { describe, expect, it, vi } from 'vitest';

/**
 * Stubbing the session helper is the cheapest reliable way to drive the unauthenticated branch
 * here.
 *
 * The server functions this guards
 * (listArtifactsFn/getArtifactDetailFn/deleteArtifactFn/listMcpConnectionsFn/revokeMcpConnectionFn/...)
 * can't be unit-tested directly by calling them: their `.handler(...)` bodies are written *inline*
 * on purpose (see the comment in src/lib/artifacts.ts) so the build can strip the server-only body
 * - including its `db`/better-sqlite3 dependency chain - out of the client bundle. Calling the
 * wrapped function outside the real server runtime also throws ("No Start context found in
 * AsyncLocalStorage"), independent of mocking. What's actually tested here is `requireSession`, the
 * guard `sessionMiddleware` runs before every one of those handlers - the repository calls each
 * handler delegates to afterward
 * (listArtifacts/getArtifact/softDeleteArtifact/summarizeConnections) are already covered by their
 * own unit tests.
 */
vi.mock('@/lib/auth-session', () => ({
  getServerSession: vi.fn(),
}));

const { getServerSession } = await import('@/lib/auth-session');
const { requireSession } = await import('@/lib/session-middleware');

describe('requireSession (shared guard behind sessionMiddleware)', () => {
  it('rejects when there is no session', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    await expect(requireSession()).rejects.toThrow('Unauthorized');
  });

  it('resolves when there is a session', async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: '1', email: 'owner@example.com' },
      session: { id: 's1' },
    } as never);

    await expect(requireSession()).resolves.toBeUndefined();
  });
});
