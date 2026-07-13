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

const revokeInput = z.object({ clientId: z.string() });

export const revokeMcpConnectionFn = createServerFn({ method: 'POST' })
  .middleware([sessionMiddleware])
  .validator(revokeInput)
  .handler(async ({ data }) => {
    // Deleting the client registration cascades to its refresh tokens, access-token rows, and
    // consent (FKs with ON DELETE CASCADE). The client re-registers dynamically if it ever
    // reconnects. Outstanding access-token JWTs are stateless and keep working until they expire.
    db.delete(oauthClient).where(eq(oauthClient.clientId, data.clientId)).run();

    return { revoked: true };
  });
