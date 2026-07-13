/**
 * Parameter typed `never` so any concrete handler is assignable (contravariance); call sites cast
 * their args to `never`.
 */
export type RouteHandler = (args: never) => unknown;

export interface RouteWithServerHandlers {
  options: {
    server?: { handlers?: Record<string, RouteHandler> | RouteHandler };
  };
}

/**
 * Extracts a named HTTP method handler (e.g. "GET", "POST") off a TanStack Start file-route's
 * `Route.options.server.handlers`, throwing a clear error if the route, its server handlers, or
 * that specific method isn't defined. Callers narrow the (necessarily loose) return value
 * themselves, e.g. with an `instanceof Response` check.
 */
export function getRouteHandler(route: RouteWithServerHandlers, method: string): RouteHandler {
  const handlers = route.options.server?.handlers;
  const handler =
    handlers && typeof handlers === 'object'
      ? handlers[method as keyof typeof handlers]
      : undefined;

  if (typeof handler !== 'function') {
    throw new Error(`${method} handler not defined`);
  }

  return handler;
}
