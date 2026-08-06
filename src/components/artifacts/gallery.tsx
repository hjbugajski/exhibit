import { createContext, memo, use, useMemo, type ReactNode } from 'react';

import { Link } from '@tanstack/react-router';
import { ArrowUpDown, Inbox, LayoutGrid, List, ListFilter, SearchX, Trash2 } from 'lucide-react';

import { ArtifactCard } from '@/components/artifacts/artifact-card';
import { TagList } from '@/components/artifacts/tag-list';
import type { TrashActions } from '@/components/artifacts/trash-actions';
import { ArtifactTrashActions } from '@/components/artifacts/trash-actions';
import { TypeBadge } from '@/components/artifacts/type-badge';
import { RelativeTime } from '@/components/blocks/relative-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { Empty as EmptyPrimitive } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Popover } from '@/components/ui/popover';
import { RadioGroup } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { Table as TablePrimitive } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import type { Artifact, ArtifactType } from '@/database/repository';
import type { ArtifactSort } from '@/lib/artifact-sorts';
import { cn } from '@/lib/utils';

export type TypeFilter = ArtifactType | 'all';
export type GalleryView = 'grid' | 'table';

const typeLabels: Record<TypeFilter, string> = {
  all: 'All types',
  spec: 'Spec',
  html: 'HTML',
  markdown: 'Markdown',
};

const typeOptions = Object.keys(typeLabels) as TypeFilter[];

const sortLabels: Record<ArtifactSort, string> = {
  'updated-desc': 'Recently updated',
  'updated-asc': 'Oldest updated',
  'created-desc': 'Newest',
  'created-asc': 'Oldest',
  'title-asc': 'Title A–Z',
  'title-desc': 'Title Z–A',
};

const sortOptions = Object.keys(sortLabels) as ArtifactSort[];

export interface GalleryState {
  query: string;
  type: TypeFilter;
  archived: boolean;
  /** Trash view: only soft-deleted artifacts, mutually exclusive with `archived`. */
  deleted: boolean;
  sort: ArtifactSort;
  tags: string[];
  view: GalleryView;
  /** A filter/search navigation is in flight and the visible list is stale. */
  updating: boolean;
}

interface GalleryActions {
  setQuery: (query: string) => void;
  setType: (type: TypeFilter) => void;
  setArchived: (archived: boolean) => void;
  setDeleted: (deleted: boolean) => void;
  setSort: (sort: ArtifactSort) => void;
  setTags: (tags: string[]) => void;
  setView: (view: GalleryView) => void;
}

interface GalleryContextValue {
  state: GalleryState;
  actions: GalleryActions;
}

const GalleryContext = createContext<GalleryContextValue | null>(null);

function useGalleryContext(): GalleryContextValue {
  const context = use(GalleryContext);
  if (!context) {
    throw new Error('Gallery parts must be used within Gallery.Root');
  }
  return context;
}

export interface GalleryRootProps {
  state: GalleryState;
  actions: GalleryActions;
  children: ReactNode;
}

function Root({ state, actions, children }: GalleryRootProps) {
  // Memoized so a keystroke in Search (which only changes `state`) can't force every consumer —
  // and every card behind them — to re-render on a fresh context object.
  const value = useMemo(() => ({ state, actions }), [state, actions]);

  return (
    <GalleryContext value={value}>
      <div className="flex flex-col gap-8">{children}</div>
    </GalleryContext>
  );
}

export interface GalleryToolbarProps {
  children: ReactNode;
}

/** Stacks on mobile (search row, then controls); a single flex row from md up. */
function Toolbar({ children }: GalleryToolbarProps) {
  return <div className="grid grid-cols-1 gap-3 md:flex md:items-center">{children}</div>;
}

function Search() {
  const {
    state: { query },
    actions: { setQuery },
  } = useGalleryContext();

  return (
    <Input
      aria-label="Search by title"
      className="min-w-48 flex-1"
      onChange={(event) => setQuery(event.target.value)}
      placeholder="Search by title…"
      type="search"
      value={query}
    />
  );
}

/*
 * Dedicated sort menu: the trigger label never changes with the selection (no content-driven
 * resizing); the active option is marked inside the menu.
 */
