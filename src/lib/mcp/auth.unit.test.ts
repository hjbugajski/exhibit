import { createHash } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';

const BASE_URL = 'http://localhost:3000';

const getJwks = vi.fn();

/**
 * `@/lib/mcp/auth` only calls `auth.api.getJwks()` — stub the whole module so the test doesn't need
 * a real BETTER_AUTH_SECRET-backed instance, and so the JWKS returned to `createLocalJWKSet` is
 * fully test-controlled.
 */
vi.mock('@/lib/auth', () => ({
  auth: { api: { getJwks } },
}));

const { verifyMcpBearer } = await import('@/lib/mcp/auth');
const { db } = await import('@/database');
const { oauthAccessToken, oauthClient, user } = await import('@/database/schemas/auth');

const KID = 'test-kid';

/**
 * Every JWT the provider mints carries the client id it was minted for as `azp`, and verification
 * now requires that registration to still exist and be enabled - so the JWT cases below need a
 * default client on record.
 */
const AZP = 'jwt-client';

db.insert(oauthClient)
  .values({ id: 'jwt-client-row', clientId: AZP, redirectUris: ['https://example.com'] })
  .run();

const { publicKey, privateKey } = await generateKeyPair('RS256');
const publicJwk = await exportJWK(publicKey);

publicJwk.kid = KID;
publicJwk.alg = 'RS256';

getJwks.mockResolvedValue({ keys: [publicJwk] });

function request(token?: string): Request {
  const headers = new Headers();

  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  return new Request('http://localhost:3000/mcp', { headers });
}

/** `azp: null` mints a token without the claim at all, which must not authenticate. */
function mintJwt(
  overrides: {
    issuer?: string;
    audience?: string | string[];
    expirationTime?: number;
    subject?: string;
    azp?: string | null;
  } = {},
): Promise<string> {
  return new SignJWT(overrides.azp === null ? {} : { azp: overrides.azp ?? AZP })
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setSubject(overrides.subject ?? 'user-1')
    .setIssuedAt()
    .setIssuer(overrides.issuer ?? BASE_URL)
    .setAudience(overrides.audience ?? BASE_URL)
    .setExpirationTime(overrides.expirationTime ?? Math.floor(Date.now() / 1000) + 3600)
    .sign(privateKey);
}

describe('verifyMcpBearer', () => {
  it('rejects a missing Authorization header with 401 + WWW-Authenticate', async () => {
    const result = await verifyMcpBearer(request());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.wwwAuthenticate).toContain('Bearer');
      expect(result.wwwAuthenticate).toContain('resource_metadata=');
      expect(result.wwwAuthenticate).not.toContain('error=');
    }
  });

  it('rejects a garbage non-JWT token with no matching opaque row', async () => {
    const result = await verifyMcpBearer(request('not-a-jwt-and-not-in-the-db'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.wwwAuthenticate).toContain('error="invalid_token"');
    }
  });

  it('accepts a garbage non-JWT token that matches an unexpired opaque access-token row', async () => {
    db.insert(user).values({ id: 'user-42', name: 'Owner', email: 'owner@example.com' }).run();
    db.insert(oauthClient)
      .values({ id: 'client-row', clientId: 'client-1', redirectUris: ['https://example.com'] })
      .run();
    db.insert(oauthAccessToken)
      .values({
        id: 'token-row',
        // Better Auth's oauth-provider defaults to `storeTokens: "hashed"` (SHA-256, base64url,
        // unpadded) — the stored `token` column holds the hash, never the raw bearer value.
        token: createHash('sha256').update('opaque-token-value').digest('base64url'),
        clientId: 'client-1',
        userId: 'user-42',
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        scopes: ['openid'],
      })
      .run();

    const result = await verifyMcpBearer(request('opaque-token-value'));

    expect(result).toEqual({ ok: true, subject: 'user-42' });
  });

  it('rejects a garbage non-JWT token whose raw value (not its hash) is stored', async () => {
    db.insert(user).values({ id: 'user-43', name: 'Owner 2', email: 'owner2@example.com' }).run();
    db.insert(oauthClient)
      .values({ id: 'client-row-2', clientId: 'client-2', redirectUris: ['https://example.com'] })
      .run();
    db.insert(oauthAccessToken)
      .values({
        id: 'token-row-2',
        // Deliberately stores the raw bearer value, not its hash — this must NOT authenticate,
        // since the real provider only ever stores the hashed form.
        token: 'raw-unhashed-token-value',
        clientId: 'client-2',
        userId: 'user-43',
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        scopes: ['openid'],
      })
      .run();

    const result = await verifyMcpBearer(request('raw-unhashed-token-value'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.wwwAuthenticate).toContain('error="invalid_token"');
    }
  });

  it('rejects an expired JWT', async () => {
    const token = await mintJwt({ expirationTime: Math.floor(Date.now() / 1000) - 10 });
    const result = await verifyMcpBearer(request(token));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.wwwAuthenticate).toContain('error="invalid_token"');
    }
  });

  it('rejects a JWT with the wrong issuer', async () => {
    const token = await mintJwt({ issuer: 'http://evil.example.com' });
    const result = await verifyMcpBearer(request(token));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
    }
  });

  it('rejects a JWT with the wrong audience', async () => {
    const token = await mintJwt({ audience: 'http://other-app.example.com' });
    const result = await verifyMcpBearer(request(token));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
    }
  });

  it('accepts a valid JWT and returns its subject', async () => {
    const token = await mintJwt({ subject: 'user-123' });
    const result = await verifyMcpBearer(request(token));

    expect(result).toEqual({ ok: true, subject: 'user-123' });
  });

  it('accepts a valid JWT audienced to BASE_URL/mcp', async () => {
    const token = await mintJwt({ audience: `${BASE_URL}/mcp`, subject: 'user-456' });
    const result = await verifyMcpBearer(request(token));

    expect(result).toEqual({ ok: true, subject: 'user-456' });
  });

  it('rejects an otherwise-valid JWT with no azp claim', async () => {
    const token = await mintJwt({ azp: null });
    const result = await verifyMcpBearer(request(token));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.wwwAuthenticate).toContain('error="invalid_token"');
    }
  });

  /**
   * The revocation guarantee: /settings "Revoke" deletes the oauth_client row, and a JWT minted
   * before that must stop working on its very next request rather than at its own expiry.
   */
  it('rejects an unexpired JWT whose client registration has been deleted', async () => {
    db.insert(oauthClient)
      .values({ id: 'revoked-row', clientId: 'revoked-client', redirectUris: ['https://x.test'] })
      .run();

    const token = await mintJwt({ azp: 'revoked-client' });

    expect(await verifyMcpBearer(request(token))).toEqual({ ok: true, subject: 'user-1' });

    db.delete(oauthClient).where(eq(oauthClient.clientId, 'revoked-client')).run();

    const result = await verifyMcpBearer(request(token));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.wwwAuthenticate).toContain('error="invalid_token"');
    }
  });

  it('rejects a valid JWT whose client registration is disabled', async () => {
    db.insert(oauthClient)
      .values({
        id: 'disabled-row',
        clientId: 'disabled-client',
        disabled: true,
        redirectUris: ['https://x.test'],
      })
      .run();

    const token = await mintJwt({ azp: 'disabled-client' });
    const result = await verifyMcpBearer(request(token));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.wwwAuthenticate).toContain('error="invalid_token"');
    }
  });
});
