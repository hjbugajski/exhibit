import { createMiddleware } from '@tanstack/react-start';

import { getServerSession } from '@/lib/auth-session';

/**
 * Split into its own module (rather than living in artifacts.ts, or being folded into
 * auth-session.ts alongside `getServerSession`) for two reasons: it keeps `getServerSession` itself
 * mockable-by-import in tests (a colocated `requireSession` calling a sibling export in the same
 * file wouldn't be interceptable by `vi.mock`), and it's the shared dependency both
 * src/lib/artifacts.ts and src/lib/account.ts pull in for their server functions'
 * `.middleware([...])`.
 */

/**
 * `beforeLoad` route guards on the `_authed` layout are UX-only (they run on navigation, not on
 * every server data access) - every server function that reads/writes data on behalf of the
 * signed-in user must re-check the session itself. `sessionMiddleware` below is that check, wired
 * in once per server function via `.middleware([sessionMiddleware])` instead of every handler
 * calling this directly.
 */
export async function requireSession(): Promise<void> {
  const session = await getServerSession();

  if (!session) {
    throw new Error('Unauthorized');
  }
}

export const sessionMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  await requireSession();

  return next();
});
