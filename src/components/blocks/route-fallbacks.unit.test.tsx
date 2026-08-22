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
function renderRoute(loader: () => unknown) {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader,
    component: () => <p>Loaded</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPendingComponent: RoutePending,
    defaultNotFoundComponent: RouteNotFound,
    defaultErrorComponent: RouteError,
  });

  render(<RouterProvider router={router} />);
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
});
