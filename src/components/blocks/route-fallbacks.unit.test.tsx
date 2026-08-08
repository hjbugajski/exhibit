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
import { afterEach, describe, expect, it } from 'vitest';

import { RouteError, RouteNotFound, RoutePending } from '@/components/blocks/route-fallbacks';

afterEach(cleanup);

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
    renderRoute(() => {
      throw new Error('loader exploded');
    });

    expect(await screen.findByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('loader exploded')).toBeTruthy();
  });
});
