import { useMemo, useState } from 'react';

import { useFormAction } from '@/lib/use-form-action';

export interface CursorPage<Item> {
  items: Item[];
  nextCursor: string | null;
}

/**
 * Accumulates cursor-paginated pages, resetting to `firstPage` whenever its identity changes (e.g.
 * a filter/sort/search change reran the loader).
 *
 * Guards against stale responses: `pages[0]` always holds the `firstPage` the list was built from,
 * so a `loadMore` request still in flight when a filter change resets the list sees the mismatch
 * inside its updater and drops its result instead of appending items for the wrong query.
 */
export function usePaginatedList<Item>(firstPage: CursorPage<Item>) {
  const [pages, setPages] = useState<CursorPage<Item>[]>([firstPage]);
  const [prevFirstPage, setPrevFirstPage] = useState(firstPage);
  const loadMoreAction = useFormAction();

  if (firstPage !== prevFirstPage) {
    setPrevFirstPage(firstPage);
    setPages([firstPage]);
  }

  function loadMore(fetchNextPage: (cursor: string) => Promise<CursorPage<Item>>) {
    const cursor = pages.at(-1)?.nextCursor;

    if (!cursor) {
      return;
    }

    void loadMoreAction.run(async () => {
      const next = await fetchNextPage(cursor);

      // The updater runs synchronously against current state, so the check cannot race the
      // render-phase reset the way an external ref comparison could.
      setPages((prev) => (prev[0] === firstPage ? [...prev, next] : prev));
    });
  }

  // Stable identity so memoized list consumers bail out when only unrelated state changed.
  const items = useMemo(() => pages.flatMap((page) => page.items), [pages]);
  const hasMore = (pages.at(-1)?.nextCursor ?? null) !== null;

  return { items, hasMore, loadingMore: loadMoreAction.pending, loadMore };
}
