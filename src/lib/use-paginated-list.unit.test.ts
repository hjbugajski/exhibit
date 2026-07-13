// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CursorPage } from '@/lib/use-paginated-list';
import { usePaginatedList } from '@/lib/use-paginated-list';

function page(items: string[], nextCursor: string | null): CursorPage<string> {
  return { items, nextCursor };
}

/**
 * A promise plus its resolve function, so a test can control exactly when a simulated fetch
 * settles.
 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

describe('usePaginatedList', () => {
  it('starts with just the first page', () => {
    // Hoisted outside the render callback: `firstPage` must stay referentially stable across
    // re-renders (matching `Route.useLoaderData()` in the real app, which only changes reference
    // when the loader reruns) - constructing it *inside* the render callback would create a new
    // object every render and loop forever via the reset effect.
    const firstPage = page(['a', 'b'], 'cursor-1');
    const { result } = renderHook(() => usePaginatedList(firstPage));

    expect(result.current.items).toEqual(['a', 'b']);
    expect(result.current.hasMore).toBe(true);
  });

  it('reports hasMore false once the last page has no cursor', () => {
    const firstPage = page(['a'], null);
    const { result } = renderHook(() => usePaginatedList(firstPage));

    expect(result.current.hasMore).toBe(false);
  });

  it('accumulates items across pages and updates the cursor from the newest page', async () => {
    const firstPage = page(['a'], 'cursor-1');
    const { result } = renderHook(() => usePaginatedList(firstPage));

    act(() => {
      result.current.loadMore(async (cursor) => {
        expect(cursor).toBe('cursor-1');
        return page(['b'], null);
      });
    });

    await waitFor(() => expect(result.current.items).toEqual(['a', 'b']));
    expect(result.current.hasMore).toBe(false);
  });

  it('does nothing when there is no next cursor', () => {
    const firstPage = page(['a'], null);
    const fetchNextPage = () => Promise.reject(new Error('should not be called'));
    const { result } = renderHook(() => usePaginatedList(firstPage));

    act(() => {
      result.current.loadMore(fetchNextPage);
    });

    expect(result.current.items).toEqual(['a']);
  });

  it('drops a stale loadMore response when the first page changes while the request is in flight', async () => {
    const { promise, resolve } = deferred<CursorPage<string>>();

    const { result, rerender } = renderHook(({ firstPage }) => usePaginatedList(firstPage), {
      initialProps: { firstPage: page(['a'], 'cursor-1') },
    });

    // Kick off a loadMore for the *first* query; it won't resolve until we call `resolve` below.
    act(() => {
      result.current.loadMore(() => promise);
    });
    expect(result.current.loadingMore).toBe(true);

    // A filter/sort/search change reruns the loader and hands back a new first page - this bumps
    // the generation and resets pages, simulating Home re-rendering with fresh loader data while
    // the request above is still in flight.
    rerender({ firstPage: page(['x'], 'cursor-x') });
    expect(result.current.items).toEqual(['x']);

    // Now the stale request resolves - its result must be discarded, not appended after the new
    // first page.
    await act(async () => {
      resolve(page(['b'], null));
      await promise;
    });

    expect(result.current.items).toEqual(['x']);
    expect(result.current.hasMore).toBe(true);
  });
});
