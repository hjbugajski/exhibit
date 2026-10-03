import { lazy, Suspense, use, useEffect, useMemo, useRef, useState } from 'react';

import type { Spec } from '@json-render/core';
import { useNavigate, useRouter } from '@tanstack/react-router';
import {
  Archive,
  ArchiveRestore,
  Download,
  Ellipsis,
  ExternalLink,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react';

import { EditArtifactDialog } from '@/components/artifacts/edit-artifact-dialog';
import {
  loadStateStoreFactory,
  peekStateStoreFactory,
} from '@/components/artifacts/state-store-loader';
import { TypeBadge } from '@/components/artifacts/type-badge';
import { ConfirmDestructiveAction } from '@/components/blocks/confirm-destructive-action';
import { CopyButton } from '@/components/blocks/copy-button';
import { FormStatus } from '@/components/blocks/form-status';
import { HighlightedCode } from '@/components/blocks/highlighted-code';
import { RelativeTime } from '@/components/blocks/relative-time';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { Select } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import type { JsonObject } from '@/database/repository';
import type { ArtifactType } from '@/lib/artifact-types';
import type { ArtifactDetail } from '@/lib/artifacts';
import {
  deleteArtifactFn,
  revertArtifactVersionFn,
  saveArtifactStateFn,
  setArtifactArchivedFn,
} from '@/lib/artifacts';
import type { HighlightLanguage } from '@/lib/highlight';
import type { ActionStatus } from '@/lib/use-form-action';
import { useFormAction } from '@/lib/use-form-action';

type View = 'rendered' | 'source';

/**
 * Both rendered views pull the whole catalog — 28 components plus the zod catalog and
 * @json-render's renderer — so each is its own lazy chunk: an html artifact (which renders as its
 * own sandboxed page) downloads neither, and a markdown artifact doesn't pay for the spec renderer.
 * The state store's factory is loaded on demand for the same reason (see state-store-loader.ts).
 */
const SpecView = lazy(() =>
  import('@/catalog/registry').then((module) => ({ default: module.SpecView })),
);
const MarkdownView = lazy(() =>
  import('@/components/markdown/markdown-view').then((module) => ({
    default: module.MarkdownView,
  })),
);

/** Highlighter grammar for each type's stored body, shown in the Source tab. */
const sourceLanguage: Record<ArtifactType, HighlightLanguage> = {
  spec: 'json',
  html: 'html',
  markdown: 'markdown',
};

/** Best-effort parse; `undefined` (as distinct from `null`) marks a parse failure. */
function parseSpecBody(body: string): Spec | null | undefined {
  try {
    return JSON.parse(body) as Spec;
  } catch {
    return undefined;
  }
}

export function ArtifactDetailView({ id, detail }: { id: string; detail: ArtifactDetail }) {
  const navigate = useNavigate();
  const router = useRouter();
  const { artifact, version, versions, answers } = detail;
  const latestVersion = Math.max(...versions.map((v) => v.version));

  const [view, setView] = useState<View>('rendered');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteAction = useFormAction();
  const archiveAction = useFormAction();
  const restoreAction = useFormAction();
  const [saveStatus, setSaveStatus] = useState<ActionStatus | null>(null);

  const parsedSpec = useMemo(
    () => (artifact.type === 'spec' ? parseSpecBody(version.body) : null),
    [artifact.type, version.body],
  );

  // Stateful catalog components (Checklist statePath) read/write this store, whether they come from
  // a spec or from a markdown body's embedded components; every change is debounced into
  // saveArtifactStateFn. html artifacts render outside the app entirely and have no store. The
  // routes key this component by artifact id but not by version, so the store is reseeded whenever
  // the version identity changes — otherwise switching versions would render stale interaction
  // state (and debounce-save it) against a body it was never created for. The seed is always the
  // server's current state: the detail routes never cache a match (gcTime 0), and a version switch
  // flushes the pending save before the next loader reads state. The factory comes from a dynamic
  // import that the loaders await first, so the peek normally hits; `use()` covers the rest by
  // suspending into the route match's boundary.
  const stateful = artifact.type !== 'html';
  const createStore = stateful ? (peekStateStoreFactory() ?? use(loadStateStoreFactory())) : null;
  const versionKey = `${id}:${version.version}`;
  const [seededVersionKey, setSeededVersionKey] = useState(versionKey);
  const [stateStore, setStateStore] = useState(() =>
    createStore ? createStore(detail.state ?? {}) : null,
  );
  const flushSaveRef = useRef<() => Promise<void>>(() => Promise.resolve());

  if (versionKey !== seededVersionKey) {
    setSeededVersionKey(versionKey);
    setStateStore(createStore ? createStore(detail.state ?? {}) : null);
  }

  useEffect(() => {
    if (!stateStore) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let pendingSnapshot: JsonObject | null = null;
    let inFlight = Promise.resolve();

    // Chained rather than fired off independently: the server replaces the stored state wholesale,
    // so two overlapping requests could land out of order and resurrect an older snapshot.
    function save(state: JsonObject) {
      inFlight = inFlight.then(async () => {
        try {
          await saveArtifactStateFn({ data: { id, state } });
          setSaveStatus(null);
        } catch {
          setSaveStatus({ kind: 'error', message: 'Your latest changes are not saved.' });
        }
      });
    }

    flushSaveRef.current = () => {
      clearTimeout(timer);

      if (pendingSnapshot) {
        save(pendingSnapshot);
        pendingSnapshot = null;
      }

      return inFlight;
    };

    const unsubscribe = stateStore.subscribe(() => {
      const snapshot = stateStore.getSnapshot() as JsonObject;

      pendingSnapshot = snapshot;
      clearTimeout(timer);
      timer = setTimeout(() => {
        pendingSnapshot = null;
        save(snapshot);
      }, 600);
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();

      // Flush a still-debounced save instead of dropping it, e.g. when navigating away right after
      // an edit.
      if (pendingSnapshot) {
        save(pendingSnapshot);
      }
    };
  }, [stateStore, id]);

  // Awaits the pending save first: the next version's loader reads state, and the view stays
  // mounted (keyed by id) across the switch, so a failed save still shows its banner.
  async function handleVersionChange(next: number) {
    await flushSaveRef.current();

    if (next === latestVersion) {
      await navigate({ to: '/a/$id', params: { id } });
    } else {
      await navigate({ to: '/a/$id/v/$n', params: { id, n: String(next) } });
    }
  }

  // Appends this version's body as a new latest version, so the artifact root is where the result
  // lives; the old version stays browsable in the Select.
  function handleRestoreVersion() {
    void restoreAction.run(async () => {
      await flushSaveRef.current();
      await revertArtifactVersionFn({ data: { id, version: version.version } });
      await router.invalidate();
      await navigate({ to: '/a/$id', params: { id } });
    });
  }

  function handleArchiveToggle() {
    void archiveAction.run(async () => {
      await setArtifactArchivedFn({ data: { id, archived: artifact.archivedAt == null } });
      await router.invalidate();
    });
  }

  function handleDelete() {
    void deleteAction.run(async () => {
      await deleteArtifactFn({ data: { id } });
      // Deleting can retire a tag; without this the cached tag list outlives it (_authed staleTime).
      await router.invalidate();
      await navigate({ to: '/' });
    });
  }

  const sourceText = useMemo(
    () =>
      artifact.type === 'spec' && parsedSpec !== undefined
        ? JSON.stringify(parsedSpec, null, 2)
        : version.body,
    [artifact.type, parsedSpec, version.body],
  );

  const source = (
    <div className="relative">
      <CopyButton
        className="bg-scrim-strong absolute top-3 right-3 backdrop-blur-sm"
        label="Copy source"
        text={sourceText}
      />
      <HighlightedCode
        className="bg-background overflow-x-auto rounded-lg border p-4 text-sm"
        code={sourceText}
        language={sourceLanguage[artifact.type]}
      />
    </div>
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          {/* min-w-0 + break-words: titles can be 200 chars of URL-ish tokens and must not push
              the page into horizontal scroll on a 375px viewport. */}
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight break-words">{artifact.title}</h1>
            {artifact.description ? (
              <p className="text-foreground-muted mt-2 break-words">{artifact.description}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {artifact.archivedAt != null ? <Badge>Archived</Badge> : null}
            <TypeBadge type={artifact.type} />
          </div>
        </div>
        <div className="text-foreground-muted flex flex-wrap items-center gap-2 text-sm">
          <span>
            Updated <RelativeTime value={artifact.updatedAt} />
          </span>
          {/* Omitted entirely when the body asks nothing, rather than showing "0 of 0". */}
          {answers.total > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {answers.answered} of {answers.total} answered
              </span>
            </>
          ) : null}
          {artifact.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      </header>

      <Tabs.Root className="gap-8" onValueChange={(value) => setView(value as View)} value={view}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Select.Root
                onValueChange={(value) => {
                  void handleVersionChange(Number(value));
                }}
                value={String(version.version)}
              >
                <Select.Trigger aria-label="Version">
                  <Select.Value>
                    {(value: string | null) =>
                      value
                        ? `v${value}${Number(value) === latestVersion ? ' (latest)' : ''}`
                        : null
                    }
                  </Select.Value>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Positioner alignItemWithTrigger={false} align="start">
                    <Select.Popup>
                      <Select.ScrollUpArrow />
                      <Select.List>
                        <Select.Group>
                          {versions
                            .slice()
                            .reverse()
                            .map((v) => (
                              <Select.Item key={v.version} value={String(v.version)}>
                                v{v.version}
                                {v.version === latestVersion ? ' (latest)' : ''} ·{' '}
                                <RelativeTime value={v.createdAt} />
                              </Select.Item>
                            ))}
                        </Select.Group>
                      </Select.List>
                      <Select.ScrollDownArrow />
                    </Select.Popup>
                  </Select.Positioner>
                </Select.Portal>
              </Select.Root>
              {/* html artifacts open as their own sandboxed page, so they have no rendered tab. */}
              {artifact.type === 'html' ? (
                <a
                  className={buttonVariants()}
                  href={`/render/${id}/${version.version}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Open
                  <ExternalLink data-icon="inline-end" />
                </a>
              ) : (
                <Tabs.List>
                  <Tabs.Trigger value="rendered">Rendered</Tabs.Trigger>
                  <Tabs.Trigger value="source">Source</Tabs.Trigger>
                </Tabs.List>
              )}
            </div>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                render={<Button aria-label="Artifact actions" variant="outline" />}
              >
                <Ellipsis data-icon="only" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Positioner align="end">
                  <DropdownMenu.Popup>
                    <DropdownMenu.Item
                      render={
                        <a download href={`/download/${id}/${version.version}`}>
                          <Download data-icon="inline-start" />
                          Download
                        </a>
                      }
                    />
                    {version.version !== latestVersion ? (
                      <DropdownMenu.Item
                        disabled={restoreAction.pending}
                        onClick={handleRestoreVersion}
                      >
                        <RotateCcw data-icon="inline-start" />
                        Restore this version
                      </DropdownMenu.Item>
                    ) : null}
                    <DropdownMenu.Item onClick={() => setEditOpen(true)}>
                      <Pencil data-icon="inline-start" />
                      Edit
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      disabled={archiveAction.pending}
                      onClick={handleArchiveToggle}
                    >
                      {artifact.archivedAt == null ? (
                        <>
                          <Archive data-icon="inline-start" />
                          Archive
                        </>
                      ) : (
                        <>
                          <ArchiveRestore data-icon="inline-start" />
                          Unarchive
                        </>
                      )}
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item onClick={() => setDeleteOpen(true)} variant="destructive">
                      <Trash2 data-icon="inline-start" />
                      Delete
                    </DropdownMenu.Item>
                  </DropdownMenu.Popup>
                </DropdownMenu.Positioner>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <EditArtifactDialog artifact={artifact} onOpenChange={setEditOpen} open={editOpen} />
            <ConfirmDestructiveAction
              action={deleteAction}
              actionLabel="Delete"
              description={
                <>
                  <strong className="text-foreground font-medium">{artifact.title}</strong> is moved
                  to the trash and hidden from the gallery. Restore it from the gallery’s “Deleted
                  only” filter, or delete it forever from there.
                </>
              }
              onConfirm={handleDelete}
              onOpenChange={setDeleteOpen}
              open={deleteOpen}
              pendingLabel="Deleting…"
              title="Delete artifact"
            />
          </div>
          <Separator />
        </div>

        <FormStatus status={saveStatus} />
        <FormStatus status={archiveAction.status} />
        <FormStatus status={restoreAction.status} />

        {artifact.type === 'html' ? (
          source
        ) : (
          <>
            <Tabs.Content className="text-base" value="rendered">
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                {artifact.type === 'markdown' ? (
                  <MarkdownView markdown={version.body} store={stateStore ?? undefined} />
                ) : parsedSpec === undefined ? (
                  <p className="text-danger">
                    Could not parse the stored spec JSON. Check the Source tab or republish the
                    artifact.
                  </p>
                ) : (
                  <SpecView spec={parsedSpec} store={stateStore ?? undefined} />
                )}
              </Suspense>
            </Tabs.Content>
            <Tabs.Content value="source">{source}</Tabs.Content>
          </>
        )}
      </Tabs.Root>
    </div>
  );
}
