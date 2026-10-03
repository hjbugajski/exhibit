import { auth } from '@/lib/auth';

/**
 * Session check for plain server route handlers (/render, /download) that receive the raw `Request`
 * directly, rather than running inside a server function's request context.
 */
export async function getSessionForRequest(request: Request) {
  return auth.api.getSession({ headers: request.headers });
}
