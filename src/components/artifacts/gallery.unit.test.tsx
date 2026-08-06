// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GalleryView, TypeFilter } from '@/components/artifacts/gallery';
import { Gallery } from '@/components/artifacts/gallery';
import type { TrashActions } from '@/components/artifacts/trash-actions';
import type { Artifact } from '@/database/repository';
import type { ArtifactSort } from '@/lib/artifact-sorts';
import { makeArtifact } from '@testing/factories';
import { renderWithRouter } from '@testing/router';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function noop() {
  // no-op event handler for controlled-component props in tests
}

/** Trash mutations as spies; both resolve so useFormAction settles. */
function makeTrash() {
  return {
    restore: vi.fn((_id: string) => Promise.resolve()),
    purge: vi.fn((_id: string) => Promise.resolve()),
  } satisfies TrashActions;
}

interface RenderGalleryOptions {
  state?: Partial<{
    query: string;
    type: TypeFilter;
    archived: boolean;
    deleted: boolean;
    sort: ArtifactSort;
    tags: string[];
    view: GalleryView;
    updating: boolean;
  }>;
  actions?: Partial<{
    setQuery: (query: string) => void;
    setType: (type: TypeFilter) => void;
    setArchived: (archived: boolean) => void;
    setDeleted: (deleted: boolean) => void;
    setSort: (sort: ArtifactSort) => void;
    setTags: (tags: string[]) => void;
    setView: (view: GalleryView) => void;
  }>;
  items?: Artifact[];
  trash?: TrashActions;
  availableTags?: string[];
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

/**
 * Mirrors Home's composition of the Gallery parts exactly - the tests exercise the same assembly a
 * real consumer would use.
 */
function renderGallery(options: RenderGalleryOptions = {}) {
  const state = {
    query: '',
    type: 'all' as TypeFilter,
    archived: false,
    deleted: false,
    sort: 'updated-desc' as ArtifactSort,
    tags: [] as string[],
    view: 'grid' as GalleryView,
    updating: false,
    ...options.state,
  };
  const actions = {
    setQuery: noop,
    setType: noop,
    setArchived: noop,
    setDeleted: noop,
    setSort: noop,
    setTags: noop,
    setView: noop,
    ...options.actions,
  };
  const items = options.items ?? [];
  const availableTags = options.availableTags ?? [];
  const hasMore = options.hasMore ?? false;
  const loadingMore = options.loadingMore ?? false;
  const onLoadMore = options.onLoadMore ?? noop;

  return renderWithRouter(
    <Gallery.Root actions={actions} state={state}>
      <Gallery.Toolbar>
        <Gallery.Search />
        <Gallery.Filters availableTags={availableTags} />
        <Gallery.Sort />
        <Gallery.ViewToggle />
      </Gallery.Toolbar>
      <Gallery.Results>
        {items.length === 0 ? (
          <Gallery.Empty />
        ) : state.view === 'grid' ? (
          <Gallery.Grid items={items} trash={options.trash} />
        ) : (
          <Gallery.Table items={items} trash={options.trash} />
        )}
      </Gallery.Results>
      {items.length > 0 ? (
        <Gallery.LoadMore hasMore={hasMore} loadingMore={loadingMore} onLoadMore={onLoadMore} />
      ) : null}
    </Gallery.Root>,
    { extraPaths: ['/a/$id'] },
  );
}

describe('Gallery', () => {
  it('renders rows from a fixture list', async () => {
    // Only `Date` is faked (not timers) so `findByText`'s internal polling keeps working; this just
    // pins the fixture's `updatedAt` computation and formatRelativeTime's default `now` to the same
    // instant, so "3h ago" isn't a race between two separate `Date.now()` reads.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));

    renderGallery({
      items: [
        makeArtifact({
          id: 'a1',
          title: 'Test Artifact',
          tags: ['travel'],
          updatedAt: Date.now() - 3 * 60 * 60 * 1000,
        }),
        makeArtifact({
          id: 'a2',
          title: 'Second Artifact',
          type: 'html',
          tags: [],
          updatedAt: Date.now() - 3 * 60 * 60 * 1000,
        }),
      ],
    });

    expect(await screen.findByText('Test Artifact')).toBeTruthy();
    expect(screen.getByText('Second Artifact')).toBeTruthy();
    expect(screen.getByText('travel')).toBeTruthy();
    expect(screen.getByText('spec')).toBeTruthy();
    expect(screen.getByText('html')).toBeTruthy();
    expect(screen.getAllByText('3h ago')).toHaveLength(2);
  });

  it('shows a "Load more" button only when hasMore is true', async () => {
    renderGallery({ hasMore: true, items: [makeArtifact()] });

    expect(await screen.findByRole('button', { name: 'Load more' })).toBeTruthy();
  });

  it('shows the MCP publish hint when there are no artifacts and no filters applied', async () => {
    renderGallery();

    expect(await screen.findByText(/publish_spec/)).toBeTruthy();
  });

  it('shows a filtered-empty message when a filter is applied and there are no results', async () => {
    renderGallery({ state: { query: 'nothing matches' } });

    expect(await screen.findByText('No matching artifacts')).toBeTruthy();
  });

  it('shows a filtered-empty message when tags are selected and there are no results', async () => {
    renderGallery({ state: { tags: ['travel'] } });

    expect(await screen.findByText('No matching artifacts')).toBeTruthy();
  });

  it('clears search, type, and tags from the filtered-empty state', async () => {
    const setQuery = vi.fn();
    const setType = vi.fn();
    const setTags = vi.fn();
    renderGallery({
      actions: { setQuery, setTags, setType },
      state: { query: 'nothing', type: 'spec' },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Clear filters' }));

    expect(setQuery).toHaveBeenCalledWith('');
    expect(setType).toHaveBeenCalledWith('all');
    expect(setTags).toHaveBeenCalledWith([]);
  });

  it('selects a sort option from the sort menu', async () => {
    const setSort = vi.fn();
    renderGallery({ actions: { setSort } });

    fireEvent.click(await screen.findByLabelText('Sort by'));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Oldest' }));

    expect(setSort).toHaveBeenCalledWith('created-asc');
  });

  it('toggles a tag from the filter popover', async () => {
    const setTags = vi.fn();
    renderGallery({
      actions: { setTags },
      availableTags: ['red', 'blue'],
      state: { tags: ['red'] },
    });

    fireEvent.click(await screen.findByLabelText('Filter'));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'blue' }));

    expect(setTags).toHaveBeenCalledWith(['red', 'blue']);
  });

  it('shows the active filter count on the filter trigger', async () => {
    renderGallery({
      availableTags: ['red', 'blue'],
      state: { tags: ['red', 'blue'], type: 'spec' },
    });

    expect(await screen.findByText('3')).toBeTruthy();
  });

  it('renders a table when view is "table"', async () => {
    renderGallery({ items: [makeArtifact()], state: { view: 'table' } });

    expect(await screen.findByRole('table')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Title' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Updated' })).toBeTruthy();
  });

  it('marks the list busy while a filter navigation is in flight', async () => {
    const { container } = renderGallery({ items: [makeArtifact()], state: { updating: true } });

    expect(await screen.findByText('Kyoto Trip')).toBeTruthy();
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it('toggles the deleted filter from the filter popover', async () => {
    const setDeleted = vi.fn();
    renderGallery({ actions: { setDeleted } });

    fireEvent.click(await screen.findByLabelText('Filter'));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Deleted only' }));

    expect(setDeleted).toHaveBeenCalledWith(true);
  });

  it('shows an empty-trash message when the deleted filter matches nothing', async () => {
    renderGallery({ state: { deleted: true } });

    expect(await screen.findByText('Trash is empty')).toBeTruthy();
  });

  it('replaces card links with restore and delete-forever controls in the trash view', async () => {
    const { container } = renderGallery({
      items: [makeArtifact({ id: 'a1', title: 'Deleted Artifact' })],
      state: { deleted: true },
      trash: makeTrash(),
    });

    expect(await screen.findByText('Deleted Artifact')).toBeTruthy();
    // Deleted artifacts have no detail page, so nothing may link to one.
    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete forever' })).toBeTruthy();
  });

  it('replaces row links with an actions column in the trash table view', async () => {
    const { container } = renderGallery({
      items: [makeArtifact({ id: 'a1', title: 'Deleted Artifact' })],
      state: { deleted: true, view: 'table' },
      trash: makeTrash(),
    });

    expect(await screen.findByRole('columnheader', { name: 'Actions' })).toBeTruthy();
    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeTruthy();
  });

  it('restores a deleted artifact without a confirmation step', async () => {
    const trash = makeTrash();
    renderGallery({ items: [makeArtifact({ id: 'a1' })], state: { deleted: true }, trash });

    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));

    expect(trash.restore).toHaveBeenCalledWith('a1');
    expect(trash.purge).not.toHaveBeenCalled();
  });

  it('purges only after the confirmation is acknowledged', async () => {
    const user = userEvent.setup();
    const trash = makeTrash();
    renderGallery({ items: [makeArtifact({ id: 'a1' })], state: { deleted: true }, trash });

    fireEvent.click(await screen.findByRole('button', { name: 'Delete forever' }));

    const dialog = within(await screen.findByRole('alertdialog'));

    expect(dialog.getByRole('button', { name: 'Delete forever' }).hasAttribute('disabled')).toBe(
      true,
    );

    // userEvent, not fireEvent — see the Checklist test in src/catalog/registry.unit.test.tsx.
    await user.click(dialog.getByRole('checkbox'));
    fireEvent.click(dialog.getByRole('button', { name: 'Delete forever' }));

    expect(trash.purge).toHaveBeenCalledWith('a1');
  });

  it('calls setView when a view toggle tab is clicked', async () => {
    const setView = vi.fn();
    renderGallery({ actions: { setView } });

    fireEvent.click(await screen.findByRole('tab', { name: 'Table view' }));

    expect(setView).toHaveBeenCalledWith('table');
  });
});
