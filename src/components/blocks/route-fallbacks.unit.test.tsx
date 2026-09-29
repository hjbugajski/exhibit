// @vitest-environment happy-dom
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
} from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RouteError, RouteNotFound, RoutePending } from '@/components/blocks/route-fallbacks';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Mirrors src/router.tsx's wiring so the fallbacks are exercised the way the app installs them. */
function renderRoute(loader: () => unknown, initialEntry = '/') {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader,
    component: () => <p>Loaded</p>,
  });
  const signInRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sign-in',
    component: () => <p>Sign in</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, signInRoute]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    defaultPendingComponent: RoutePending,
    defaultNotFoundComponent: RouteNotFound,
    defaultErrorComponent: RouteError,
  });

  render(<RouterProvider router={router} />);

  return router;
}

describe('route fallbacks', () => {
  it('renders the not-found page when a loader throws notFound()', async () => {
    renderRoute(() => {
      throw notFound();
    });

    expect(await screen.findByText('Page not found')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to artifacts' })).toBeTruthy();
  });

  it('renders the error page when a loader throws', async () => {
    // The router and React both report the caught loader error to the console; the boundary
    // rendering IS the behavior under test, so capture that output and assert it is only the
    // expected error instead of letting it leak into the test run.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    renderRoute(() => {
      throw new Error('loader exploded');
    });

    expect(await screen.findByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('loader exploded')).toBeTruthy();

    const logged = [...consoleError.mock.calls, ...consoleWarn.mock.calls].flat();
    expect(
      logged.some(
        (arg) =>
          (arg instanceof Error && arg.message === 'loader exploded') ||
          String(arg).includes('Error in route match'),
      ),
    ).toBe(true);
  });

  it('sends an expired session to /sign-in with the current location instead of the error page', async () => {
    // Same expected console output as the error-page case: the loader error is caught and
    // reported before the boundary redirects.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const router = renderRoute(() => {
      throw new Error('Unauthorized');
    }, '/?query=a');

    expect(await screen.findByText('Sign in')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/sign-in');
    expect(router.state.location.search).toEqual({ redirect: '/?query=a' });
    expect(screen.queryByText('Something went wrong')).toBeNull();

    const logged = [...consoleError.mock.calls, ...consoleWarn.mock.calls].flat();
    expect(
      logged.some(
        (arg) =>
          (arg instanceof Error && arg.message === 'Unauthorized') ||
          String(arg).includes('Error in route match'),
      ),
    ).toBe(true);
  });
});
