import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { db } from '@/database';
import type { Artifact, ArtifactVersion, JsonObject, JsonValue } from '@/database/repository';
import {
  getArtifact,
  getArtifactState,
  listArtifacts,
  listTags,
  listVersions,
  purgeArtifact,
  restoreArtifact,
  setArtifactArchived,
  setArtifactState,
  softDeleteArtifact,
  updateMetadata,
} from '@/database/repository';
import {
  descriptionField,
  normalizeTags,
  requireArtifact,
  tagsField,
  titleField,
} from '@/lib/artifact-metadata';
import { artifactSorts, artifactTypes } from '@/lib/artifact-sorts';
import { sessionMiddleware } from '@/lib/session-middleware';

/**
 * Server functions backing the gallery/detail UI. `beforeLoad` guards on the `_authed` layout are
 * UX-only (see auth-session.ts) - `sessionMiddleware` (src/lib/session-middleware.ts) re-checks the
 * session itself before any handler here touches artifact data.
 *
 * IMPORTANT: each handler below must stay written *inline* inside `.handler(...)`, never delegated
 * to a separately-exported function that calls `db`. The `_authed/index.tsx` route
 * (client-rendered) imports `listArtifactsFn` from this file, so this whole module is part of the
 * client bundle; TanStack Start's build only strips the server-only body (and its
 * `db`/better-sqlite3 dependency chain) out of the client bundle when that body is the literal
 * argument to `.handler()` — anything else ships better-sqlite3 to the browser and crashes
 * hydration.
 */

const listArtifactsInput = z.object({
  query: z.string().optional(),
  tags: z.array(z.string()).optional(),
  type: z.enum(artifactTypes).optional(),
  archived: z.boolean().optional(),
  deleted: z.boolean().optional(),
  sort: z.enum(artifactSorts).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const listArtifactsFn = createServerFn({ method: 'GET' })
  .middleware([sessionMiddleware])
  .validator(listArtifactsInput)
  .handler(async ({ data }) => {
    return listArtifacts(db, data);
  });

export const listTagsFn = createServerFn({ method: 'GET' })
  .middleware([sessionMiddleware])
  .handler(async () => {
    return listTags(db);
  });

export interface ArtifactDetail {
  artifact: Artifact;
  version: ArtifactVersion;
  versions: { version: number; createdAt: number }[];
  /** Interaction state for stateful spec components; null until first saved. */
  state: JsonObject | null;
}

const artifactDetailInput = z.object({
  id: z.string(),
  version: z.number().int().positive().optional(),
});

export const getArtifactDetailFn = createServerFn({ method: 'GET' })
  .middleware([sessionMiddleware])
  .validator(artifactDetailInput)
  .handler(async ({ data }): Promise<ArtifactDetail | null> => {
    const result = getArtifact(db, data.id, data.version);

    if (!result) {
      return null;
    }

    return {
      ...result,
      versions: listVersions(db, data.id),
      state: getArtifactState(db, data.id)?.state ?? null,
    };
  });

const updateArtifactMetadataInput = z.object({
  id: z.string(),
  title: titleField,
  description: descriptionField.nullable(),
  tags: tagsField,
});

/** Throws for unknown ids; a null description clears it. */
export const updateArtifactMetadataFn = createServerFn({ method: 'POST' })
  .middleware([sessionMiddleware])
  .validator(updateArtifactMetadataInput)
  .handler(async ({ data }) => {
    // updateMetadata doesn't filter soft-deleted rows, so the live-artifact check has to happen
    // through getArtifact first.
    requireArtifact(getArtifact(db, data.id));

    return requireArtifact(
      updateMetadata(db, data.id, {
        title: data.title,
        description: data.description,
        tags: normalizeTags(data.tags),
      }),
    );
  });

const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValue), jsonObject]),
);
const jsonObject: z.ZodType<JsonObject> = z.record(z.string(), jsonValue);

const saveArtifactStateInput = z.object({
  id: z.string(),
  state: jsonObject,
});

/**
 * Overwrites the artifact's saved interaction state wholesale. Throws when the serialized state
 * exceeds 64 KB or the artifact is unknown/deleted.
 */
export const saveArtifactStateFn = createServerFn({ method: 'POST' })
  .middleware([sessionMiddleware])
  .validator(saveArtifactStateInput)
  .handler(async ({ data }) => {
    // Interaction state is checkbox-scale data; a 64 KB cap is generous and keeps a stuck client
    // from growing the row unbounded.
    if (Buffer.byteLength(JSON.stringify(data.state), 'utf8') > 64_000) {
      throw new Error('Interaction state exceeds the 64 KB limit.');
    }

    requireArtifact(getArtifact(db, data.id));

    setArtifactState(db, data.id, data.state);

    return { saved: true };
  });

const setArtifactArchivedInput = z.object({ id: z.string(), archived: z.boolean() });

/** Throws for unknown/deleted ids. Archiving is idempotent and reversible. */
export const setArtifactArchivedFn = createServerFn({ method: 'POST' })
  .middleware([sessionMiddleware])
  .validator(setArtifactArchivedInput)
  .handler(async ({ data }) => {
    // setArtifactArchived doesn't filter soft-deleted rows, so the live-artifact check has to
    // happen through getArtifact first.
    requireArtifact(getArtifact(db, data.id));

    return requireArtifact(setArtifactArchived(db, data.id, data.archived));
  });

const artifactIdInput = z.object({ id: z.string() });

/**
 * Deliberately unguarded: soft delete is idempotent, so deleting an unknown or already-deleted id
 * succeeds as a no-op rather than throwing (same contract as the MCP `delete_artifact` tool — see
 * its `idempotentHint` note in src/lib/mcp/server.ts).
 */
export const deleteArtifactFn = createServerFn({ method: 'POST' })
  .middleware([sessionMiddleware])
  .validator(artifactIdInput)
  .handler(async ({ data }) => {
    softDeleteArtifact(db, data.id);

    return { deleted: true };
  });

/** Throws for unknown ids. Restoring an artifact that isn't deleted is a no-op. */
export const restoreArtifactFn = createServerFn({ method: 'POST' })
  .middleware([sessionMiddleware])
  .validator(artifactIdInput)
  .handler(async ({ data }) => {
    // getArtifact resolves live artifacts only, so the guard has to come from restoreArtifact's own
    // undefined-on-unknown return.
    return requireArtifact(restoreArtifact(db, data.id));
  });

/**
 * Irreversibly removes the artifact, its versions and its interaction state. Unguarded like
 * `deleteArtifactFn`: purging an id that's already gone reports `purged: false` rather than
 * throwing, so a stale trash list can't turn a completed purge into an error.
 */
export const purgeArtifactFn = createServerFn({ method: 'POST' })
  .middleware([sessionMiddleware])
  .validator(artifactIdInput)
  .handler(async ({ data }) => {
    return { purged: purgeArtifact(db, data.id) };
  });
