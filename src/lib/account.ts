import { createServerFn } from '@tanstack/react-start';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/database';
import { oauthClient, oauthRefreshToken } from '@/database/schemas/auth';
import { mailerConfigured } from '@/lib/mailer';
import { sessionMiddleware } from '@/lib/session-middleware';

/**
 * Server functions backing /settings. Same bundling rule as artifacts.ts: handler bodies stay
 * inline so the client bundle never pulls in `db`.
 */

/** One MCP client registration plus a summary of its token grants. */
export interface McpConnection {
  clientId: string;
  name: string | null;
  createdAt: number | null;
  lastGrantAt: number | null;
  activeGrants: number;
  scopes: string[];
}

/** The identity facts the consent screen decides against. */
export interface ConsentClient {
  name: string | null;
  redirectHosts: string[];
  createdAt: number | null;
}

interface ClientRow {
  clientId: string;
  name: string | null;
  createdAt: Date | null;
}

interface TokenRow {
  clientId: string;
  createdAt: Date;
  expiresAt: Date;
  revoked: Date | null;
  scopes: unknown;
}

/**
 * Pure aggregation (exported for tests): joins client registrations with their refresh-token
 * grants. `activeGrants` counts unexpired, unrevoked refresh tokens — the thing revocation actually
 * kills.
 */
export function summarizeConnections(
  clients: ClientRow[],
  tokens: TokenRow[],
  now: number,
): McpConnection[] {
  return clients.map((client) => {
    const grants = tokens.filter((token) => token.clientId === client.clientId);
    const active = grants.filter((token) => !token.revoked && token.expiresAt.getTime() > now);
    const latest = grants.reduce<TokenRow | null>(
      (best, token) => (!best || token.createdAt > best.createdAt ? token : best),
      null,
    );

    return {
      clientId: client.clientId,
      name: client.name,
      createdAt: client.createdAt?.getTime() ?? null,
      lastGrantAt: latest?.createdAt.getTime() ?? null,
      activeGrants: active.length,
      scopes: Array.isArray(latest?.scopes)
        ? latest.scopes.filter((s) => typeof s === 'string')
        : [],
    };
  });
}

/**
 * Whether outbound email (Resend) is configured. Public — the sign-in page uses it to decide if
 * "Forgot password?" is worth showing. Reveals nothing beyond a deployment capability.
 */
export const passwordResetAvailableFn = createServerFn({ method: 'GET' }).handler(async () =>
  mailerConfigured(),
);

/**
 * MCP client registrations with grant summaries, most recently active first (latest grant, falling
 * back to registration time).
 */
export const listMcpConnectionsFn = createServerFn({ method: 'GET' })
  .middleware([sessionMiddleware])
  .handler(async (): Promise<McpConnection[]> => {
    const clients = db
      .select({
        clientId: oauthClient.clientId,
        name: oauthClient.name,
        createdAt: oauthClient.createdAt,
      })
      .from(oauthClient)
      .all();
    const tokens = db
      .select({
        clientId: oauthRefreshToken.clientId,
        createdAt: oauthRefreshToken.createdAt,
        expiresAt: oauthRefreshToken.expiresAt,
        revoked: oauthRefreshToken.revoked,
        scopes: oauthRefreshToken.scopes,
      })
      .from(oauthRefreshToken)
      .all();

    return summarizeConnections(clients, tokens, Date.now()).sort(
      (a, b) => (b.lastGrantAt ?? b.createdAt ?? 0) - (a.lastGrantAt ?? a.createdAt ?? 0),
    );
  });

/**
 * Unique hosts (with port, so a loopback client reads as `127.0.0.1:8765`) from a client's stored
 * `redirect_uris` — a JSON column, hence `unknown`. Exported for tests. Entries that aren't a
 * parseable URL are dropped: the consent screen presents these as the fact "this is where the
 * authorization code goes", and a string that isn't a URL is not that fact.
 *
 * Rows written by Better Auth's adapter arrive double-encoded: it stringifies the array itself
 * before drizzle's `mode: 'json'` stringifies again, so one parse yields a string holding JSON,
 * not the array. Unwrap that layer before deciding the shape is wrong.
 */
export function redirectHosts(redirectUris: unknown): string[] {
  if (typeof redirectUris === 'string') {
    try {
      redirectUris = JSON.parse(redirectUris);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(redirectUris)) {
    return [];
  }

  return [
    ...new Set(
      redirectUris.flatMap((uri) => {
        if (typeof uri !== 'string') {
          return [];
        }

        try {
          return [new URL(uri).host];
        } catch {
          return [];
        }
      }),
    ),
  ];
}

const consentClientInput = z.object({ clientId: z.string() });

/**
 * What the consent screen knows about the client asking for access. Deliberately not Better Auth's
 * public client-info endpoint: that returns only the name/uri/icon the client chose for itself at
 * dynamic registration, which anyone who can reach the origin can set to anything. Redirect hosts
 * and registration time are recorded by the server, so they are the part of the decision an
 * attacker cannot write.
 */
export const getConsentClientFn = createServerFn({ method: 'GET' })
  .middleware([sessionMiddleware])
  .validator(consentClientInput)
  .handler(async ({ data }): Promise<ConsentClient | null> => {
    const row = db
      .select({
        name: oauthClient.name,
        createdAt: oauthClient.createdAt,
        redirectUris: oauthClient.redirectUris,
      })
      .from(oauthClient)
      .where(eq(oauthClient.clientId, data.clientId))
      .get();

    if (!row) {
      return null;
    }

    return {
      name: row.name,
      redirectHosts: redirectHosts(row.redirectUris),
      createdAt: row.createdAt?.getTime() ?? null,
    };
  });

const revokeInput = z.object({ clientId: z.string() });

export const revokeMcpConnectionFn = createServerFn({ method: 'POST' })
  .middleware([sessionMiddleware])
  .validator(revokeInput)
  .handler(async ({ data }) => {
    // Deleting the client registration cascades to its refresh tokens, access-token rows, and
    // consent (FKs with ON DELETE CASCADE). The client re-registers dynamically if it ever
    // reconnects. Outstanding access-token JWTs die with the row too: /mcp checks that the `azp`
    // client still exists on every request (see verifyMcpBearer), so revocation takes effect on the
    // revoked client's next call.
    db.delete(oauthClient).where(eq(oauthClient.clientId, data.clientId)).run();

    return { revoked: true };
  });
