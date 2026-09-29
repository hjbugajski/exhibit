/**
 * The acceptance test an ```exhibit fence has to pass before it means anything: its JSON parses to
 * an object with a string `type`, and the one-element spec built from it passes the same catalog
 * validator the publish tools use.
 *
 * Shared by the renderer (src/components/markdown/catalog-dispatch.tsx), which shows an error block
 * when it fails, and by the answered-count scan (src/lib/answer-count.ts) — otherwise a fence that
 * can never render would still be counted as a question and pin the artifact at "awaiting your
 * reply" forever.
 *
 * React-free on purpose: answer-count is reached from the data layer (src/database/repository.ts).
 */

import { validateArtifactSpec, type ArtifactValidationResult } from '@/catalog/validate';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

/** `null` when the JSON is not an object with a string `type`. */
export function resolveExhibitFence(json: string): ArtifactValidationResult | null {
  const parsed = parseJson(json);

  if (!isRecord(parsed) || typeof parsed.type !== 'string') {
    return null;
  }

  return validateArtifactSpec({
    root: 'exhibit',
    elements: { exhibit: { type: parsed.type, props: parsed.props ?? {}, children: [] } },
  });
}
