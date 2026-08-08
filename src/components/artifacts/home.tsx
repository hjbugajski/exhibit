import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getRouteApi, useRouter, useRouterState } from '@tanstack/react-router';

import type { GalleryState, GalleryView, TypeFilter } from '@/components/artifacts/gallery';
import { Gallery } from '@/components/artifacts/gallery';
import type { ArtifactSort } from '@/lib/artifact-sorts';
import { listArtifactsFn, purgeArtifactFn, restoreArtifactFn } from '@/lib/artifacts';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useLocalStorageState } from '@/lib/use-local-storage-state';
import { usePaginatedList } from '@/lib/use-paginated-list';

const Route = getRouteApi('/_authed/');
const AuthedRoute = getRouteApi('/_authed');

const VIEW_STORAGE_KEY = 'exhibit.gallery-view';

function isGalleryView(value: string): value is GalleryView {
  return value === 'grid' || value === 'table';
}

export function Home() {
  const search = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const { tags } = AuthedRoute.useLoaderData();
  const navigate = Route.useNavigate();
  const router = useRouter();
  // Router-wide: a filter/search edit replaces the URL and reruns this route's loader, which keeps
  // the old data on screen until it resolves. `isLoading` covers that window (the route match's own
  // status stays 'success' through a stale reload).
  const updating = useRouterState({ select: (state) => state.isLoading });

  const [queryInput, setQueryInput] = useState(search.query ?? '');
  const [prevSearchQuery, setPrevSearchQuery] = useState(search.query);
  // The last query this component pushed into the URL. Our own writes land a loader round-trip
  // later, by which time the owner may have typed more — reseeding the input from them would
  // revert those characters, so only genuinely external changes (back/forward, a shared link)
  // resync it.
  const pushedQuery = useRef(search.query);
  // Starts at 'grid' for a deterministic SSR render, then syncs from localStorage after mount to
  // avoid a hydration mismatch.
  const [view, setView] = useLocalStorageState<GalleryView>(
    VIEW_STORAGE_KEY,
    'grid',
    isGalleryView,
  );

  const { items, hasMore, loadingMore, loadMore } = usePaginatedList(loaderData.page);

  if (search.query !== prevSearchQuery) {
    setPrevSearchQuery(search.query);

    if (search.query !== pushedQuery.current) {
      setQueryInput(search.query ?? '');
      // Adopt the external value as our own last write, or the navigate effect would push a
      // redundant no-op write (rerunning both gallery loaders) once the debounce catches up.
      pushedQuery.current = search.query;
    }
  }

  // Debounced, server-side title search: waits 300ms after the last keystroke before pushing the
  // value into the URL, which reruns the loader (listArtifactsFn).
  const debouncedQuery = useDebouncedValue(queryInput, 300);

  // A ref, not an effect dependency: the navigate effect must react only to settled debounce
  // values. Re-running it on URL changes would fire it with a stale debouncedQuery right after an
  // external navigation and bounce the URL back to the old query. Declared before that effect so
  // the sync runs first each commit.
  const urlQuery = useRef(search.query);
  useEffect(() => {
    urlQuery.current = search.query;
  });

  useEffect(() => {
    const next = debouncedQuery || undefined;

    // Skip only when the URL AND our last write both already say `next` — on mount, and after one
    // of our own writes lands. Checking the URL alone deadlocks a fast clear: with "ab" still in
    // flight, next=undefined matches the stale URL, the write is skipped, and the URL keeps
    // filtering by "ab" under an empty search box.
    if (next === urlQuery.current && next === pushedQuery.current) {
      return;
    }

    pushedQuery.current = next;
    void navigate({ search: (prev) => ({ ...prev, query: next }), replace: true });
  }, [debouncedQuery, navigate]);

  const handleTypeChange = useCallback(
    (type: TypeFilter) => {
      void navigate({
        search: (prev) => ({ ...prev, type: type === 'all' ? undefined : type }),
        replace: true,
      });
    },
    [navigate],
  );

  const handleSortChange = useCallback(
    (sort: ArtifactSort) => {
      void navigate({
        search: (prev) => ({ ...prev, sort: sort === 'updated-desc' ? undefined : sort }),
        replace: true,
      });
    },
    [navigate],
  );

  const handleTagsChange = useCallback(
    (tags: string[]) => {
      void navigate({
        search: (prev) => ({ ...prev, tags: tags.length > 0 ? tags : undefined }),
        replace: true,
      });
    },
    [navigate],
  );

  // Archived and Deleted are mutually exclusive: the trash is a flat view that ignores the archived
  // split, so checking either filter clears the other (validateSearch enforces the same precedence
  // for hand-written URLs).
  const handleArchivedChange = useCallback(
    (archived: boolean) => {
      void navigate({
        search: (prev) => ({
          ...prev,
          archived: archived ? true : undefined,
          deleted: archived ? undefined : prev.deleted,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  const handleDeletedChange = useCallback(
    (deleted: boolean) => {
      void navigate({
        search: (prev) => ({
          ...prev,
          deleted: deleted ? true : undefined,
          archived: deleted ? undefined : prev.archived,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  // One identity-stable object per trash session, so the memoized Grid/Table (and every card behind
  // them) still bail out of renders driven by search-box keystrokes.
  const trash = useMemo(
    () =>
      search.deleted
        ? {
            restore: async (id: string) => {
              await restoreArtifactFn({ data: { id } });
              await router.invalidate();
            },
            purge: async (id: string) => {
              await purgeArtifactFn({ data: { id } });
              await router.invalidate();
            },
          }
        : undefined,
    [search.deleted, router],
  );

  // Both halves of the Gallery context are memoized: `actions` never changes, and `state` changes
  // only on a real filter/search edit — so the card list bails out of unrelated renders.
  const actions = useMemo(
    () => ({
      setArchived: handleArchivedChange,
      setDeleted: handleDeletedChange,
      setQuery: setQueryInput,
      setSort: handleSortChange,
      setTags: handleTagsChange,
      setType: handleTypeChange,
      setView,
    }),
    [
      handleArchivedChange,
      handleDeletedChange,
      handleSortChange,
      handleTagsChange,
      handleTypeChange,
      setView,
    ],
  );

  const state = useMemo<GalleryState>(
    () => ({
      archived: search.archived ?? false,
      deleted: search.deleted ?? false,
      query: queryInput,
      sort: search.sort ?? 'updated-desc',
      tags: search.tags ?? [],
      type: search.type ?? 'all',
      updating,
      view,
    }),
    [
      search.archived,
      search.deleted,
      search.sort,
      search.tags,
      search.type,
      queryInput,
      updating,
      view,
    ],
  );

  function handleLoadMore() {
    loadMore((cursor) =>
      listArtifactsFn({
        data: {
          query: search.query,
          tags: search.tags,
          type: search.type,
          archived: search.archived,
          deleted: search.deleted,
          sort: search.sort,
          cursor,
        },
      }),
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">Artifacts</h1>
      <Gallery.Root actions={actions} state={state}>
        <Gallery.Toolbar>
          <Gallery.Search />
          {/* Second toolbar row on mobile, right-aligned; trails the search inline from md up. */}
          <div className="flex items-center justify-end gap-3">
            <Gallery.Filters availableTags={tags} />
            <Gallery.Sort />
            <Gallery.ViewToggle />
          </div>
        </Gallery.Toolbar>
        <Gallery.Results>
          {items.length === 0 ? (
            <Gallery.Empty />
          ) : view === 'grid' ? (
            <Gallery.Grid items={items} trash={trash} />
          ) : (
            <Gallery.Table items={items} trash={trash} />
          )}
        </Gallery.Results>
        {items.length > 0 ? (
          <Gallery.LoadMore
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={handleLoadMore}
          />
        ) : null}
      </Gallery.Root>
    </div>
  );
}
