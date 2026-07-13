import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { nanoid } from 'nanoid';
import { z } from 'zod';

import { artifacts } from '@/database/schemas/artifact';
import { artifactStates } from '@/database/schemas/artifact-state';
import { artifactVersions } from '@/database/schemas/artifact-version';
import type { ArtifactSort } from '@/lib/artifact-sorts';
import { artifactSorts } from '@/lib/artifact-sorts';

export type Db = BetterSQLite3Database;

export type ArtifactType = 'spec' | 'html';

/**
 * Timestamps are epoch milliseconds; `deletedAt` is null while live, `archivedAt` is null while
 * unarchived.
 */
export interface Artifact {
  id: string;
  title: string;
  description: string | null;
  type: ArtifactType;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
  deletedAt: number | null;
}

/**
 * `version` is 1-based and assigned in code (createArtifact/appendVersion), not by the database.
 */
export interface ArtifactVersion {
  id: string;
  artifactId: string;
  version: number;
  body: string;
  createdAt: number;
}

export interface CreateArtifactInput {
  title: string;
  description?: string | null;
  type: ArtifactType;
  tags?: string[];
  body: string;
}

/** `undefined` leaves a field unchanged; a `null` description explicitly clears it. */
export interface UpdateMetadataInput {
  title?: string;
  description?: string | null;
  tags?: string[];
}

/**
 * `limit` defaults to 20, `sort` to 'updated-desc'. A malformed `cursor`, or one minted under a
 * different `sort`, is ignored (first page). `archived: true` lists only archived artifacts;
 * otherwise archived artifacts are excluded.
 */
export interface ListArtifactsInput {
  query?: string;
  tags?: string[];
  type?: ArtifactType;
  archived?: boolean;
  sort?: ArtifactSort;
  limit?: number;
  cursor?: string;
}

/**
 * A `listArtifacts` row plus a cheap owner-response signal: when the artifact's interaction state
 * last changed, or null if never touched.
 */
export type ArtifactListItem = Artifact & { stateUpdatedAt: number | null };

export interface ListArtifactsResult {
  items: ArtifactListItem[];
  nextCursor: string | null;
}

function toArtifact(row: typeof artifacts.$inferSelect): Artifact {
  return {
    ...row,
    type: row.type as ArtifactType,
    tags: row.tags ?? [],
  };
}

function toArtifactListItem(
  row: typeof artifacts.$inferSelect & { stateUpdatedAt: number | null },
): ArtifactListItem {
  return { ...toArtifact(row), stateUpdatedAt: row.stateUpdatedAt };
}

/**
 * Escapes LIKE metacharacters (`%`, `_`, and the escape char itself) so a user-supplied substring
 * is matched literally; pair with `ESCAPE '\'`.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

type SortField = 'updatedAt' | 'createdAt' | 'title';

/**
 * Title sort is case-insensitive (cheap via SQLite's `lower()`); the cursor's `k` is stored
 * pre-lowercased for title sorts so comparisons stay consistent.
 */
const sortSpecs: Record<ArtifactSort, { field: SortField; dir: 'asc' | 'desc' }> = {
  'updated-desc': { field: 'updatedAt', dir: 'desc' },
  'updated-asc': { field: 'updatedAt', dir: 'asc' },
  'created-desc': { field: 'createdAt', dir: 'desc' },
  'created-asc': { field: 'createdAt', dir: 'asc' },
  'title-asc': { field: 'title', dir: 'asc' },
  'title-desc': { field: 'title', dir: 'desc' },
};

function sortColumnExpr(field: SortField) {
  switch (field) {
    case 'updatedAt':
      return sql`${artifacts.updatedAt}`;
    case 'createdAt':
      return sql`${artifacts.createdAt}`;
    case 'title':
      return sql`lower(${artifacts.title})`;
  }
}

interface Cursor {
  sort: ArtifactSort;
  k: number | string;
  id: string;
}

function encodeCursor(
  sort: ArtifactSort,
  field: SortField,
  row: { updatedAt: number; createdAt: number; title: string; id: string },
): string {
  const k = field === 'title' ? row.title.toLowerCase() : row[field];

  return Buffer.from(JSON.stringify({ sort, k, id: row.id })).toString('base64url');
}

/**
 * Cursors are attacker-controlled bytes (base64url echoed back by any caller), so the shape —
 * including enum membership of `sort` — is parsed, never cast.
 */
