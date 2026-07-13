import { describe, expect, it } from 'vitest';

const { summarizeConnections } = await import('./account');

const NOW = 1_000_000;

function client(
  overrides: Partial<{ clientId: string; name: string | null; createdAt: Date | null }> = {},
) {
  return { clientId: 'client-1', name: 'claude.ai', createdAt: new Date(NOW - 5000), ...overrides };
}

function token(
  overrides: Partial<{
    clientId: string;
    createdAt: Date;
    expiresAt: Date;
    revoked: Date | null;
    scopes: unknown;
  }> = {},
) {
  return {
    clientId: 'client-1',
    createdAt: new Date(NOW - 1000),
    expiresAt: new Date(NOW + 1000),
    revoked: null,
    scopes: ['openid'],
    ...overrides,
  };
}

describe('summarizeConnections', () => {
  it('counts only unexpired, unrevoked refresh tokens as active grants', () => {
    const result = summarizeConnections(
      [client()],
      [token(), token({ revoked: new Date(NOW - 500) }), token({ expiresAt: new Date(NOW - 1) })],
      NOW,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.activeGrants).toBe(1);
  });

  it('reports the latest grant time and its scopes', () => {
    const result = summarizeConnections(
      [client()],
      [
        token({ createdAt: new Date(NOW - 3000), scopes: ['openid'] }),
        token({ createdAt: new Date(NOW - 100), scopes: ['openid', 'profile'] }),
      ],
      NOW,
    );

    expect(result[0]?.lastGrantAt).toBe(NOW - 100);
    expect(result[0]?.scopes).toEqual(['openid', 'profile']);
  });

  it('includes clients with no tokens at all', () => {
    const result = summarizeConnections([client({ name: null })], [], NOW);

    expect(result[0]).toMatchObject({
      name: null,
      activeGrants: 0,
      lastGrantAt: null,
      scopes: [],
    });
  });
});
