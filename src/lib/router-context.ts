import type { getServerSession } from '@/lib/auth-session';

export type Session = NonNullable<Awaited<ReturnType<typeof getServerSession>>>;

/**
 * Router context. `sessionCache` is one mutable cache per router instance: the router is built per
 * request on the server and once per page load on the client, so a cached session never crosses
 * users.
 */
export interface RouterContext {
  sessionCache: { session?: Session };
}
