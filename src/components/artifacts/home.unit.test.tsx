// @vitest-environment happy-dom
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Artifact } from '@/database/repository';
import { makeArtifact } from '@testing/factories';

/** Home imports the gallery's load-more server fn; nothing here exercises it. */
vi.mock('@/lib/artifacts', () => ({
  listArtifactsFn: vi.fn(() => Promise.resolve({ items: [], nextCursor: null })),
  restoreArtifactFn: vi.fn(() => Promise.resolve()),
  purgeArtifactFn: vi.fn(() => Promise.resolve()),
}));

/**
 * Render probe for the card list: TagList sits inside ArtifactCard, so its call count is the real
 * card's render count — memo and all.
 */
const tagListRenders = vi.fn();

vi.mock('@/components/artifacts/tag-list', () => ({
  TagList: () => {
    tagListRenders();
    return null;
  },
}));

const { Home } = await import('@/components/artifacts/home');
const { restoreArtifactFn } = await import('@/lib/artifacts');

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  tagListRenders.mockClear();
  localStorage.clear();
});

/**
 * A stand-in for the real `/_authed` + `/_authed/` pair — Home resolves both by route id, so the
 * ids are what matters, not the app's route tree. The index loader can be blocked to hold a
 * navigation open, which is how the URL round-trip that used to clobber typing is reproduced.
 */
function renderHome(initialEntry = '/', items: Artifact[] = []) {
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
    // Deliberately without the real route's archived/deleted precedence: these tests pin the
    // handlers' own mutual exclusion, not validateSearch's (see _authed/index.unit.test.ts).
    validateSearch: (search: Record<string, unknown>) => ({
      query: typeof search.query === 'string' && search.query ? search.query : undefined,
      archived: search.archived === true ? true : undefined,
      deleted: search.deleted === true ? true : undefined,
    }),
    loaderDeps: ({ search }: { search: { query?: string; deleted?: boolean } }) => ({
      query: search.query,
      deleted: search.deleted,
    }),
    loader: async () => {
      loaderRuns += 1;

      if (gate) {
        await gate;
      }

      return { page: { items, nextCursor: null } };
    },
    component: Home,
  });
  // Cards link here; the route only needs to exist for the hrefs to resolve.
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/a/$id',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([authedRoute.addChildren([indexRoute]), detailRoute]),
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
async function mountHome(initialEntry?: string, items?: Artifact[]) {
  const harness = renderHome(initialEntry, items);
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

  it('clears the URL when the box is emptied while a write is still in flight', async () => {
    const { block, input, release, router } = await mountHome();

    block();
    fireEvent.change(input, { target: { value: 'ab' } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // The owner clears the box before the write of 'ab' lands. The URL still says no query, so a
    // guard that only compares against the landed URL would skip the clearing write entirely.
    fireEvent.change(input, { target: { value: '' } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      release();
    });

    expect(router.state.location.search).toEqual({});
    expect(input.value).toBe('');
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

  it('does not re-render the card list while typing', async () => {
    const { input } = await mountHome('/', [
      makeArtifact({ id: 'a1', title: 'One' }),
      makeArtifact({ id: 'a2', title: 'Two' }),
    ]);

    const before = tagListRenders.mock.calls.length;
    expect(before).toBeGreaterThan(0);

    fireEvent.change(input, { target: { value: 'k' } });
    fireEvent.change(input, { target: { value: 'ky' } });
    fireEvent.change(input, { target: { value: 'kyo' } });

    expect(input.value).toBe('kyo');
    // Keystrokes stay inside the search input: stable items + memoized context/actions/Grid keep
    // every card (and its Link's route build) out of the render pass until the debounce lands.
    expect(tagListRenders.mock.calls.length).toBe(before);
  });
});

describe('Home trash view', () => {
  it('drops the archived filter when the deleted filter is checked', async () => {
    const user = userEvent.setup();
    const { router } = renderHome();

    fireEvent.click(await screen.findByLabelText('Filter'));
    await user.click(await screen.findByRole('checkbox', { name: 'Archived only' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ archived: true }));

    await user.click(await screen.findByRole('checkbox', { name: 'Deleted only' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ deleted: true }));
  });

  it('drops the deleted filter when the archived filter is checked', async () => {
    const user = userEvent.setup();
    const { router } = renderHome('/?deleted=true');

    fireEvent.click(await screen.findByLabelText('Filter'));
    await user.click(await screen.findByRole('checkbox', { name: 'Archived only' }));

    await waitFor(() => expect(router.state.location.search).toEqual({ archived: true }));
  });

  it('restores a deleted artifact and reloads the list', async () => {
    const harness = renderHome('/?deleted=true', [makeArtifact({ id: 'a1', title: 'Gone' })]);

    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(restoreArtifactFn).toHaveBeenCalledWith({ data: { id: 'a1' } }));
    // router.invalidate() re-runs the loader, so a restored artifact leaves the trash list.
    await waitFor(() => expect(harness.loaderRuns).toBe(2));
  });
});
