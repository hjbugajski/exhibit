import { act } from 'react';

// @vitest-environment happy-dom
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RouterContext, Session } from '@/lib/router-context';

vi.mock('@/lib/auth-session', () => ({
  getServerSession: vi.fn(),
}));

const { getServerSession } = await import('@/lib/auth-session');
const { Route } = await import('./_authed');

const session = {
  user: { id: '1', email: 'owner@example.com' },
  session: { id: 's1' },
} as unknown as Session;

type Cause = 'enter' | 'stay';

function beforeLoad({
  sessionCache = {},
  cause = 'enter',
  invalid = false,
  preload = false,
  href = '/',
}: {
  sessionCache?: RouterContext['sessionCache'];
  cause?: Cause;
  invalid?: boolean;
  preload?: boolean;
  href?: string;
}) {
  return Route.options.beforeLoad?.({
    context: { sessionCache },
    location: { href },
    cause: preload ? 'preload' : cause,
    preload,
    matches: [{ routeId: '__root__' }, { routeId: '/_authed', cause, invalid }],
  } as never);
}

beforeEach(() => {
  vi.mocked(getServerSession).mockReset();
});

afterEach(() => {
  cleanup();
});

describe('/_authed beforeLoad', () => {
  it('redirects to /sign-in with the current location and empties the cache when unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const sessionCache = { session };

    let caught: unknown;
    try {
      await beforeLoad({ sessionCache, cause: 'stay', invalid: true, href: '/some/path?a=b' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Response);
    expect(
      (caught as { options: { to: string; search: { redirect: string } } }).options,
    ).toMatchObject({ to: '/sign-in', search: { redirect: '/some/path?a=b' } });
    expect(sessionCache.session).toBeUndefined();
  });

  it('fetches on enter and fills the cache', async () => {
    vi.mocked(getServerSession).mockResolvedValue(session as never);
    const sessionCache: RouterContext['sessionCache'] = {};

    const result = await beforeLoad({ sessionCache, cause: 'enter' });

    expect(result).toEqual({ session });
    expect(getServerSession).toHaveBeenCalledTimes(1);
    expect(sessionCache.session).toBe(session);
  });

  it('reuses the cached session on a valid stay', async () => {
    const result = await beforeLoad({ sessionCache: { session }, cause: 'stay' });

    expect(result).toEqual({ session });
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it('reuses the cached session on a preload whose own match stays', async () => {
    const result = await beforeLoad({ sessionCache: { session }, cause: 'stay', preload: true });

    expect(result).toEqual({ session });
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it('fetches on a stay whose match was invalidated', async () => {
    vi.mocked(getServerSession).mockResolvedValue(session as never);

    await beforeLoad({ sessionCache: { session }, cause: 'stay', invalid: true });

    expect(getServerSession).toHaveBeenCalledTimes(1);
  });

  it('fetches on a stay with an empty cache', async () => {
    vi.mocked(getServerSession).mockResolvedValue(session as never);

    await beforeLoad({ sessionCache: {}, cause: 'stay' });

    expect(getServerSession).toHaveBeenCalledTimes(1);
  });
});

describe('/_authed session reuse in a real router', () => {
  it('fetches on entry, invalidate and re-entry, never on a search-only navigation', async () => {
    vi.mocked(getServerSession).mockResolvedValue(session as never);

    const rootRoute = createRootRouteWithContext<RouterContext>()();
    const authedRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_authed',
      beforeLoad: (options) => Route.options.beforeLoad?.(options as never),
      component: Outlet,
    });
    const indexRoute = createRoute({
      getParentRoute: () => authedRoute,
      path: '/',
      validateSearch: (search: Record<string, unknown>) => ({
        query: typeof search.query === 'string' ? search.query : undefined,
      }),
      component: () => <p>Index</p>,
    });
    const outsideRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/outside',
      component: () => <p>Outside</p>,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([authedRoute.addChildren([indexRoute]), outsideRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      context: { sessionCache: {} },
    });

    render(<RouterProvider router={router} />);
    expect(await screen.findByText('Index')).toBeTruthy();
    expect(getServerSession).toHaveBeenCalledTimes(1);

    await act(() => router.navigate({ to: '/', search: { query: 'a' }, replace: true }));
    expect(router.state.location.search).toEqual({ query: 'a' });
    expect(getServerSession).toHaveBeenCalledTimes(1);

    await act(() => router.invalidate());
    expect(getServerSession).toHaveBeenCalledTimes(2);

    await act(() => router.navigate({ href: '/outside' }));
    expect(await screen.findByText('Outside')).toBeTruthy();
    await act(() => router.navigate({ to: '/', search: { query: undefined } }));
    expect(await screen.findByText('Index')).toBeTruthy();
    expect(getServerSession).toHaveBeenCalledTimes(3);
  });
});
