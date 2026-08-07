/**
 * Server-usable validation for artifact specs. Used by the MCP publish tools
 * (src/lib/mcp/server.ts) as their structured error contract, and by tests/fixtures here.
 *
 * Merges two layers from @json-render/core: catalog.validate(spec), a Zod parse against the
 * catalog's generated schema (root/elements/children shape, unknown component names), and
 * validateSpec(spec), which catches AI-generation mistakes a type-level schema can't (dangling
 * child refs, misplaced `visible`/`on`/etc, orphaned elements). Two compensations for
 * @json-render's bundled schema and renderer live at their sites: the per-element props re-parse
 * in validateArtifactSpec and `withElementPadding`.
 */

import type { Spec } from '@json-render/core';
import { validateSpec } from '@json-render/core';
import type { z } from 'zod';

import { catalog, MAP_MARKERS_MAX } from '@/catalog/catalog';

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
export function collectStatePaths(
  elementKey: string,
  value: unknown,
): { key: string; path: string }[] {
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
 * A Day auto-renders one map from every descendant Stop with coordinates (day.tsx), which never
 * passes through Map's own markers cap — enforce the same cap per Day here so an oversized day
 * fails at publish time instead of silently truncating pins at render. Nested Days are skipped:
 * their stops register with their own map.
 */
function findDayMapMarkerCapErrors(elements: Record<string, unknown>): ArtifactSpecError[] {
  const errors: ArtifactSpecError[] = [];

  for (const [key, element] of Object.entries(elements)) {
    if (elementType(elements, key) !== 'Day' || !isRecord(element)) {
      continue;
    }

    let count = 0;
    const visited = new Set<string>([key]);
    const queue = Array.isArray(element.children) ? [...element.children] : [];

    while (queue.length > 0) {
      const childKey = queue.pop();

      if (typeof childKey !== 'string' || visited.has(childKey)) {
        continue;
      }

      visited.add(childKey);
      const childType = elementType(elements, childKey);

      if (childType === 'Day') {
        continue;
      }

      const child = elements[childKey];

      if (!isRecord(child)) {
        continue;
      }

      if (childType === 'Stop' && isRecord(child.props) && isRecord(child.props.coordinates)) {
        count += 1;
      }

      if (Array.isArray(child.children)) {
        queue.push(...child.children);
      }
    }

    if (count > MAP_MARKERS_MAX) {
      errors.push({
        element: key,
        component: 'Day',
        path: `elements.${key}.children`,
        message: `Day "${key}" has ${count} stops with coordinates; its auto-rendered map shows at most ${MAP_MARKERS_MAX}. Split the day or omit coordinates on some stops.`,
      });
    }
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
 * Fills in the three element keys @json-render/react's bundled schema declares without
 * `.optional()` — `visible: s.any()`, `children: s.array(s.string())`, `props:
 * s.propsOf(...)` — when an element omits them. Under Zod 4 a non-optional field requires the
 * key to be *present*, so catalog.validate() rejects every naturally-authored spec: leaf
 * elements carry no `children`, propless components carry no `props`, and most elements carry
 * no `visible`. For those two, core's own `UIElement` says `children?`/`visible?` and the renderer
 * reads `children?.map` — the omission is legal everywhere except that one schema.
 *
 * `props` is the opposite case: core requires it, and resolveElementProps/resolveBindings call
 * `Object.entries(props)` unguarded, so an element without it throws "Cannot convert undefined or
 * null to object" during SSR and blanks the subtree. Padding it is deliberate input leniency —
 * a propless Divider is the natural way to write one — paid for by normalizing before render.
 *
 * Hence both boundaries pad: a valid result returns the padded spec rather than the input, and
 * SpecView (src/catalog/registry.tsx) pads again on the way into the renderer — an artifact page
 * renders its stored body straight from JSON.parse and never passes through this validator.
 *
 * Non-record elements and non-spec input pass through untouched, so the schema still reports them.
 */
export function withElementPadding<T>(spec: T): T {
  if (!isRecord(spec) || !isRecord(spec.elements)) {
    return spec;
  }

  const paddedElements: Record<string, unknown> = {};

  for (const [key, element] of Object.entries(spec.elements)) {
    if (!isRecord(element)) {
      paddedElements[key] = element;
      continue;
    }

    paddedElements[key] = {
      ...('visible' in element ? {} : { visible: undefined }),
      ...('children' in element ? {} : { children: [] }),
      ...('props' in element ? {} : { props: {} }),
      ...element,
    };
  }

  return { ...spec, elements: paddedElements } as T;
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
 *
 * A valid result carries the padded spec (see `withElementPadding`), which is what the render
 * paths consume; the publish tools store the caller's raw input, so storage stays verbatim.
 */
export function validateArtifactSpec(spec: unknown): ArtifactValidationResult {
  const errors: ArtifactSpecError[] = [];
  const elements = readElements(spec);
  const padded = withElementPadding(spec);

  const catalogResult = catalog.validate(padded);

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

      // An omitted `props` is an empty props object, so a propless Divider passes while a Prose
      // still fails on its required `markdown`.
      const props = (isRecord(element) ? element.props : undefined) ?? {};
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
      ...findDayMapMarkerCapErrors(elements),
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
    return { valid: true, spec: padded as Spec };
  }

  return { valid: false, errors };
}
