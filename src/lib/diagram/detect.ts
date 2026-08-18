/*
 * Family detection from the header line. Comments and blank lines are stripped first, and a leading
 * `%%{…}%%` init directive is stepped over, so a source that opens with `%% notes` or with the
 * `%%{init: …}%%` block mermaid documents still detects. The directive is only skipped for choosing
 * the header — it stays in the line list so the family parser still reports it as unsupported rather
 * than silently honouring it. YAML frontmatter is deliberately not handled: the graph families have
 * nowhere to put its `title`, so a frontmatter source fails detection and degrades to its source.
 */

import { readLines, splitHeader } from './core/lex/lines.ts';
import { builtinFamilies } from './family.ts';
import type { DiagramFamily } from './types.ts';

/** First statement that is not an init directive — what every family's `detect` receives. */
export function readHeader(source: string): string {
  return splitHeader(readLines(source)).header?.text ?? '';
}

/**
 * Mermaid families this library recognizes but does not draw. Naming the family is the whole point:
 * "Mind maps aren't supported yet" tells Claude to pick another shape, where "no diagram type
 * recognized" sends it to fix a header that was already correct.
 *
 * A `Map`, not an object literal: the key is an arbitrary word off the source's first line, and an
 * object would answer `constructor` or `__proto__` with something off `Object.prototype`.
 */
const DEFERRED_FAMILIES = new Map<string, string>([
  ['journey', 'User-journey diagrams'],
  ['gitgraph', 'Git graphs'],
  ['mindmap', 'Mind maps'],
  ['timeline', 'Timelines'],
  ['quadrantchart', 'Quadrant charts'],
  ['requirementdiagram', 'Requirement diagrams'],
  ['c4context', 'C4 diagrams'],
  ['sankey-beta', 'Sankey diagrams'],
  ['xychart-beta', 'XY charts'],
  ['block-beta', 'Block diagrams'],
]);

/** Plural name of the deferred family a header asks for, or null when nothing recognizes it. */
export function deferredFamily(source: string): string | null {
  const word =
    readHeader(source)
      .split(/[\s{:]/)[0]
      ?.toLowerCase() ?? '';

  return DEFERRED_FAMILIES.get(word) ?? null;
}

export function detectFamily(
  source: string,
  families: readonly DiagramFamily[] = builtinFamilies,
): string | null {
  const header = readHeader(source);

  if (!header) {
    return null;
  }

  return families.find((family) => family.detect(header))?.id ?? null;
}
