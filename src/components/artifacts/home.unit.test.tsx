// @vitest-environment happy-dom
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Home imports the gallery's load-more server fn; nothing here exercises it. */
vi.mock('@/lib/artifacts', () => ({
  listArtifactsFn: vi.fn(() => Promise.resolve({ items: [], nextCursor: null })),
}));

const { Home } = await import('@/components/artifacts/home');

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

/**
 * A stand-in for the real `/_authed` + `/_authed/` pair — Home resolves both by route id, so the
 * ids are what matters, not the app's route tree. The index loader can be blocked to hold a
 * navigation open, which is how the URL round-trip that used to clobber typing is reproduced.
 */
function renderHome(initialEntry = '/') {
  let unblock: (() => void) | undefined;
  let gate: Promise<void> | null = null;
  let loaderRuns = 0;

  const rootRoute = createRootRoute();
  const authedRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_authed',
    loader: () => ({ tags: [] as string[] }),
  });
  const indexRoute = createRoute({
    getParentRoute: () => authedRoute,
    path: '/',
    validateSearch: (search: Record<string, unknown>) => ({
      query: typeof search.query === 'string' && search.query ? search.query : undefined,
    }),
    loaderDeps: ({ search }: { search: { query?: string } }) => ({ query: search.query }),
    loader: async () => {
      loaderRuns += 1;

      if (gate) {
        await gate;
      }

      return { page: { items: [], nextCursor: null } };
    },
    component: Home,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([authedRoute.addChildren([indexRoute])]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });

  render(<RouterProvider router={router} />);

  return {
    router,
    block: () => {
      gate = new Promise<void>((resolve) => {
        unblock = resolve;
      });
    },
    release: () => {
      gate = null;
      unblock?.();
    },
    get loaderRuns() {
      return loaderRuns;
    },
  };
}

/**
 * Waits for the router to mount before switching to fake timers: Testing Library's `findBy*` polls
 * on real timers, so installing them earlier hangs the first query.
 */
async function mountHome(initialEntry?: string) {
  const harness = renderHome(initialEntry);
  const input = await screen.findByLabelText<HTMLInputElement>('Search by title');

  vi.useFakeTimers();

  return { ...harness, input };
}

describe('Home search sync', () => {
  it('keeps characters typed while its own URL write is still in flight', async () => {
    const { block, input, release, router } = await mountHome();

    block();
    fireEvent.change(input, { target: { value: 'ab' } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // The owner keeps typing during the loader round-trip; the write of 'ab' has not landed yet.
    fireEvent.change(input, { target: { value: 'abc' } });
    await act(async () => {
      release();
    });

    expect(router.state.location.search).toEqual({ query: 'ab' });
    expect(input.value).toBe('abc');
  });

  it('resyncs the input when the query changes from outside (back/forward, shared link)', async () => {
    const { input, router } = await mountHome();

    fireEvent.change(input, { target: { value: 'ab' } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(router.state.location.search).toEqual({ query: 'ab' });

    await act(async () => {
      await router.navigate({ to: '/', search: { query: 'zed' } });
    });

    expect(input.value).toBe('zed');
    // The stale debounced value ('ab') must not bounce the URL back while its timer drains.
    expect(router.state.location.search).toEqual({ query: 'zed' });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(router.state.location.search).toEqual({ query: 'zed' });
  });

  it('does not re-navigate on mount when the URL already carries a query', async () => {
    const harness = await mountHome('/?query=kyoto');

    expect(harness.input.value).toBe('kyoto');

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(harness.loaderRuns).toBe(1);
  });
});
