/**
 * Server-usable validation for artifact specs. Used by the MCP publish tools
 * (src/lib/mcp/server.ts) as their structured error contract, and by tests/fixtures here.
 *
 * Merges two layers from @json-render/core: catalog.validate(spec), a Zod parse against the
 * catalog's generated schema (root/elements/children shape, unknown component names), and
 * validateSpec(spec), which catches AI-generation mistakes a type-level schema can't (dangling
 * child refs, misplaced `visible`/`on`/etc, orphaned elements). Two workarounds for
 * @json-render/react's bundled schema live at their sites: the per-element props re-parse in
 * validateArtifactSpec and `withVisiblePadding`.
 */

import type { Spec } from '@json-render/core';
import { validateSpec } from '@json-render/core';
import type { z } from 'zod';

import { catalog } from '@/catalog/catalog';

/**
 * Catalog components are typed as a fixed-key object; widen to an index signature so we can look up
 * a component definition by an arbitrary (possibly-invalid) `type` string pulled from untrusted
 * input.
 */
const components = catalog.data.components as Record<string, { props: z.ZodType } | undefined>;

export interface ArtifactSpecError {
  /** Element key the error is attached to, or null for spec-level errors. */
  element: string | null;
  /**
   * Component type declared on that element (even if not a known catalog component — see the
   * `elementType` helper below), or null when there's no associated element.
   */
  component: string | null;
  /** Dot-separated path to the offending field. */
  path: string;
  message: string;
}

export type ArtifactValidationResult =
  | { valid: true; spec: Spec }
  | { valid: false; errors: ArtifactSpecError[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Best-effort read of `spec.elements` without throwing on garbage input. */
function readElements(spec: unknown): Record<string, unknown> | null {
  if (!isRecord(spec) || !isRecord(spec.elements)) {
    return null;
  }

  return spec.elements;
}

function elementType(elements: Record<string, unknown> | null, key: string): string | null {
  const element = elements?.[key];

  return isRecord(element) && typeof element.type === 'string' ? element.type : null;
}

function formatPath(path: ReadonlyArray<PropertyKey>): string {
  return path.map(String).join('.');
}

/**
 * Recursively collects every string value found under a key literally named "statePath" inside an
 * element's props (including nested arrays, e.g. Checklist items), tagged with the owning element
 * key. Walking by key name rather than hardcoding component types catches every current and future
 * statePath-bearing field in one place.
 */
function collectStatePaths(elementKey: string, value: unknown): { key: string; path: string }[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStatePaths(elementKey, item));
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nested]) => {
    if (key === 'statePath' && typeof nested === 'string') {
      return [{ key: elementKey, path: nested }];
    }

    return collectStatePaths(elementKey, nested);
  });
}

/**
 * Two interactive elements writing to the same statePath silently share state — flag every
 * statePath value used by more than one element.
 */
function findDuplicateStatePathErrors(elements: Record<string, unknown>): ArtifactSpecError[] {
  const usedBy = new Map<string, string[]>();

  for (const [key, element] of Object.entries(elements)) {
    if (!isRecord(element)) {
      continue;
    }

    for (const { path } of collectStatePaths(key, element.props)) {
      usedBy.set(path, [...(usedBy.get(path) ?? []), key]);
    }
  }

  const errors: ArtifactSpecError[] = [];

  for (const [path, keys] of usedBy) {
    if (keys.length < 2) {
      continue;
    }

    const first = keys[0] ?? null;

    errors.push({
      element: first,
      component: first ? elementType(elements, first) : null,
      path: 'statePath',
      message: `statePath "${path}" is used by ${keys.length} elements (${keys.join(', ')}); they will silently share state — each interactive element needs a unique statePath.`,
    });
  }

  return errors;
}

/**
 * Tabs pairs `children[i]` with `items[i]` positionally; a mismatched count leaves a tab with no
 * content or a child with no tab.
 */
function findTabsChildCountMismatchErrors(elements: Record<string, unknown>): ArtifactSpecError[] {
  const errors: ArtifactSpecError[] = [];

  for (const [key, element] of Object.entries(elements)) {
    if (elementType(elements, key) !== 'Tabs' || !isRecord(element) || !isRecord(element.props)) {
      continue;
    }

    const items = element.props.items;
    const children = element.children;

    if (!Array.isArray(items) || !Array.isArray(children)) {
      continue;
    }

    if (items.length !== children.length) {
      errors.push({
        element: key,
        component: 'Tabs',
        path: `elements.${key}.props.items`,
        message: `Tabs has ${items.length} item(s) but ${children.length} child(ren); items and children must match one-to-one.`,
      });
    }
  }

  return errors;
}

