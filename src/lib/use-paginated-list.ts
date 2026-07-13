import { useRef, useState } from 'react';

import { useFormAction } from '@/lib/use-form-action';

export interface CursorPage<Item> {
  items: Item[];
  nextCursor: string | null;
}

/**
 * Accumulates cursor-paginated pages, resetting to `firstPage` whenever its identity changes (e.g.
 * a filter/sort/search change reran the loader).
 *
 * Guards against stale responses: `firstPage` is tracked in a ref, so a `loadMore` request already
 * in flight for a previous query can compare against the latest `firstPage` and drop its result
 * instead of appending results for the wrong query when it resolves.
 */
export function usePaginatedList<Item>(firstPage: CursorPage<Item>) {
  const [pages, setPages] = useState<CursorPage<Item>[]>([firstPage]);
  const [prevFirstPage, setPrevFirstPage] = useState(firstPage);
  const loadMoreAction = useFormAction();

  const firstPageRef = useRef(firstPage);
  firstPageRef.current = firstPage;

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

      // A filter/sort change reran the loader while this request was in flight - its results belong
      // to a stale query, so drop them.
      if (firstPage !== firstPageRef.current) {
        return;
      }

      setPages((prev) => [...prev, next]);
    });
  }

  const items = pages.flatMap((page) => page.items);
  const hasMore = (pages.at(-1)?.nextCursor ?? null) !== null;

  return { items, hasMore, loadingMore: loadMoreAction.pending, loadMore };
}
