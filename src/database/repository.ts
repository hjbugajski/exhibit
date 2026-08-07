import type { SQL } from 'drizzle-orm';
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
import type { AnswerCount } from '@/lib/answer-count';
import { countAnswers } from '@/lib/answer-count';
import { normalizeTags } from '@/lib/artifact-metadata';
import type { ArtifactSort, artifactTypes } from '@/lib/artifact-sorts';
import { artifactSorts } from '@/lib/artifact-sorts';

export type Db = BetterSQLite3Database;

export type ArtifactType = (typeof artifactTypes)[number];

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
 * otherwise archived artifacts are excluded. `deleted: true` lists only soft-deleted artifacts (the
 * trash); otherwise they're excluded.
 *
 * `withAnswers` opts into the answered counts, which cost a body fetch and a full markdown/spec
 * parse per row — only the gallery renders them, so every other caller (MCP `list_artifacts`, up to
 * 100 rows a call) leaves them off and gets `answers: null`.
 */
export interface ListArtifactsInput {
  query?: string;
  tags?: string[];
  type?: ArtifactType;
  archived?: boolean;
  deleted?: boolean;
  sort?: ArtifactSort;
  limit?: number;
  cursor?: string;
  withAnswers?: boolean;
}

/**
 * A `listArtifacts` row plus owner-response signals: when the artifact's interaction state last
 * changed (null if never touched), and how much of the latest version's body the saved state
 * answers — `null` where the count is unknown (not requested, body missing, or past
 * `maxAnswerScanBytes`).
 */
export type ArtifactListItem = Artifact & {
  stateUpdatedAt: number | null;
  answers: AnswerCount | null;
};

export interface ListArtifactsResult {
  items: ArtifactListItem[];
  nextCursor: string | null;
}

/**
 * Field-by-field, not a spread: selects carry extra columns (stateUpdatedAt, sortKey) that must not
 * leak into the artifact the caller — including MCP responses — sees.
 */
function toArtifact(row: typeof artifacts.$inferSelect): Artifact {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type as ArtifactType,
    tags: row.tags ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
    deletedAt: row.deletedAt,
  };
}

/**
 * Bodies past this are left uncounted: parsing is linear and a 1 MB body costs ~6 ms, which a
 * 20-row page would pay 20 times. The row reports `answers: null` — unknown, not "nothing to
 * answer" — and the gallery renders no marker for it.
 */
const maxAnswerScanBytes = 200_000;

