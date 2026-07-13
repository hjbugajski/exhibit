import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';

import { auth } from '@/lib/auth';

/**
 * Server-side session lookup, reused by the `_authed` layout's `beforeLoad` guard and by any future
 * server function that needs to check the session.
 *
 * IMPORTANT: `beforeLoad` route guards are UX-only (they run on navigation, not on every server
 * data access). Any server function that reads/writes data on behalf of the signed-in user must
 * call this itself and reject when `session` is null - don't rely solely on the route guard.
 */
export const getServerSession = createServerFn({ method: 'GET' }).handler(async () => {
  return auth.api.getSession({ headers: getRequestHeaders() });
});
