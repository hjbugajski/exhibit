import type Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  appendVersion,
  createArtifact,
  getArtifact,
  getArtifactState,
  getLatestVersion,
  listArtifacts,
  listTags,
  listTagsWithCounts,
  listVersions,
  purgeArtifact,
  removeTag,
  renameTag,
  restoreArtifact,
  revertToVersion,
  setArtifactArchived,
  setArtifactState,
  softDeleteArtifact,
  updateMetadata,
} from '@/database/repository';
import type { ArtifactType, Db } from '@/database/repository';
import { artifacts } from '@/database/schemas/artifact';
import { artifactStates } from '@/database/schemas/artifact-state';
import { artifactVersions } from '@/database/schemas/artifact-version';
import { normalizeTags } from '@/lib/artifact-metadata';
import { artifactTypes } from '@/lib/artifact-sorts';
import { createTestDb } from '@testing/db';

let sqlite: Database.Database;
let db: Db;

beforeEach(() => {
  ({ db, sqlite } = createTestDb());
});

afterEach(() => {
  vi.restoreAllMocks();
  sqlite.close();
});

describe('createArtifact', () => {
  it('creates an artifact and version 1', () => {
    const { artifact, version } = createArtifact(db, {
      title: 'Widget',
      type: 'spec',
      tags: ['a', 'b'],
      body: 'hello',
    });

    expect(artifact.title).toBe('Widget');
    expect(artifact.type).toBe('spec');
    expect(artifact.tags).toEqual(['a', 'b']);
    expect(artifact.deletedAt).toBeNull();
    expect(version.version).toBe(1);
    expect(version.body).toBe('hello');
    expect(version.artifactId).toBe(artifact.id);
  });

  it('accepts every declared artifact type', () => {
    for (const type of artifactTypes) {
      const { artifact } = createArtifact(db, { title: `A ${type}`, type, body: 'body' });

      expect(artifact.type).toBe(type);
    }
  });

  it("rejects a type outside the schema's check constraint", () => {
    expect(() =>
      createArtifact(db, { title: 'Bogus', type: 'mdx' as ArtifactType, body: 'body' }),
    ).toThrow();
  });
});

describe('appendVersion', () => {
  it('increments version numbers', () => {
    const { artifact } = createArtifact(db, { title: 'Widget', type: 'html', body: 'v1' });

    const v2 = appendVersion(db, artifact.id, 'v2');
    const v3 = appendVersion(db, artifact.id, 'v3');

    expect(v2.version).toBe(2);
    expect(v3.version).toBe(3);

    const latest = getLatestVersion(db, artifact.id);

    expect(latest?.version).toBe(3);
    expect(latest?.body).toBe('v3');
  });

  it('enforces unique (artifact_id, version)', () => {
    const { artifact } = createArtifact(db, { title: 'Widget', type: 'html', body: 'v1' });

    expect(() => appendVersion(db, artifact.id, 'dup')).not.toThrow();

    // Directly forcing a duplicate version insert should fail the unique constraint.
    expect(() =>
      db
        .insert(artifactVersions)
        .values({ id: 'dup-id', artifactId: artifact.id, version: 2, body: 'dup', createdAt: 0 })
        .run(),
    ).toThrow();
  });
});