function toArtifactListItem(
  row: typeof artifacts.$inferSelect & {
    stateUpdatedAt: number | null;
    state: Record<string, unknown> | null;
    body: string | null;
  },
): ArtifactListItem {
  const artifact = toArtifact(row);

  return {
    ...artifact,
    stateUpdatedAt: row.stateUpdatedAt,
    answers: row.body === null ? null : countAnswers(artifact.type, row.body, row.state),
  };
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
 * Title sort is case-insensitive (cheap via SQLite's `lower()`, which is ASCII-only); the cursor's
 * `k` is the value SQLite itself returned for the sort expression, so the cursor and the ORDER BY
 * can't disagree about collation.
 */
const sortSpecs: Record<ArtifactSort, { field: SortField; dir: 'asc' | 'desc' }> = {
  'updated-desc': { field: 'updatedAt', dir: 'desc' },
  'updated-asc': { field: 'updatedAt', dir: 'asc' },
  'created-desc': { field: 'createdAt', dir: 'desc' },
  'created-asc': { field: 'createdAt', dir: 'asc' },
  'title-asc': { field: 'title', dir: 'asc' },
  'title-desc': { field: 'title', dir: 'desc' },
};

function sortColumnExpr(field: SortField): SQL<number | string> {
  switch (field) {
    case 'updatedAt':
      return sql<number | string>`${artifacts.updatedAt}`;
    case 'createdAt':
      return sql<number | string>`${artifacts.createdAt}`;
    case 'title':
      return sql<number | string>`lower(${artifacts.title})`;
  }
}

interface Cursor {
  sort: ArtifactSort;
  k: number | string;
  id: string;
}

function encodeCursor(sort: ArtifactSort, row: { sortKey: number | string; id: string }): string {
  return Buffer.from(JSON.stringify({ sort, k: row.sortKey, id: row.id })).toString('base64url');
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

/** Inserts the artifact and its first body version in one transaction, minting version 1. */
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

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Inserts `body` as the next version number and bumps the artifact's `updatedAt`. */
function insertNextVersion(tx: Tx, artifactId: string, body: string, now: number): ArtifactVersion {
  const latest = tx
    .select({ version: artifactVersions.version })
    .from(artifactVersions)
    .where(eq(artifactVersions.artifactId, artifactId))
    .orderBy(desc(artifactVersions.version))
    .limit(1)
    .get();

  const version = tx
    .insert(artifactVersions)
    .values({
      id: nanoid(),
      artifactId,
      version: (latest?.version ?? 0) + 1,
      body,
      createdAt: now,
    })
    .returning()
    .get();

  tx.update(artifacts).set({ updatedAt: now }).where(eq(artifacts.id, artifactId)).run();

  return version;
}

/** Inserts the next version number and bumps the artifact's `updatedAt`, in one transaction. */
export function appendVersion(db: Db, artifactId: string, body: string): ArtifactVersion {
  const now = Date.now();

  return db.transaction((tx) => insertNextVersion(tx, artifactId, body, now));
}

/**
 * Copies an older version's body forward as a new latest version — history is append-only, so
 * nothing is rewritten or removed. The body is copied verbatim (it was validated when it was
 * stored, and an artifact's type can't change). Read and append share one transaction, so a
 * concurrent append can't land between them. Returns undefined when the artifact or that version
 * doesn't exist; like appendVersion, doesn't check `deletedAt`.
 */
export function revertToVersion(
  db: Db,
  artifactId: string,
  version: number,
): ArtifactVersion | undefined {
  const now = Date.now();

  return db.transaction((tx) => {
    const source = tx
      .select({ body: artifactVersions.body })
      .from(artifactVersions)
      .where(
        and(eq(artifactVersions.artifactId, artifactId), eq(artifactVersions.version, version)),
      )
      .get();

    if (!source) {
      return undefined;
    }

    return insertNextVersion(tx, artifactId, source.body, now);
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
 * Excludes soft-deleted artifacts unless `deleted` is set. `query` substring-matches the title;
 * `tags` matches ANY listed tag (OR).
 */
export function listArtifacts(db: Db, input: ListArtifactsInput = {}): ListArtifactsResult {
  const limit = input.limit ?? 20;
  const sort = input.sort ?? 'updated-desc';
  const { field, dir } = sortSpecs[sort];

  const conditions = [input.deleted ? isNotNull(artifacts.deletedAt) : isNull(artifacts.deletedAt)];

  // The trash is one flat view: an artifact archived before it was deleted must still be
  // recoverable, so the archived split applies to live listings only.
  if (!input.deleted) {
    conditions.push(
      input.archived ? isNotNull(artifacts.archivedAt) : isNull(artifacts.archivedAt),
    );
  }

  if (input.query) {
    conditions.push(sql`${artifacts.title} like ${`%${escapeLike(input.query)}%`} escape '\\'`);
  }

  if (input.type) {
    conditions.push(eq(artifacts.type, input.type));
  }

  if (input.tags && input.tags.length > 0) {
    // Element-wise via JSON1, not a substring match on the serialized column: a LIKE over the raw
    // JSON matches across element boundaries, so a crafted filter value can hit unrelated tags.
    const tagCondition = or(
      ...input.tags.map(
        (tag) =>
          sql`exists (select 1 from json_each(${artifacts.tags}) where json_each.value = ${tag})`,
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
    .select({
      ...getTableColumns(artifacts),
      stateUpdatedAt: artifactStates.updatedAt,
      state: artifactStates.state,
      // Latest version's body, for the answered count only — never returned to the caller, and not
      // fetched at all unless the caller asked for counts. The oversized case resolves to null in
      // SQL so a huge body is never even read off the page.
      body: input.withAnswers
        ? sql<string | null>`(
        select case
          when length(cast(${artifactVersions.body} as blob)) > ${maxAnswerScanBytes} then null
          else ${artifactVersions.body}
        end
        from ${artifactVersions}
        where ${artifactVersions.artifactId} = ${artifacts.id}
        order by ${artifactVersions.version} desc
        limit 1
      )`
        : sql<string | null>`null`,
      sortKey: sortColumnExpr(field),
    })
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
    nextCursor: hasMore && last ? encodeCursor(sort, last) : null,
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

export interface TagUsage {
  tag: string;
  count: number;
}

/**
 * Every tag with the number of artifacts carrying it, sorted alphabetically. Unlike `listTags` the
 * count spans archived and soft-deleted rows too, so it reports exactly what `renameTag`/
 * `removeTag` would touch.
 */
export function listTagsWithCounts(db: Db): TagUsage[] {
  const rows = db.select({ tags: artifacts.tags }).from(artifacts).all();
  const counts = new Map<string, number>();

  for (const row of rows) {
    for (const tag of row.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

/**
 * Rewrites the tag array of every artifact carrying `tag`, one row at a time inside a single
 * transaction — tags are a denormalized JSON column, so there's no tag table to update.
 *
 * Deliberately unfiltered by `deletedAt`/`archivedAt`: a soft-deleted artifact that's later
 * restored must not resurrect the old tag. `updatedAt` is left alone — a vocabulary fix isn't a
 * content change and shouldn't reshuffle sort order. Returns the number of rows rewritten.
 */
function rewriteTag(db: Db, tag: string, rewrite: (tags: string[]) => string[]): number {
  return db.transaction((tx) => {
    const rows = tx
      .select({ id: artifacts.id, tags: artifacts.tags })
      .from(artifacts)
      // Element-wise via JSON1, matching listArtifacts' tag filter: a LIKE over the serialized
      // column matches across element boundaries.
      .where(
        sql`exists (select 1 from json_each(${artifacts.tags}) where json_each.value = ${tag})`,
      )
      .all();

    for (const row of rows) {
      tx.update(artifacts)
        .set({ tags: normalizeTags(rewrite(row.tags ?? [])) })
        .where(eq(artifacts.id, row.id))
        .run();
    }

    return rows.length;
  });
}

/**
 * Renames `from` to `to` everywhere it appears. When `to` already exists on an artifact this is a
 * merge, not a duplicate — the rewritten array is normalized. Returns the affected row count (0
 * when nothing carried `from`, writing nothing).
 */
export function renameTag(db: Db, from: string, to: string): number {
  return rewriteTag(db, from, (tags) =>
    tags.map((existing) => (existing === from ? to : existing)),
  );
}

/** Drops `tag` from every artifact carrying it. Returns the affected row count. */
export function removeTag(db: Db, tag: string): number {
  return rewriteTag(db, tag, (tags) => tags.filter((existing) => existing !== tag));
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

/** Stamps `deletedAt`; no-ops on unknown ids. Version and state rows survive. */
export function softDeleteArtifact(db: Db, id: string): void {
  db.update(artifacts).set({ deletedAt: Date.now() }).where(eq(artifacts.id, id)).run();
}

/**
 * Clears `deletedAt`, undoing a soft delete. Leaves `archivedAt` and `updatedAt` alone, so an
 * artifact archived before it was deleted comes back archived. Returns undefined when `id` matches
 * no row.
 */
export function restoreArtifact(db: Db, id: string): Artifact | undefined {
  const artifact = db
    .update(artifacts)
    .set({ deletedAt: null })
    .where(eq(artifacts.id, id))
    .returning()
    .get();

  return artifact ? toArtifact(artifact) : undefined;
}

/**
 * Hard-deletes the artifact row; the `onDelete: cascade` foreign keys take its versions and
 * interaction state with it. Irreversible. Returns whether a row was removed.
 */
export function purgeArtifact(db: Db, id: string): boolean {
  return db.delete(artifacts).where(eq(artifacts.id, id)).run().changes > 0;
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
