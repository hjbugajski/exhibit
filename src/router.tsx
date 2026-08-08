import { createRouter as createTanStackRouter } from '@tanstack/react-router';

import { RouteError, RouteNotFound, RoutePending } from '@/components/blocks/route-fallbacks';

import { routeTree } from './routeTree.gen';

/**
 * Framework contract: TanStack Start resolves this export by name (nothing
 * in the repo imports it) and calls it to build a fresh router per SSR
 * request — don't rename or memoize.
 */
export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPendingComponent: RoutePending,
    defaultNotFoundComponent: RouteNotFound,
    defaultErrorComponent: RouteError,
    // Touch has no hover, so a tap gets no preload — show the spinner well before the router's
    // 1000ms default, and hold it long enough that it reads as a state rather than a flash.
    defaultPendingMs: 300,
    defaultPendingMinMs: 200,
  });

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