describe('revertToVersion', () => {
  it('copies an older version body forward as a new latest version, byte for byte', () => {
    const body = '{"root":"a","weird":"  <tab>\\t & \\u00e9 \\n"}';
    const { artifact } = createArtifact(db, { title: 'Widget', type: 'spec', body });

    appendVersion(db, artifact.id, '{"root":"b"}');

    const restored = revertToVersion(db, artifact.id, 1);

    expect(restored?.version).toBe(3);
    expect(restored?.body).toBe(body);
    expect(getLatestVersion(db, artifact.id)?.body).toBe(body);
    // Append-only: the older versions are still there, unchanged.
    expect(listVersions(db, artifact.id).map((v) => v.version)).toEqual([1, 2, 3]);
  });

  it("bumps the artifact's updatedAt", () => {
    vi.spyOn(Date, 'now').mockImplementation(() => 1000);
    const { artifact } = createArtifact(db, { title: 'Widget', type: 'html', body: 'v1' });

    vi.spyOn(Date, 'now').mockImplementation(() => 2000);
    appendVersion(db, artifact.id, 'v2');

    vi.spyOn(Date, 'now').mockImplementation(() => 3000);
    revertToVersion(db, artifact.id, 1);

    expect(getArtifact(db, artifact.id)?.artifact.updatedAt).toBe(3000);
  });

  it('appends a copy when the requested version is already the latest', () => {
    const { artifact } = createArtifact(db, { title: 'Widget', type: 'html', body: 'v1' });

    expect(revertToVersion(db, artifact.id, 1)).toMatchObject({ version: 2, body: 'v1' });
  });

  it('returns undefined for a version the artifact does not have', () => {
    const { artifact } = createArtifact(db, { title: 'Widget', type: 'html', body: 'v1' });

    expect(revertToVersion(db, artifact.id, 7)).toBeUndefined();
    expect(listVersions(db, artifact.id)).toHaveLength(1);
  });

  it('returns undefined for an unknown artifact', () => {
    expect(revertToVersion(db, 'nope', 1)).toBeUndefined();
  });
});

describe('listVersions', () => {
  it('lists all versions ascending with their creation timestamps', () => {
    vi.spyOn(Date, 'now').mockImplementation(() => 1000);
    const { artifact } = createArtifact(db, { title: 'Widget', type: 'spec', body: 'v1' });

    vi.spyOn(Date, 'now').mockImplementation(() => 2000);
    appendVersion(db, artifact.id, 'v2');
    vi.spyOn(Date, 'now').mockImplementation(() => 3000);
    appendVersion(db, artifact.id, 'v3');

    expect(listVersions(db, artifact.id)).toEqual([
      { version: 1, createdAt: 1000 },
      { version: 2, createdAt: 2000 },
      { version: 3, createdAt: 3000 },
    ]);
  });
});

describe('updateMetadata', () => {
  it('updates title, description, and tags', () => {
    const { artifact } = createArtifact(db, { title: 'Old', type: 'spec', body: 'v1' });

    const updated = updateMetadata(db, artifact.id, {
      title: 'New',
      description: 'desc',
      tags: ['x'],
    });

    expect(updated?.title).toBe('New');
    expect(updated?.description).toBe('desc');
    expect(updated?.tags).toEqual(['x']);
  });
});

describe('getArtifact', () => {
  it('fetches latest version by default', () => {
    const { artifact } = createArtifact(db, { title: 'Widget', type: 'spec', body: 'v1' });

    appendVersion(db, artifact.id, 'v2');

    const result = getArtifact(db, artifact.id);

    expect(result?.version.version).toBe(2);
    expect(result?.version.body).toBe('v2');
  });

  it('fetches a specific version', () => {
    const { artifact } = createArtifact(db, { title: 'Widget', type: 'spec', body: 'v1' });

    appendVersion(db, artifact.id, 'v2');

    const result = getArtifact(db, artifact.id, 1);

    expect(result?.version.version).toBe(1);
    expect(result?.version.body).toBe('v1');
  });

  it('excludes soft-deleted artifacts', () => {
    const { artifact } = createArtifact(db, { title: 'Widget', type: 'spec', body: 'v1' });

    softDeleteArtifact(db, artifact.id);

    expect(getArtifact(db, artifact.id)).toBeUndefined();
  });
});

