import { auth } from '@/lib/auth';

/**
 * Session check for plain server route handlers (/render, /download) that receive the raw `Request`
 * directly, rather than running inside a server function's request context.
 *
 * Deliberately kept out of src/lib/auth-session.ts: that module is imported by the `_authed` layout
 * (a client-rendered route), so anything it exports ends up in the client bundle too. This file is
 * only imported by src/routes/render.$id.$n.ts and src/routes/download.$id.$n.ts, which are
 * server-only routes (no `component`, never bundled for the client) - keeping it separate avoids
 * dragging src/lib/auth.ts's server-only dependencies (better-sqlite3, drizzle) into client JS.
 */
export async function getSessionForRequest(request: Request) {
  return auth.api.getSession({ headers: request.headers });
}
