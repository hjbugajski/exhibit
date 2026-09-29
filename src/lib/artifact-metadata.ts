import { z } from 'zod';

/**
 * Artifact metadata rules, shared by the UI server fns (src/lib/artifacts.ts) and the MCP tool
 * inputSchemas (src/lib/mcp/server.ts) so a bound can't drift between them.
 *
 * The fields carry shape only, never requiredness: the UI edit form submits a complete metadata
 * record while MCP `update_artifact` takes a partial patch, so each call site wraps these with
 * `.optional()` / `.nullable()` / `.describe()` as its own surface demands.
 */

export const titleField = z.string().min(1).max(200);
export const descriptionField = z.string().max(2000);
/** One tag; the bound is the same wherever a tag is written or renamed. */
export const tagField = z.string().max(50);
export const tagsField = z.array(tagField).max(20);

/** Message for every unknown/soft-deleted artifact reached through the UI server fns. */
const ARTIFACT_NOT_FOUND = 'Artifact not found. It may have been deleted.';

/**
 * Turns a missed repository lookup or mutation into the user-facing not-found error. Repository
 * mutations return undefined for unknown or soft-deleted ids, so passing their result here is the
 * whole liveness guard. Takes the result rather than `(db, id)` so this module stays free of the
 * database import chain.
 */
export function requireArtifact<T>(result: T | undefined | null): T {
  if (!result) {
    throw new Error(ARTIFACT_NOT_FOUND);
  }

  return result;
}
