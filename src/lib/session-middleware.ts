import { createMiddleware } from '@tanstack/react-start';

import { getServerSession } from '@/lib/auth-session';
import { UNAUTHORIZED_MESSAGE } from '@/lib/unauthorized';

/*
 * Split into its own module (rather than living in artifacts.ts, or being folded into
 * auth-session.ts alongside `getServerSession`) for two reasons: it keeps `getServerSession` itself
 * mockable-by-import in tests (a colocated `requireSession` calling a sibling export in the same
 * file wouldn't be interceptable by `vi.mock`), and it's the shared dependency both
 * src/lib/artifacts.ts and src/lib/account.ts pull in for their server functions'
 * `.middleware([...])`.
 */

/** The check behind `sessionMiddleware`; throws `Unauthorized` without a session. */
export async function requireSession(): Promise<void> {
  const session = await getServerSession();

  if (!session) {
    throw new Error(UNAUTHORIZED_MESSAGE);
  }
}

/**
 * `beforeLoad` route guards on the `_authed` layout are UX-only (they run on navigation, not on
 * every server data access) - every server function that reads/writes data on behalf of the
 * signed-in user must re-check the session itself. This middleware is that check, wired in once
 * per server function via `.middleware([sessionMiddleware])`; it throws `Unauthorized` when no
 * session exists.
 */
export const sessionMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  await requireSession();

  return next();
});