const cursorSchema = z.object({
  sort: z.enum(artifactSorts),
  k: z.union([z.number(), z.string()]),
  id: z.string(),
});

function decodeCursor(cursor: string): Cursor | null {
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    );

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function createArtifact(
  db: Db,
  input: CreateArtifactInput,
): { artifact: Artifact; version: ArtifactVersion } {
  const now = Date.now();
  const artifactId = nanoid();

  return db.transaction((tx) => {
    const artifact = tx
      .insert(artifacts)
      .values({
        id: artifactId,
        title: input.title,
        description: input.description ?? null,
        type: input.type,
        tags: input.tags ?? null,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        deletedAt: null,
      })
      .returning()
      .get();

    const version = tx
      .insert(artifactVersions)
      .values({
        id: nanoid(),
        artifactId,
        version: 1,
        body: input.body,
        createdAt: now,
      })
      .returning()
      .get();

    return { artifact: toArtifact(artifact), version };
  });
}

/** Inserts the next version number and bumps the artifact's `updatedAt`, in one transaction. */
export function appendVersion(db: Db, artifactId: string, body: string): ArtifactVersion {
  const now = Date.now();

  return db.transaction((tx) => {
    const latest = tx
      .select({ version: artifactVersions.version })
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, artifactId))
      .orderBy(desc(artifactVersions.version))
      .limit(1)
      .get();

    const nextVersion = (latest?.version ?? 0) + 1;

    const version = tx
      .insert(artifactVersions)
      .values({ id: nanoid(), artifactId, version: nextVersion, body, createdAt: now })
      .returning()
      .get();

    tx.update(artifacts).set({ updatedAt: now }).where(eq(artifacts.id, artifactId)).run();

    return version;
  });
}

/**
 * Returns undefined when `artifactId` matches no row. Doesn't check `deletedAt`, so soft-deleted
 * artifacts update too.
 */
export function updateMetadata(
  db: Db,
  artifactId: string,
  input: UpdateMetadataInput,
): Artifact | undefined {
  const now = Date.now();

  const artifact = db
    .update(artifacts)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      updatedAt: now,
    })
    .where(eq(artifacts.id, artifactId))
    .returning()
    .get();

  return artifact ? toArtifact(artifact) : undefined;
}

/**
 * Live artifacts only (soft-deleted resolve as missing); `undefined` when the artifact or the
 * requested version doesn't exist.
 */
export function getArtifact(
  db: Db,
  id: string,
  version?: number,
): { artifact: Artifact; version: ArtifactVersion } | undefined {
  const artifactRow = db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.id, id), isNull(artifacts.deletedAt)))
    .get();

  if (!artifactRow) {
    return undefined;
  }

  const versionRow =
    version === undefined
      ? getLatestVersion(db, id)
      : db
          .select()
          .from(artifactVersions)
          .where(and(eq(artifactVersions.artifactId, id), eq(artifactVersions.version, version)))
          .get();

  if (!versionRow) {
    return undefined;
  }

  return { artifact: toArtifact(artifactRow), version: versionRow };
}

/**
 * Unlike getArtifact, ignores the parent's `deletedAt` — resolves versions of soft-deleted
 * artifacts.
 */
export function getLatestVersion(db: Db, artifactId: string): ArtifactVersion | undefined {
  return db
    .select()
    .from(artifactVersions)
    .where(eq(artifactVersions.artifactId, artifactId))
    .orderBy(desc(artifactVersions.version))
    .limit(1)
    .get();
}

/** All versions for an artifact, ascending, with their creation timestamps. */
export function listVersions(db: Db, artifactId: string): { version: number; createdAt: number }[] {
  return db
    .select({ version: artifactVersions.version, createdAt: artifactVersions.createdAt })
    .from(artifactVersions)
    .where(eq(artifactVersions.artifactId, artifactId))
    .orderBy(artifactVersions.version)
    .all();
}

/**
 * Excludes soft-deleted artifacts. `query` substring-matches the title; `tags` matches ANY listed
 * tag (OR).
 */