/**
 * Pads a `visible: undefined` key onto elements missing it, for the Zod pass only — the structural
 * pass and the returned `spec` use the original input.
 *
 * Workaround for @json-render/react's bundled element schema, which declares `visible: s.any()`
 * without `.optional()`. Under Zod 4 a non-optional field requires the key to be *present* (even
 * set to `undefined`), and real specs (including the library's own prompt examples) omit `visible`
 * on most elements — so catalog.validate() would reject every ordinary spec with a spurious
 * "expected nonoptional, received undefined" error.
 */
function withVisiblePadding(spec: unknown): unknown {
  if (!isRecord(spec) || !isRecord(spec.elements)) {
    return spec;
  }

  const paddedElements: Record<string, unknown> = {};

  for (const [key, element] of Object.entries(spec.elements)) {
    paddedElements[key] =
      isRecord(element) && !('visible' in element) ? { ...element, visible: undefined } : element;
  }

  return { ...spec, elements: paddedElements };
}

function fromZodIssues(
  issues: z.core.$ZodIssue[],
  elements: Record<string, unknown> | null,
  pathPrefix: PropertyKey[] = [],
): ArtifactSpecError[] {
  return issues.map((issue) => {
    const fullPath = [...pathPrefix, ...issue.path];
    // Element-scoped issues always start with ["elements", key, ...].
    const element =
      fullPath[0] === 'elements' && typeof fullPath[1] === 'string' ? fullPath[1] : null;

    return {
      element,
      component: element ? elementType(elements, element) : null,
      path: formatPath(fullPath),
      message: issue.message,
    };
  });
}

/**
 * Validate an unknown value as an artifact spec. Never throws — garbage input (null, primitives,
 * malformed objects) produces a structured failure instead.
 */
export function validateArtifactSpec(spec: unknown): ArtifactValidationResult {
  const errors: ArtifactSpecError[] = [];
  const elements = readElements(spec);

  const catalogResult = catalog.validate(withVisiblePadding(spec));

  if (!catalogResult.success && catalogResult.error) {
    errors.push(...fromZodIssues(catalogResult.error.issues, elements));
  }

  if (elements) {
    // Workaround for @json-render/react's bundled schema: with more than one component in the
    // catalog, the generated element schema types `props` as `z.record(z.string(), z.unknown())`
    // (see getPropsFromPath in @json-render/core) — no prop-shape checking at all, so
    // catalog.validate() alone would accept a Table with `columns: "not an array"`. Re-parse each
    // element's props against its own component's Zod schema.
    for (const [key, element] of Object.entries(elements)) {
      const componentType = elementType(elements, key);
      const componentDef = componentType ? components[componentType] : undefined;

      if (!componentDef) {
        continue;
      }

      const props = isRecord(element) ? element.props : undefined;
      const propsResult = componentDef.props.safeParse(props);

      if (!propsResult.success) {
        errors.push(
          ...fromZodIssues(propsResult.error.issues, elements, ['elements', key, 'props']),
        );
      }
    }

    // Per-prop uniqueness rules (tab labels, Choice option ids/labels, list item ids, Table column
    // keys) are zod `.check()`s on the catalog prop schemas, surfaced by the per-element parse
    // above. Only lints spanning more than one prop or element live here.
    errors.push(
      ...findDuplicateStatePathErrors(elements),
      ...findTabsChildCountMismatchErrors(elements),
    );
  }

  if (isRecord(spec)) {
    const structural = validateSpec(spec as unknown as Spec, { checkOrphans: true });

    for (const issue of structural.issues) {
      if (issue.severity !== 'error') {
        continue;
      }

      errors.push({
        element: issue.elementKey ?? null,
        component: issue.elementKey ? elementType(elements, issue.elementKey) : null,
        path: issue.elementKey ? `elements.${issue.elementKey}` : issue.code,
        message: issue.message,
      });
    }
  }

  if (errors.length === 0) {
    return { valid: true, spec: spec as unknown as Spec };
  }

  return { valid: false, errors };
}
