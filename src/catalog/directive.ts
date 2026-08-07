/**
 * The acceptance test a `<!-- ::Name attr="v" -->` directive has to pass before it means anything:
 * the name resolves to a catalog component and the directive's flat string attributes parse against
 * that component's own props schema.
 *
 * Shared by the renderer (src/components/markdown/catalog-dispatch.tsx), which renders nothing when
 * it fails, and by the answered-count scan (src/lib/answer-count.ts) — otherwise a directive that
 * can never render (an unknown name, or a Choice/Checklist whose array props can't come from
 * strings) would still be counted as a question and pin the artifact at "awaiting your reply"
 * forever.
 *
 * React-free on purpose: answer-count is reached from the data layer (src/database/repository.ts).
 */

import type { z } from 'zod';

import { catalog } from '@/catalog/catalog';

/** Widened to an index signature so an arbitrary name from markdown can be looked up. */
const componentDefinitions = catalog.data.components as Record<
  string,
  { props: z.ZodType } | undefined
>;

/** The comment-component parser lowercases directive names; catalog names are PascalCase. */
const canonicalNames = new Map(
  Object.keys(catalog.data.components).map((name) => [name.toLowerCase(), name]),
);

export interface ResolvedDirective {
  /** The catalog's own spelling of the name, whatever casing the directive used. */
  name: string;
  /** Zod's output — never the raw attributes. */
  props: unknown;
}

/** `null` for an unknown component or attributes its schema rejects. */
export function resolveCatalogDirective(
  name: string | undefined,
  attributes: unknown,
): ResolvedDirective | null {
  const canonical = name ? canonicalNames.get(name.toLowerCase()) : undefined;
  const definition = canonical ? componentDefinitions[canonical] : undefined;

  if (!canonical || !definition) {
    return null;
  }

  const parsed = definition.props.safeParse(attributes);

  return parsed.success ? { name: canonical, props: parsed.data } : null;
}