function Sort() {
  const {
    state: { sort },
    actions: { setSort },
  } = useGalleryContext();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger aria-label="Sort by" render={<Button variant="outline" />}>
        <ArrowUpDown data-icon="inline-start" />
        Sort
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Positioner align="end">
          <DropdownMenu.Popup className="w-48">
            <DropdownMenu.RadioGroup
              onValueChange={(value) => setSort(value as ArtifactSort)}
              value={sort}
            >
              {sortOptions.map((option) => (
                <DropdownMenu.RadioItem key={option} value={option}>
                  {sortLabels[option]}
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Popup>
        </DropdownMenu.Positioner>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export interface GalleryFiltersProps {
  availableTags: string[];
}

/*
 * Dedicated filter popover: type and tags together behind one fixed-label trigger; the badge shows
 * how many filters are active.
 */
function Filters({ availableTags }: GalleryFiltersProps) {
  const {
    state: { type, tags, archived, deleted },
    actions: { setType, setTags, setArchived, setDeleted },
  } = useGalleryContext();
  const activeCount =
    (type === 'all' ? 0 : 1) + tags.length + (archived ? 1 : 0) + (deleted ? 1 : 0);

  function toggleTag(tag: string, checked: boolean) {
    setTags(checked ? [...tags, tag] : tags.filter((t) => t !== tag));
  }

  return (
    <Popover.Root>
      <Popover.Trigger aria-label="Filter" render={<Button variant="outline" />}>
        <ListFilter data-icon="inline-start" />
        Filter
        {activeCount > 0 ? <Badge>{activeCount}</Badge> : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="end">
          <Popover.Popup className="w-56 space-y-3">
            <div className="space-y-2">
              <p className="text-foreground-muted text-xs font-medium">Type</p>
              <RadioGroup.Root
                className="gap-2"
                onValueChange={(value) => setType(value as TypeFilter)}
                value={type}
              >
                {typeOptions.map((option) => (
                  <label
                    className="flex cursor-pointer items-start gap-2 pointer-coarse:py-1"
                    key={option}
                  >
                    <RadioGroup.Item className="mt-0.5" value={option} />
                    {typeLabels[option]}
                  </label>
                ))}
              </RadioGroup.Root>
            </div>
            {availableTags.length > 0 ? (
              <div className="space-y-2">
                <p className="text-foreground-muted text-xs font-medium">Tags</p>
                <div className="flex flex-col gap-2">
                  {availableTags.map((tag) => (
                    <label
                      className="flex cursor-pointer items-start gap-2 pointer-coarse:py-1"
                      key={tag}
                    >
                      <Checkbox
                        checked={tags.includes(tag)}
                        className="mt-0.5"
                        onCheckedChange={(checked) => toggleTag(tag, checked === true)}
                      />
                      {tag}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <p className="text-foreground-muted text-xs font-medium">Show</p>
              {/* Mutually exclusive: the trash is a flat view that ignores the archived split, so
                  checking one filter clears the other (see Home's navigate handlers). */}
              <label className="flex cursor-pointer items-start gap-2 pointer-coarse:py-1">
                <Checkbox
                  checked={archived}
                  className="mt-0.5"
                  onCheckedChange={(checked) => setArchived(checked === true)}
                />
                Archived only
              </label>
              <label className="flex cursor-pointer items-start gap-2 pointer-coarse:py-1">
                <Checkbox
                  checked={deleted}
                  className="mt-0.5"
                  onCheckedChange={(checked) => setDeleted(checked === true)}
                />
                Deleted only
              </label>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ViewToggle() {
  const {
    state: { view },
    actions: { setView },
  } = useGalleryContext();

  return (
    <Tabs.Root onValueChange={(value) => setView(value as GalleryView)} value={view}>
      {/* Icon-only triggers: 32px is fine for a mouse, so the 44px touch target is coarse-only.
          The list's own height is a group-data variant, hence the important flag. */}
      <Tabs.List className="pointer-coarse:h-11!">
        <Tabs.Trigger aria-label="Grid view" className="w-8 pointer-coarse:w-11" value="grid">
          <LayoutGrid />
        </Tabs.Trigger>
        <Tabs.Trigger aria-label="Table view" className="w-8 pointer-coarse:w-11" value="table">
          <List />
        </Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
  );
}

function Empty() {
  const {
    state: { query, type, tags, archived, deleted },
    actions: { setQuery, setType, setTags, setArchived, setDeleted },
  } = useGalleryContext();
  const narrowed = query.length > 0 || tags.length > 0 || type !== 'all';
  const hasFilters = narrowed || archived || deleted;

  return (
    <EmptyPrimitive.Root className="border py-16">
      {deleted && !narrowed ? (
        <EmptyPrimitive.Header>
          <EmptyPrimitive.Media variant="icon">
            <Trash2 />
          </EmptyPrimitive.Media>
          <EmptyPrimitive.Title>Trash is empty</EmptyPrimitive.Title>
          <EmptyPrimitive.Description>
            Deleted artifacts stay here until you delete them forever.
          </EmptyPrimitive.Description>
        </EmptyPrimitive.Header>
      ) : hasFilters ? (
        <>
          <EmptyPrimitive.Header>
            <EmptyPrimitive.Media variant="icon">
              <SearchX />
            </EmptyPrimitive.Media>
            <EmptyPrimitive.Title>No matching artifacts</EmptyPrimitive.Title>
            <EmptyPrimitive.Description>
              Nothing matches the current search and filters.
            </EmptyPrimitive.Description>
          </EmptyPrimitive.Header>
          <EmptyPrimitive.Content>
            <Button
              onClick={() => {
                setQuery('');
                setType('all');
                setTags([]);
                setArchived(false);
                setDeleted(false);
              }}
              variant="outline"
            >
              Clear filters
            </Button>
          </EmptyPrimitive.Content>
        </>
      ) : (
        <EmptyPrimitive.Header>
          <EmptyPrimitive.Media variant="icon">
            <Inbox />
          </EmptyPrimitive.Media>
          <EmptyPrimitive.Title>No artifacts yet</EmptyPrimitive.Title>
          <EmptyPrimitive.Description>
            Publish one from Claude via MCP: connect it to this app’s <code>/mcp</code> endpoint and
            use the <code>publish_spec</code>, <code>publish_markdown</code>, or{' '}
            <code>publish_html</code> tool.
          </EmptyPrimitive.Description>
        </EmptyPrimitive.Header>
      )}
    </EmptyPrimitive.Root>
  );
}

export interface GalleryResultsProps {
  children: ReactNode;
}

/**
 * Wraps the results so the busy state lives outside memo(Grid)/memo(Table) — dimming a stale list
 * must not re-render the cards behind it.
 */
function Results({ children }: GalleryResultsProps) {
  const {
    state: { updating },
  } = useGalleryContext();

  return (
    <div aria-busy={updating} className={cn('transition-opacity', updating && 'opacity-60')}>
      {children}
    </div>
  );
}

export interface GalleryGridProps {
  items: Artifact[];
  /** Present in the trash view; see ArtifactCard. */
  trash?: TrashActions;
}

/** Memoized: `items` is a stable array (see usePaginatedList), so keystrokes never reach the cards. */
const Grid = memo(function Grid({ items, trash }: GalleryGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((artifact) => (
        <ArtifactCard artifact={artifact} key={artifact.id} trash={trash} />
      ))}
    </div>
  );
});

export interface GalleryTableProps {
  items: Artifact[];
  /** Present in the trash view; rows link nowhere and gain an actions column. */
  trash?: TrashActions;
}

/** Row-level component so each row's `Link` params keep a stable identity, as in ArtifactCard. */
const TableRow = memo(function TableRow({
  artifact,
  trash,
}: {
  artifact: Artifact;
  trash?: TrashActions;
}) {
  const params = useMemo(() => ({ id: artifact.id }), [artifact.id]);

  return (
    // The title link stretches over the whole row (::after), so the row itself carries no click
    // handler: one accessible target, and the focus ring rides the pseudo-element because a
    // border-collapse <tr> doesn't paint box-shadow.
    <TablePrimitive.Row className="relative">
      <TablePrimitive.Cell className="font-medium">
        {trash ? (
          artifact.title
        ) : (
          <Link
            className="focus-visible:after:ring-focus outline-none after:absolute after:inset-0 focus-visible:after:ring-3 focus-visible:after:ring-inset"
            params={params}
            to="/a/$id"
          >
            {artifact.title}
          </Link>
        )}
      </TablePrimitive.Cell>
      <TablePrimitive.Cell>
        <TypeBadge type={artifact.type} />
      </TablePrimitive.Cell>
      <TablePrimitive.Cell>
        <TagList tags={artifact.tags} />
      </TablePrimitive.Cell>
      {/* Positioned after the stretched overlay in paint order, so its title tooltip survives. */}
      <TablePrimitive.Cell className="text-foreground-muted relative text-xs">
        <RelativeTime value={artifact.updatedAt} />
      </TablePrimitive.Cell>
      {trash ? (
        <TablePrimitive.Cell>
          <ArtifactTrashActions artifact={artifact} trash={trash} />
        </TablePrimitive.Cell>
      ) : null}
    </TablePrimitive.Row>
  );
});

const Table = memo(function Table({ items, trash }: GalleryTableProps) {
  return (
    <TablePrimitive.Root>
      <TablePrimitive.Header>
        <TablePrimitive.Row>
          <TablePrimitive.Head>Title</TablePrimitive.Head>
          <TablePrimitive.Head>Type</TablePrimitive.Head>
          <TablePrimitive.Head>Tags</TablePrimitive.Head>
          <TablePrimitive.Head>Updated</TablePrimitive.Head>
          {trash ? <TablePrimitive.Head>Actions</TablePrimitive.Head> : null}
        </TablePrimitive.Row>
      </TablePrimitive.Header>
      <TablePrimitive.Body>
        {items.map((artifact) => (
          <TableRow artifact={artifact} key={artifact.id} trash={trash} />
        ))}
      </TablePrimitive.Body>
    </TablePrimitive.Root>
  );
});

export interface GalleryLoadMoreProps {
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

function LoadMore({ hasMore, loadingMore, onLoadMore }: GalleryLoadMoreProps) {
  if (!hasMore) {
    return null;
  }

  return (
    <Button className="self-center" disabled={loadingMore} onClick={onLoadMore} variant="secondary">
      {loadingMore ? <Spinner data-icon="inline-start" /> : null}
      Load more
    </Button>
  );
}

/**
 * Compound gallery. Root is fully controlled — state and setters come in via props (see Home) and
 * reach the other parts through context; parts throw outside Root.
 */
export const Gallery = {
  Root,
  Toolbar,
  Search,
  Filters,
  Sort,
  ViewToggle,
  Empty,
  Results,
  Grid,
  Table,
  LoadMore,
};