describe('listArtifacts', () => {
  it('lists newest-first and paginates by cursor', () => {
    let now = 1000;

    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const ids = ['a', 'b', 'c'].map((title) => {
      const { artifact } = createArtifact(db, { title, type: 'spec', body: 'v1' });

      now += 1000;

      return artifact;
    });

    const page1 = listArtifacts(db, { limit: 2 });

    expect(page1.items).toHaveLength(2);
    expect(page1.items.map((a) => a.id)).toEqual([ids[2]?.id, ids[1]?.id]);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = listArtifacts(db, { limit: 2, cursor: page1.nextCursor ?? undefined });

    expect(page2.items.map((a) => a.id)).toEqual([ids[0]?.id]);
    expect(page2.nextCursor).toBeNull();
  });

  it('filters by type, tags, and query', () => {
    createArtifact(db, { title: 'Alpha', type: 'spec', tags: ['red'], body: 'v1' });
    createArtifact(db, { title: 'Beta', type: 'html', tags: ['blue'], body: 'v1' });
    createArtifact(db, { title: 'Alphabet', type: 'spec', tags: ['red', 'blue'], body: 'v1' });
    createArtifact(db, { title: 'Gamma', type: 'markdown', tags: ['blue'], body: '# hi' });

    expect(listArtifacts(db, { type: 'html' }).items).toHaveLength(1);
    expect(listArtifacts(db, { type: 'markdown' }).items.map((a) => a.title)).toEqual(['Gamma']);
    expect(listArtifacts(db, { tags: ['blue'] }).items).toHaveLength(3);
    expect(listArtifacts(db, { query: 'Alpha' }).items).toHaveLength(2);
    expect(listArtifacts(db, { query: 'Alpha', type: 'spec', tags: ['red'] }).items).toHaveLength(
      2,
    );
  });

  it('treats a literal % in query as a literal character, not a wildcard', () => {
    createArtifact(db, { title: '100% Done', type: 'spec', body: 'v1' });
    createArtifact(db, { title: '100X Done', type: 'spec', body: 'v1' });

    const result = listArtifacts(db, { query: '100%' });

    expect(result.items.map((item) => item.title)).toEqual(['100% Done']);
  });

  it('treats a literal % in a tag filter as a literal character, not a wildcard', () => {
    createArtifact(db, { title: 'Percent', type: 'spec', tags: ['100%'], body: 'v1' });
    createArtifact(db, { title: 'NotPercent', type: 'spec', tags: ['100X'], body: 'v1' });

    const result = listArtifacts(db, { tags: ['100%'] });

    expect(result.items.map((item) => item.title)).toEqual(['Percent']);
  });

  it('matches tags element-wise, not as a substring of the serialized JSON', () => {
    createArtifact(db, { title: 'Two tags', type: 'spec', tags: ['a', 'b'], body: 'v1' });

    // The serialized column is `["a","b"]`, so a substring match on `a","b` would hit it — the
    // filter has to compare whole array elements.
    expect(listArtifacts(db, { tags: ['a","b'] }).items).toHaveLength(0);
    expect(listArtifacts(db, { tags: ['a'] }).items).toHaveLength(1);
  });

  it('filters by a tag that needed quote-stripping to be storable', () => {
    const tags = normalizeTags(['re"d']);

    createArtifact(db, { title: 'Quoted', type: 'spec', tags, body: 'v1' });
    createArtifact(db, { title: 'Other', type: 'spec', tags: ['blue'], body: 'v1' });

    expect(tags).toEqual(['red']);
    expect(listArtifacts(db, { tags }).items.map((item) => item.title)).toEqual(['Quoted']);
  });

  it('matches artifacts with ANY of the selected tags (OR semantics)', () => {
    const red = createArtifact(db, {
      title: 'Red',
      type: 'spec',
      tags: ['red'],
      body: 'v1',
    }).artifact;
    const blue = createArtifact(db, {
      title: 'Blue',
      type: 'spec',
      tags: ['blue'],
      body: 'v1',
    }).artifact;
    createArtifact(db, { title: 'Green', type: 'spec', tags: ['green'], body: 'v1' });

    const result = listArtifacts(db, { tags: ['red', 'blue'] });

    expect(new Set(result.items.map((item) => item.id))).toEqual(new Set([red.id, blue.id]));
  });

  it('excludes soft-deleted artifacts', () => {
    const { artifact } = createArtifact(db, { title: 'Widget', type: 'spec', body: 'v1' });

    softDeleteArtifact(db, artifact.id);

    expect(listArtifacts(db).items).toHaveLength(0);
  });

  it('excludes archived artifacts by default and lists only them with archived: true', () => {
    const { artifact: archived } = createArtifact(db, { title: 'Old', type: 'spec', body: 'v1' });
    const { artifact: active } = createArtifact(db, { title: 'New', type: 'spec', body: 'v1' });

    setArtifactArchived(db, archived.id, true);

    expect(listArtifacts(db).items.map((item) => item.id)).toEqual([active.id]);
    expect(listArtifacts(db, { archived: true }).items.map((item) => item.id)).toEqual([
      archived.id,
    ]);
  });

  it('sorts by updated-asc', () => {
    let now = 1000;

    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const ids = ['a', 'b', 'c'].map((title) => {
      const { artifact } = createArtifact(db, { title, type: 'spec', body: 'v1' });

      now += 1000;

      return artifact.id;
    });

    expect(listArtifacts(db, { sort: 'updated-asc' }).items.map((item) => item.id)).toEqual(ids);
  });

  it('sorts by created-desc and created-asc', () => {
    let now = 1000;

    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const ids = ['a', 'b', 'c'].map((title) => {
      const { artifact } = createArtifact(db, { title, type: 'spec', body: 'v1' });

      now += 1000;

      return artifact.id;
    });

    expect(listArtifacts(db, { sort: 'created-desc' }).items.map((item) => item.id)).toEqual(
      [...ids].reverse(),
    );
    expect(listArtifacts(db, { sort: 'created-asc' }).items.map((item) => item.id)).toEqual(ids);
  });

  it('sorts by title case-insensitively, ascending and descending', () => {
    createArtifact(db, { title: 'banana', type: 'spec', body: 'v1' });
    createArtifact(db, { title: 'Apple', type: 'spec', body: 'v1' });
    createArtifact(db, { title: 'cherry', type: 'spec', body: 'v1' });

    expect(listArtifacts(db, { sort: 'title-asc' }).items.map((item) => item.title)).toEqual([
      'Apple',
      'banana',
      'cherry',
    ]);
    expect(listArtifacts(db, { sort: 'title-desc' }).items.map((item) => item.title)).toEqual([
      'cherry',
      'banana',
      'Apple',
    ]);
  });

  it('paginates by cursor across a page boundary for updated-desc', () => {
    let now = 1000;

    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const ids = ['a', 'b', 'c', 'd'].map((title) => {
      const { artifact } = createArtifact(db, { title, type: 'spec', body: 'v1' });

      now += 1000;

      return artifact.id;
    });

    const page1 = listArtifacts(db, { sort: 'updated-desc', limit: 2 });

    expect(page1.items.map((item) => item.id)).toEqual([ids[3], ids[2]]);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = listArtifacts(db, {
      sort: 'updated-desc',
      limit: 2,
      cursor: page1.nextCursor ?? undefined,
    });

    expect(page2.items.map((item) => item.id)).toEqual([ids[1], ids[0]]);
    expect(page2.nextCursor).toBeNull();
  });

  it('paginates by cursor across a page boundary for title-asc', () => {
    ['banana', 'apple', 'cherry', 'date'].forEach((title) => {
      createArtifact(db, { title, type: 'spec', body: 'v1' });
    });

    const page1 = listArtifacts(db, { sort: 'title-asc', limit: 2 });

    expect(page1.items.map((item) => item.title)).toEqual(['apple', 'banana']);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = listArtifacts(db, {
      sort: 'title-asc',
      limit: 2,
      cursor: page1.nextCursor ?? undefined,
    });

    expect(page2.items.map((item) => item.title)).toEqual(['cherry', 'date']);
    expect(page2.nextCursor).toBeNull();
  });

  it('paginates past a non-ASCII title boundary for title-asc', () => {
    // SQLite's lower() is ASCII-only, so 'Ápple' sorts after 'Zoo'. Deriving the cursor key in JS
    // instead (toLowerCase() lowercases 'Á') put it after 'Élan' too, and page 2 came back empty.
    ['Alpha', 'Zoo', 'Ápple', 'Élan'].forEach((title) => {
      createArtifact(db, { title, type: 'spec', body: 'v1' });
    });

    const page1 = listArtifacts(db, { sort: 'title-asc', limit: 3 });

    expect(page1.items.map((item) => item.title)).toEqual(['Alpha', 'Zoo', 'Ápple']);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = listArtifacts(db, {
      sort: 'title-asc',
      limit: 3,
      cursor: page1.nextCursor ?? undefined,
    });

    expect(page2.items.map((item) => item.title)).toEqual(['Élan']);
  });

  it('ignores a cursor whose sort does not match the requested sort', () => {
    let now = 1000;

    vi.spyOn(Date, 'now').mockImplementation(() => now);

    ['a', 'b', 'c'].forEach((title) => {
      createArtifact(db, { title, type: 'spec', body: 'v1' });
      now += 1000;
    });

    const updatedPage = listArtifacts(db, { sort: 'updated-desc', limit: 1 });

    // A cursor minted for updated-desc, replayed against title-asc, should be treated as a first
    // page rather than applied to the wrong sort order.
    const result = listArtifacts(db, {
      sort: 'title-asc',
      limit: 1,
      cursor: updatedPage.nextCursor ?? undefined,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.title).toBe('a');
  });

  it('uses the deletedAt/updatedAt/id index for the default sort', () => {
    const plan = sqlite
      .prepare(
        `EXPLAIN QUERY PLAN SELECT * FROM artifacts WHERE deleted_at IS NULL ORDER BY updated_at DESC, id DESC LIMIT 21`,
      )
      .all() as { detail: string }[];

    const detail = plan.map((row) => row.detail).join('\n');

    expect(detail).not.toContain('SCAN');
    expect(detail).toContain('artifact_deletedAt_updatedAt_id_idx');
  });

  it('carries stateUpdatedAt per item: null until interacted, then the state timestamp', () => {
    const { artifact: touched } = createArtifact(db, {
      title: 'Touched',
      type: 'spec',
      body: 'v1',
    });
    createArtifact(db, { title: 'Untouched', type: 'spec', body: 'v1' });

    vi.spyOn(Date, 'now').mockImplementation(() => 5000);
    setArtifactState(db, touched.id, { done: true });

    const items = listArtifacts(db).items;

    expect(items.find((item) => item.id === touched.id)?.stateUpdatedAt).toBe(5000);
    expect(items.find((item) => item.title === 'Untouched')?.stateUpdatedAt).toBeNull();
  });
});

describe('setArtifactArchived', () => {
  it('round-trips archive and unarchive without touching updatedAt', () => {
    vi.spyOn(Date, 'now').mockImplementation(() => 1000);
    const { artifact } = createArtifact(db, { title: 'Widget', type: 'spec', body: 'v1' });

    vi.spyOn(Date, 'now').mockImplementation(() => 2000);
    const archived = setArtifactArchived(db, artifact.id, true);

    expect(archived?.archivedAt).toBe(2000);
    expect(archived?.updatedAt).toBe(1000);

    const unarchived = setArtifactArchived(db, artifact.id, false);

    expect(unarchived?.archivedAt).toBeNull();
    expect(listArtifacts(db).items.map((item) => item.id)).toEqual([artifact.id]);
  });

  it('returns undefined for an unknown id', () => {
    expect(setArtifactArchived(db, 'missing', true)).toBeUndefined();
  });

  it('does not affect getArtifact — archived artifacts still resolve', () => {
    const { artifact } = createArtifact(db, { title: 'Widget', type: 'spec', body: 'v1' });

    setArtifactArchived(db, artifact.id, true);

    expect(getArtifact(db, artifact.id)?.artifact.archivedAt).not.toBeNull();
  });
});

describe('restoreArtifact', () => {
  it('moves an artifact into the trash listing and back out again', () => {
    const { artifact } = createArtifact(db, { title: 'Widget', type: 'spec', body: 'v1' });

    softDeleteArtifact(db, artifact.id);

    expect(listArtifacts(db).items).toHaveLength(0);
    expect(listArtifacts(db, { deleted: true }).items.map((item) => item.id)).toEqual([
      artifact.id,
    ]);

    expect(restoreArtifact(db, artifact.id)?.deletedAt).toBeNull();

    expect(listArtifacts(db, { deleted: true }).items).toHaveLength(0);
    expect(listArtifacts(db).items.map((item) => item.id)).toEqual([artifact.id]);
  });

  it('preserves archived state, so an archived artifact restores as archived', () => {
    const { artifact } = createArtifact(db, { title: 'Widget', type: 'spec', body: 'v1' });

    setArtifactArchived(db, artifact.id, true);
    softDeleteArtifact(db, artifact.id);

    // Archived artifacts are still trash: the deleted listing ignores the archived split.
    expect(listArtifacts(db, { deleted: true }).items.map((item) => item.id)).toEqual([
      artifact.id,
    ]);

    expect(restoreArtifact(db, artifact.id)?.archivedAt).not.toBeNull();
    expect(listArtifacts(db).items).toHaveLength(0);
    expect(listArtifacts(db, { archived: true }).items.map((item) => item.id)).toEqual([
      artifact.id,
    ]);
  });

  it('returns undefined for an unknown id', () => {
    expect(restoreArtifact(db, 'missing')).toBeUndefined();
  });
});

describe('purgeArtifact', () => {
  it('hard-deletes the artifact and cascades to its versions and state', () => {
    const { artifact } = createArtifact(db, { title: 'Widget', type: 'spec', body: 'v1' });
    const { artifact: survivor } = createArtifact(db, { title: 'Other', type: 'spec', body: 'v1' });

    appendVersion(db, artifact.id, 'v2');
    setArtifactState(db, artifact.id, { checked: true });
    setArtifactState(db, survivor.id, { checked: false });
    softDeleteArtifact(db, artifact.id);

    expect(purgeArtifact(db, artifact.id)).toBe(true);

    expect(listArtifacts(db, { deleted: true }).items).toHaveLength(0);
    expect(getArtifact(db, artifact.id)).toBeUndefined();
    expect(
      db.select().from(artifactVersions).where(eq(artifactVersions.artifactId, artifact.id)).all(),
    ).toEqual([]);
    expect(
      db.select().from(artifactStates).where(eq(artifactStates.artifactId, artifact.id)).all(),
    ).toEqual([]);

    expect(getArtifactState(db, survivor.id)?.state).toEqual({ checked: false });
    expect(listVersions(db, survivor.id)).toHaveLength(1);
  });

  it('returns false for an unknown id', () => {
    expect(purgeArtifact(db, 'missing')).toBe(false);
  });
});

describe('listTags', () => {
  it('returns distinct tags across non-deleted artifacts, sorted alphabetically', () => {
    createArtifact(db, { title: 'A', type: 'spec', tags: ['zebra', 'apple'], body: 'v1' });
    createArtifact(db, { title: 'B', type: 'spec', tags: ['apple', 'mango'], body: 'v1' });
    const { artifact: deleted } = createArtifact(db, {
      title: 'C',
      type: 'spec',
      tags: ['deleted-only'],
      body: 'v1',
    });

    softDeleteArtifact(db, deleted.id);

    expect(listTags(db)).toEqual(['apple', 'mango', 'zebra']);
  });
});

describe('listTagsWithCounts', () => {
  it('counts every artifact carrying the tag, archived and deleted included', () => {
    createArtifact(db, { title: 'A', type: 'spec', tags: ['zebra', 'apple'], body: 'v1' });
    const { artifact: archived } = createArtifact(db, {
      title: 'B',
      type: 'spec',
      tags: ['apple'],
      body: 'v1',
    });
    const { artifact: deleted } = createArtifact(db, {
      title: 'C',
      type: 'spec',
      tags: ['apple', 'gone'],
      body: 'v1',
    });

    setArtifactArchived(db, archived.id, true);
    softDeleteArtifact(db, deleted.id);

    expect(listTagsWithCounts(db)).toEqual([
      { tag: 'apple', count: 3 },
      { tag: 'gone', count: 1 },
      { tag: 'zebra', count: 1 },
    ]);
  });

  it('returns an empty list when nothing is tagged', () => {
    createArtifact(db, { title: 'A', type: 'spec', body: 'v1' });

    expect(listTagsWithCounts(db)).toEqual([]);
  });
});

describe('renameTag / removeTag', () => {
  function tagsOf(id: string): string[] | null | undefined {
    return db.select({ tags: artifacts.tags }).from(artifacts).where(eq(artifacts.id, id)).get()
      ?.tags;
  }

  it('renames a tag across every artifact carrying it', () => {
    const { artifact: a } = createArtifact(db, {
      title: 'A',
      type: 'spec',
      tags: ['trips', 'food'],
      body: 'v1',
    });
    const { artifact: b } = createArtifact(db, {
      title: 'B',
      type: 'spec',
      tags: ['trips'],
      body: 'v1',
    });
    const { artifact: c } = createArtifact(db, {
      title: 'C',
      type: 'spec',
      tags: ['food'],
      body: 'v1',
    });

    expect(renameTag(db, 'trips', 'travel')).toBe(2);

    expect(tagsOf(a.id)).toEqual(['travel', 'food']);
    expect(tagsOf(b.id)).toEqual(['travel']);
    expect(tagsOf(c.id)).toEqual(['food']);
    expect(listTags(db)).toEqual(['food', 'travel']);
  });

  it('merges rather than duplicating when the target tag already exists', () => {
    const { artifact } = createArtifact(db, {
      title: 'A',
      type: 'spec',
      tags: ['travel', 'trips', 'food'],
      body: 'v1',
    });

    expect(renameTag(db, 'trips', 'travel')).toBe(1);

    expect(tagsOf(artifact.id)).toEqual(['travel', 'food']);
    expect(listTags(db)).toEqual(['food', 'travel']);
  });

  it('removes a tag across every artifact carrying it', () => {
    const { artifact: a } = createArtifact(db, {
      title: 'A',
      type: 'spec',
      tags: ['draft', 'food'],
      body: 'v1',
    });
    const { artifact: b } = createArtifact(db, {
      title: 'B',
      type: 'spec',
      tags: ['draft'],
      body: 'v1',
    });

    expect(removeTag(db, 'draft')).toBe(2);

    expect(tagsOf(a.id)).toEqual(['food']);
    expect(tagsOf(b.id)).toEqual([]);
    expect(listTags(db)).toEqual(['food']);
  });

  it('rewrites soft-deleted and archived artifacts, so a restore cannot resurrect the old tag', () => {
    const { artifact: deleted } = createArtifact(db, {
      title: 'Deleted',
      type: 'spec',
      tags: ['trips'],
      body: 'v1',
    });
    const { artifact: archived } = createArtifact(db, {
      title: 'Archived',
      type: 'spec',
      tags: ['trips'],
      body: 'v1',
    });

    softDeleteArtifact(db, deleted.id);
    setArtifactArchived(db, archived.id, true);

    expect(renameTag(db, 'trips', 'travel')).toBe(2);

    expect(tagsOf(deleted.id)).toEqual(['travel']);
    expect(tagsOf(archived.id)).toEqual(['travel']);

    restoreArtifact(db, deleted.id);
    expect(listTags(db)).toEqual(['travel']);
  });

  it('leaves updatedAt untouched — a vocabulary fix is not a content change', () => {
    const { artifact } = createArtifact(db, {
      title: 'A',
      type: 'spec',
      tags: ['trips'],
      body: 'v1',
    });

    renameTag(db, 'trips', 'travel');
    expect(getArtifact(db, artifact.id)?.artifact.updatedAt).toBe(artifact.updatedAt);

    removeTag(db, 'travel');
    expect(getArtifact(db, artifact.id)?.artifact.updatedAt).toBe(artifact.updatedAt);
  });

  it('reports 0 affected and writes nothing for a tag nothing carries', () => {
    const { artifact } = createArtifact(db, {
      title: 'A',
      type: 'spec',
      tags: ['food'],
      body: 'v1',
    });

    expect(renameTag(db, 'trips', 'travel')).toBe(0);
    expect(removeTag(db, 'trips')).toBe(0);

    expect(tagsOf(artifact.id)).toEqual(['food']);
    expect(listTags(db)).toEqual(['food']);
  });
});

describe('artifact state', () => {
  it('returns null before any state is saved', () => {
    const { artifact } = createArtifact(db, { title: 'A', type: 'spec', body: '{}' });

    expect(getArtifactState(db, artifact.id)).toBeNull();
  });

  it('round-trips and upserts state per artifact, tracking when it last changed', () => {
    const { artifact } = createArtifact(db, { title: 'A', type: 'spec', body: '{}' });

    let now = 1000;

    vi.spyOn(Date, 'now').mockImplementation(() => now);

    setArtifactState(db, artifact.id, { tasks: { 'order-cabinets': true } });
    expect(getArtifactState(db, artifact.id)).toEqual({
      state: { tasks: { 'order-cabinets': true } },
      updatedAt: now,
    });

    now = 2000;
    setArtifactState(db, artifact.id, { tasks: { 'order-cabinets': false, demo: true } });
    expect(getArtifactState(db, artifact.id)).toEqual({
      state: { tasks: { 'order-cabinets': false, demo: true } },
      updatedAt: now,
    });
  });
});
