import { createContext, use, type ReactNode } from 'react';

import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowUpDown, Inbox, LayoutGrid, List, ListFilter, SearchX } from 'lucide-react';

import { ArtifactCard } from '@/components/artifacts/artifact-card';
import { TagList } from '@/components/artifacts/tag-list';
import { TypeBadge } from '@/components/artifacts/type-badge';
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
import { formatRelativeTime } from '@/lib/format-time';

export type TypeFilter = ArtifactType | 'all';
export type GalleryView = 'grid' | 'table';

const typeLabels: Record<TypeFilter, string> = {
  all: 'All types',
  spec: 'Spec',
  html: 'HTML',
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

interface GalleryState {
  query: string;
  type: TypeFilter;
  archived: boolean;
  sort: ArtifactSort;
  tags: string[];
  view: GalleryView;
}

interface GalleryActions {
  setQuery: (query: string) => void;
  setType: (type: TypeFilter) => void;
  setArchived: (archived: boolean) => void;
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
  return (
    <GalleryContext value={{ state, actions }}>
      <div className="flex flex-col gap-8">{children}</div>
    </GalleryContext>
  );
}

export interface GalleryToolbarProps {
  children: ReactNode;
}

function Toolbar({ children }: GalleryToolbarProps) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
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
    state: { type, tags, archived },
    actions: { setType, setTags, setArchived },
  } = useGalleryContext();
  const activeCount = (type === 'all' ? 0 : 1) + tags.length + (archived ? 1 : 0);

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
                  <label className="flex cursor-pointer items-center gap-2" key={option}>
                    <RadioGroup.Item value={option} />
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
                    <label className="flex cursor-pointer items-center gap-2" key={tag}>
                      <Checkbox
                        checked={tags.includes(tag)}
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
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={archived}
                  onCheckedChange={(checked) => setArchived(checked === true)}
                />
                Archived only
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
    <Tabs.Root
      className="ml-auto"
      onValueChange={(value) => setView(value as GalleryView)}
      value={view}
    >
      <Tabs.List>
        <Tabs.Trigger aria-label="Grid view" className="w-8" value="grid">
          <LayoutGrid />
        </Tabs.Trigger>
        <Tabs.Trigger aria-label="Table view" className="w-8" value="table">
          <List />
        </Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
  );
}

function Empty() {
  const {
    state: { query, type, tags, archived },
    actions: { setQuery, setType, setTags, setArchived },
  } = useGalleryContext();
  const hasFilters = query.length > 0 || tags.length > 0 || type !== 'all' || archived;

  return (
    <EmptyPrimitive.Root className="border py-16">
      {hasFilters ? (
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
            use the <code>publish_spec</code> or <code>publish_html</code> tool.
          </EmptyPrimitive.Description>
        </EmptyPrimitive.Header>
      )}
    </EmptyPrimitive.Root>
  );
}

export interface GalleryGridProps {
  items: Artifact[];
}

function Grid({ items }: GalleryGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((artifact) => (
        <ArtifactCard artifact={artifact} key={artifact.id} />
      ))}
    </div>
  );
}

export interface GalleryTableProps {
  items: Artifact[];
}

function Table({ items }: GalleryTableProps) {
  const navigate = useNavigate();

  return (
    <TablePrimitive.Root>
      <TablePrimitive.Header>
        <TablePrimitive.Row>
          <TablePrimitive.Head>Title</TablePrimitive.Head>
          <TablePrimitive.Head>Type</TablePrimitive.Head>
          <TablePrimitive.Head>Tags</TablePrimitive.Head>
          <TablePrimitive.Head>Updated</TablePrimitive.Head>
        </TablePrimitive.Row>
      </TablePrimitive.Header>
      <TablePrimitive.Body>
        {items.map((artifact) => (
          <TablePrimitive.Row
            className="cursor-pointer"
            key={artifact.id}
            onClick={() => {
              void navigate({ to: '/a/$id', params: { id: artifact.id } });
            }}
          >
            <TablePrimitive.Cell className="font-medium">
              <Link
                onClick={(event) => event.stopPropagation()}
                params={{ id: artifact.id }}
                to="/a/$id"
              >
                {artifact.title}
              </Link>
            </TablePrimitive.Cell>
            <TablePrimitive.Cell>
              <TypeBadge type={artifact.type} />
            </TablePrimitive.Cell>
            <TablePrimitive.Cell>
              <TagList tags={artifact.tags} />
            </TablePrimitive.Cell>
            <TablePrimitive.Cell className="text-foreground-muted text-xs">
              {formatRelativeTime(artifact.updatedAt)}
            </TablePrimitive.Cell>
          </TablePrimitive.Row>
        ))}
      </TablePrimitive.Body>
    </TablePrimitive.Root>
  );
}

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
  Grid,
  Table,
  LoadMore,
};
