import { createHash } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { createLocalJWKSet, errors as joseErrors, jwtVerify } from 'jose';

import { db } from '@/database';
import { oauthAccessToken } from '@/database/schemas/auth';
import { auth } from '@/lib/auth';
import { env } from '@/lib/env';

export interface McpAuthSuccess {
  ok: true;
  subject: string | undefined;
}

export interface McpAuthFailure {
  ok: false;
  status: 401;
  wwwAuthenticate: string;
}

export type McpAuthResult = McpAuthSuccess | McpAuthFailure;

function wwwAuthenticate(baseURL: string, error?: 'invalid_token'): string {
  const parts = error ? [`error="${error}"`] : [];

  parts.push(`resource_metadata="${baseURL}/.well-known/oauth-protected-resource"`);

  return `Bearer ${parts.join(', ')}`;
}

/**
 * Looks up an opaque OAuth access token (Better Auth's oauth-provider only mints a JWT when the
 * token request includes a `resource` param; without one the client gets an opaque token stored in
 * `oauth_access_token`). The provider's default `storeTokens: "hashed"` config hashes tokens before
 * storage (SHA-256, base64url, unpadded — see `defaultHasher` in `@better-auth/oauth-provider`), so
 * the incoming raw token must be hashed the same way before the lookup.
 */
function verifyOpaqueToken(token: string): McpAuthSuccess | undefined {
  const hashedToken = createHash('sha256').update(token).digest('base64url');
  const row = db
    .select({ userId: oauthAccessToken.userId, expiresAt: oauthAccessToken.expiresAt })
    .from(oauthAccessToken)
    .where(eq(oauthAccessToken.token, hashedToken))
    .get();

  if (!row || row.expiresAt.getTime() <= Date.now()) {
    return undefined;
  }

  return { ok: true, subject: row.userId ?? undefined };
}

/**
 * Verifies the `Authorization: Bearer <token>` header on an incoming /mcp request against the app's
 * own JWKS (Better Auth's `jwt` plugin, issuer pinned to `BASE_URL` — see src/lib/auth.ts),
 * accepting either audience configured as valid (`BASE_URL` or `BASE_URL/mcp`). Tokens that aren't
 * a parseable JWT fall back to a lookup in `oauth_access_token`, since not every token request
 * yields a JWT (see verifyOpaqueToken).
 *
 * Verification is local: the JWKS is read from the database via `auth.api.getJwks()` rather than
 * fetched from `BASE_URL/api/auth/jwks` over the network — inside a container the public BASE_URL
 * usually isn't reachable from the app itself (port mapping, hairpin NAT).
 */
export async function verifyMcpBearer(request: Request): Promise<McpAuthResult> {
  const baseURL = env.BASE_URL;

  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : undefined;

  if (!token) {
    return { ok: false, status: 401, wwwAuthenticate: wwwAuthenticate(baseURL) };
  }

  try {
    const jwks = createLocalJWKSet(await auth.api.getJwks());
    const { payload } = await jwtVerify(token, jwks, {
      issuer: baseURL,
      audience: [baseURL, `${baseURL}/mcp`],
    });

    return { ok: true, subject: typeof payload.sub === 'string' ? payload.sub : undefined };
  } catch (error) {
    // Only token-validation failures map to 401; anything else (e.g. a DB failure while loading the
    // JWKS via auth.api.getJwks()) is a genuine server error and must propagate rather than be
    // reported as the client's fault.
    if (!(error instanceof joseErrors.JOSEError)) {
      throw error;
    }

    // JWSInvalid/JWTInvalid mean the token isn't a parseable JWT at all (as opposed to a JWT that
    // failed signature/claim checks) — it may still be a valid opaque access token.
    if (error instanceof joseErrors.JWSInvalid || error instanceof joseErrors.JWTInvalid) {
      const opaque = verifyOpaqueToken(token);

      if (opaque) {
        return opaque;
      }
    }

    return { ok: false, status: 401, wwwAuthenticate: wwwAuthenticate(baseURL, 'invalid_token') };
  }
}
