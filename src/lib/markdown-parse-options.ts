/**
 * Parse-side half of the markdown policy (the render-side half, and the reasoning behind both, live
 * in src/components/markdown/markdown-policy.tsx). It sits in its own dependency-free module
 * because the answered-count scan (src/lib/answer-count.ts) parses artifact bodies from the data
 * layer, which must not pull React component modules into its import graph.
 *
 * - `allowHtml` is never set: the parser only produces HTML nodes when it is true, and those are
 *   the only nodes the renderer feeds to `dangerouslySetInnerHTML`.
 * - `frontmatter: false` — a `---` line partway down an artifact body must stay a thematic break,
 *   not retroactively turn the top of the document into frontmatter.
 * - `headingIds: false` — ids generated from artifact-authored headings would collide with the
 *   app's own element ids.
 */
import type { ParseOptions } from '@tanstack/markdown';

export const markdownParseOptions: ParseOptions = { frontmatter: false, headingIds: false };
