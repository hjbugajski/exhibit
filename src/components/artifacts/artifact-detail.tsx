import { useEffect, useMemo, useState } from 'react';

import type { Spec } from '@json-render/core';
import { createStateStore } from '@json-render/react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import {
  Archive,
  ArchiveRestore,
  Check,
  Copy,
  Download,
  Ellipsis,
  ExternalLink,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';

import { SpecView } from '@/catalog/registry';
import { EditArtifactDialog } from '@/components/artifacts/edit-artifact-dialog';
import { TypeBadge } from '@/components/artifacts/type-badge';
import { ConfirmDestructiveAction } from '@/components/blocks/confirm-destructive-action';
import { FormStatus } from '@/components/blocks/form-status';
import { HighlightedCode } from '@/components/blocks/highlighted-code';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { Select } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs } from '@/components/ui/tabs';
import type { JsonObject } from '@/database/repository';
import type { ArtifactDetail } from '@/lib/artifacts';
import { deleteArtifactFn, saveArtifactStateFn, setArtifactArchivedFn } from '@/lib/artifacts';
import { formatRelativeTime } from '@/lib/format-time';
import { useCopyToClipboard } from '@/lib/use-copy-to-clipboard';
import type { ActionStatus } from '@/lib/use-form-action';
import { useFormAction } from '@/lib/use-form-action';

type View = 'rendered' | 'source';

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
  const { artifact, version, versions } = detail;
  const latestVersion = Math.max(...versions.map((v) => v.version));

  const [view, setView] = useState<View>('rendered');
  const { copyStatus, copy } = useCopyToClipboard();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteAction = useFormAction();
  const archiveAction = useFormAction();
  const [saveStatus, setSaveStatus] = useState<ActionStatus | null>(null);

  const parsedSpec = useMemo(
    () => (artifact.type === 'spec' ? parseSpecBody(version.body) : null),
    [artifact.type, version.body],
  );

  // Stateful spec components (Checklist statePath) read/write this store; every change is debounced
  // into saveArtifactStateFn. The routes key this component by artifact id but not by version, so
  // the store is reseeded whenever the version identity changes — otherwise switching versions
  // would render stale interaction state (and debounce-save it) against a spec it was never created
  // for.
  const versionKey = `${id}:${version.version}`;
  const [seededVersionKey, setSeededVersionKey] = useState(versionKey);
  const [specStore, setSpecStore] = useState(() =>
    artifact.type === 'spec' ? createStateStore(detail.state ?? {}) : null,
  );

  if (versionKey !== seededVersionKey) {
    setSeededVersionKey(versionKey);
    setSpecStore(artifact.type === 'spec' ? createStateStore(detail.state ?? {}) : null);
  }

  useEffect(() => {
    if (!specStore) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let pendingSnapshot: JsonObject | null = null;

    function save(state: JsonObject) {
      saveArtifactStateFn({ data: { id, state } }).catch(() => {
        setSaveStatus({ kind: 'error', message: 'Could not save your changes. Try again.' });
      });
    }

    const unsubscribe = specStore.subscribe(() => {
      const snapshot = specStore.getSnapshot() as JsonObject;

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

      // Flush a still-debounced save instead of dropping it, e.g. when switching versions or
      // navigating away right after an edit.
      if (pendingSnapshot) {
        save(pendingSnapshot);
      }
    };
  }, [specStore, id]);

  function handleVersionChange(next: number) {
    if (next === latestVersion) {
      void navigate({ to: '/a/$id', params: { id } });
    } else {
      void navigate({ to: '/a/$id/v/$n', params: { id, n: String(next) } });
    }
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
      await navigate({ to: '/' });
    });
  }

  const sourceText =
    artifact.type === 'spec'
      ? parsedSpec === undefined
        ? version.body
        : JSON.stringify(parsedSpec, null, 2)
      : version.body;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{artifact.title}</h1>
            {artifact.description ? (
              <p className="text-foreground-muted mt-2">{artifact.description}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {artifact.archivedAt != null ? <Badge>Archived</Badge> : null}
            <TypeBadge type={artifact.type} />
          </div>
        </div>
        <div className="text-foreground-muted flex flex-wrap items-center gap-2 text-sm">
          <span>Updated {formatRelativeTime(artifact.updatedAt)}</span>
          {artifact.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      </header>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Select.Root
              onValueChange={(value) => handleVersionChange(Number(value))}
              value={String(version.version)}
            >
              <Select.Trigger aria-label="Version">
                <Select.Value>
                  {(value: string | null) =>
                    value ? `v${value}${Number(value) === latestVersion ? ' (latest)' : ''}` : null
                  }
                </Select.Value>
              </Select.Trigger>
              <Select.Portal>
                <Select.Positioner alignItemWithTrigger={false} align="start">
                  <Select.Popup alignItemWithTrigger={false}>
                    <Select.Group>
                      {versions
                        .slice()
                        .reverse()
                        .map((v) => (
                          <Select.Item key={v.version} value={String(v.version)}>
                            v{v.version}
                            {v.version === latestVersion ? ' (latest)' : ''} ·{' '}
                            {formatRelativeTime(v.createdAt)}
                          </Select.Item>
                        ))}
                    </Select.Group>
                  </Select.Popup>
                </Select.Positioner>
              </Select.Portal>
            </Select.Root>
            {artifact.type === 'spec' ? (
              <Tabs.Root onValueChange={(value) => setView(value as View)} value={view}>
                <Tabs.List>
                  <Tabs.Trigger value="rendered">Rendered</Tabs.Trigger>
                  <Tabs.Trigger value="source">Source</Tabs.Trigger>
                </Tabs.List>
              </Tabs.Root>
            ) : null}
            {artifact.type === 'html' ? (
              <Button
                nativeButton={false}
                render={
                  <a
                    href={`/render/${id}/${version.version}`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Open
                    <ExternalLink data-icon="inline-end" />
                  </a>
                }
              />
            ) : null}
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
                  <DropdownMenu.Item onClick={() => setEditOpen(true)}>
                    <Pencil data-icon="inline-start" />
                    Edit
                  </DropdownMenu.Item>
                  <DropdownMenu.Item disabled={archiveAction.pending} onClick={handleArchiveToggle}>
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
            confirmation="I understand this can’t be undone."
            description={
              <>
                <strong className="text-foreground font-medium">{artifact.title}</strong> and all of
                its versions are deleted immediately.
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

      {artifact.type === 'spec' && view === 'rendered' ? (
        <div>
          {parsedSpec === undefined ? (
            <p className="text-danger">
              Could not parse the stored spec JSON. Check the Source tab or republish the artifact.
            </p>
          ) : (
            <SpecView spec={parsedSpec} store={specStore ?? undefined} />
          )}
        </div>
      ) : (
        <div className="relative">
          <Button
            aria-label="Copy source"
            className="bg-background/90 absolute top-3 right-3 backdrop-blur-sm"
            onClick={() => {
              void copy(sourceText);
            }}
            variant="ghost"
          >
            {copyStatus === 'copied' ? (
              <Check data-icon="only" />
            ) : copyStatus === 'failed' ? (
              <X data-icon="only" />
            ) : (
              <Copy data-icon="only" />
            )}
          </Button>
          <HighlightedCode
            className="bg-background overflow-x-auto rounded-lg border p-4 text-sm"
            code={sourceText}
            language={artifact.type === 'spec' ? 'json' : 'html'}
          />
        </div>
      )}
    </div>
  );
}