export function listArtifacts(db: Db, input: ListArtifactsInput = {}): ListArtifactsResult {
  const limit = input.limit ?? 20;
  const sort = input.sort ?? 'updated-desc';
  const { field, dir } = sortSpecs[sort];

  const conditions = [
    isNull(artifacts.deletedAt),
    input.archived ? isNotNull(artifacts.archivedAt) : isNull(artifacts.archivedAt),
  ];

  if (input.query) {
    conditions.push(sql`${artifacts.title} like ${`%${escapeLike(input.query)}%`} escape '\\'`);
  }

  if (input.type) {
    conditions.push(eq(artifacts.type, input.type));
  }

  if (input.tags && input.tags.length > 0) {
    const tagCondition = or(
      ...input.tags.map(
        (tag) => sql`${artifacts.tags} like ${`%"${escapeLike(tag)}"%`} escape '\\'`,
      ),
    );

    if (tagCondition) {
      conditions.push(tagCondition);
    }
  }

  const decoded = input.cursor ? decodeCursor(input.cursor) : null;

  if (decoded && decoded.sort === sort) {
    const expr = sortColumnExpr(field);
    const cmp = dir === 'desc' ? lt : gt;
    const cursorCondition = or(
      cmp(expr, decoded.k),
      and(eq(expr, decoded.k), cmp(artifacts.id, decoded.id)),
    );

    if (cursorCondition) {
      conditions.push(cursorCondition);
    }
  }

  const orderFn = dir === 'desc' ? desc : asc;

  const rows = db
    .select({ ...getTableColumns(artifacts), stateUpdatedAt: artifactStates.updatedAt })
    .from(artifacts)
    .leftJoin(artifactStates, eq(artifacts.id, artifactStates.artifactId))
    .where(and(...conditions))
    .orderBy(orderFn(sortColumnExpr(field)), orderFn(artifacts.id))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);

  return {
    items: page.map(toArtifactListItem),
    nextCursor: hasMore && last ? encodeCursor(sort, field, last) : null,
  };
}

/** Distinct tags across non-deleted artifacts, deduped and sorted alphabetically. */
export function listTags(db: Db): string[] {
  const rows = db
    .select({ tags: artifacts.tags })
    .from(artifacts)
    .where(isNull(artifacts.deletedAt))
    .all();

  const tagSet = new Set<string>();

  for (const row of rows) {
    if (!row.tags) {
      continue;
    }

    for (const tag of row.tags) {
      tagSet.add(tag);
    }
  }

  return [...tagSet].sort((a, b) => a.localeCompare(b));
}

/**
 * Sets or clears `archivedAt` without touching `updatedAt`, so archiving doesn't reshuffle sort
 * order. Returns undefined when `id` matches no row.
 */
export function setArtifactArchived(db: Db, id: string, archived: boolean): Artifact | undefined {
  const artifact = db
    .update(artifacts)
    .set({ archivedAt: archived ? Date.now() : null })
    .where(eq(artifacts.id, id))
    .returning()
    .get();

  return artifact ? toArtifact(artifact) : undefined;
}

export function softDeleteArtifact(db: Db, id: string): void {
  db.update(artifacts).set({ deletedAt: Date.now() }).where(eq(artifacts.id, id)).run();
}

/**
 * Whether an artifact row exists by id, including already soft-deleted rows (used to make
 * delete_artifact idempotent).
 */
export function artifactExists(db: Db, id: string): boolean {
  return (
    db.select({ id: artifacts.id }).from(artifacts).where(eq(artifacts.id, id)).get() !== undefined
  );
}

/**
 * JSON-serializable value; concrete (no `unknown`) so artifact state can flow through TanStack
 * Start's typed server-fn serialization.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

/**
 * Interaction state for stateful spec components, keyed per artifact (state paths are authored in
 * the spec, so they carry across versions), plus when it was last changed. Returns null when no
 * state has been saved yet.
 */
export function getArtifactState(
  db: Db,
  artifactId: string,
): { state: JsonObject; updatedAt: number } | null {
  const row = db
    .select({ state: artifactStates.state, updatedAt: artifactStates.updatedAt })
    .from(artifactStates)
    .where(eq(artifactStates.artifactId, artifactId))
    .get();

  return row ? { state: row.state as JsonObject, updatedAt: row.updatedAt } : null;
}

/** Upsert keyed by artifact; replaces the stored state wholesale (no merge). */
export function setArtifactState(db: Db, artifactId: string, state: JsonObject): void {
  const now = Date.now();

  db.insert(artifactStates)
    .values({ artifactId, state, updatedAt: now })
    .onConflictDoUpdate({
      target: artifactStates.artifactId,
      set: { state, updatedAt: now },
    })
    .run();
}
