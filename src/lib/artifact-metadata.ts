import { z } from 'zod';

/**
 * Artifact metadata rules, shared by the UI server fns (src/lib/artifacts.ts) and the MCP tool
 * inputSchemas (src/lib/mcp/server.ts) so a bound can't drift between them.
 *
 * The fields carry shape only, never requiredness: the UI edit form submits a complete metadata
 * record while MCP `update_artifact` takes a partial patch, so each call site wraps these with
 * `.optional()` / `.nullable()` / `.describe()` as its own surface demands.
 *
 * Nothing here may import the database or any server-only module — src/components/artifacts
 * imports `normalizeTags` into the client bundle.
 */

export const titleField = z.string().min(1).max(200);
export const descriptionField = z.string().max(2000);
/** One tag; the bound is the same wherever a tag is written or renamed. */
export const tagField = z.string().max(50);
export const tagsField = z.array(tagField).max(20);

/** Message for every unknown/soft-deleted artifact reached through the UI server fns. */
const ARTIFACT_NOT_FOUND = 'Artifact not found. It may have been deleted.';

/**
 * Trims, drops empties, and dedupes a tag list, preserving first-seen order. Double quotes are
 * stripped rather than rejected: they have no legitimate use in a tag, and MCP callers shouldn't
 * get an error for one.
 */
export function normalizeTags(tags?: string[]): string[] {
  if (!tags) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    const trimmed = tag.replaceAll('"', '').trim();

    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

/**
 * Asserts a repository lookup or mutation actually hit a live artifact. Takes the fetched value
 * rather than `(db, id)` so this module stays free of the database import chain, and so it also
 * covers the post-mutation guards (`updateMetadata`/`setArtifactArchived` return undefined for an
 * id that vanished between the pre-check and the write).
 */
export function requireArtifact<T>(result: T | undefined | null): T {
  if (!result) {
    throw new Error(ARTIFACT_NOT_FOUND);
  }

  return result;
}
