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
import { collectItineraryDays, collectStopMarkers } from '@/catalog/stop-markers';
import { LIVE_WEATHER_MAX } from '@/components/catalog/weather-schema';

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
 * Collects every string value found under a key literally named "statePath" inside an element's
 * props (including nested arrays, e.g. Checklist items) in document order, tagged with the owning
 * element key. Walking by key name rather than hardcoding component types catches every current and
 * future statePath-bearing field in one place. The walk is iterative because hostile props can nest
 * deeper than the call stack.
 */
export function collectStatePaths(elementKey: string, value: unknown): StatePathEntry[] {
  const found: StatePathEntry[] = [];
  const stack: ({ path: string } | { value: unknown })[] = [{ value }];

  for (let item = stack.pop(); item; item = stack.pop()) {
    if ('path' in item) {
      found.push({ key: elementKey, path: item.path });
      continue;
    }

    const nested: ({ path: string } | { value: unknown })[] = Array.isArray(item.value)
      ? item.value.map((entry: unknown) => ({ value: entry }))
      : isRecord(item.value)
        ? Object.entries(item.value).map(([key, entry]) =>
            key === 'statePath' && typeof entry === 'string' ? { path: entry } : { value: entry },
          )
        : [];

    for (const next of nested.toReversed()) {
      stack.push(next);
    }
  }

  return found;
}

/** One statePath occurrence and the key of the element or component that owns it. */
interface StatePathEntry {
  key: string;
  path: string;
}

/** Two or more statePath occurrences that write over each other, with their owning keys. */
export interface StatePathConflict {
  paths: string[];
  keys: string[];
  message: string;
}

/**
 * Finds statePaths that overlap: one record per path used more than once (listing every owner),
 * and one per pair where one path's segments are a prefix of the other's. The state store nests
 * pointers, so a write to `/feedback` replaces `{ note: … }` under it and a write to
 * `/feedback/note` replaces a non-object `/feedback` with `{}` — either way one input erases the
 * other. `/feedback/backup` and `/feedback/backup-decision` share no segment and do not conflict.
 *
 * Linear in the number of paths times their depth: each path looks up only its own proper segment
 * prefixes, the substrings ending before one of its `/` separators. The catalog's pointer pattern
 * starts every path with `/` and has no `~` escapes to decode.
 */
export function findStatePathConflicts(entries: StatePathEntry[]): StatePathConflict[] {
  const usedBy = new Map<string, string[]>();
  const distinct: StatePathEntry[] = [];

  for (const { key, path } of entries) {
    const keys = usedBy.get(path);

    if (keys) {
      keys.push(key);
    } else {
      usedBy.set(path, [key]);
      distinct.push({ key, path });
    }
  }

  const conflicts: StatePathConflict[] = [];

  for (const [path, keys] of usedBy) {
    if (keys.length > 1) {
      conflicts.push({
        paths: [path],
        keys,
        message: `statePath "${path}" is used by ${keys.length} elements (${keys.join(', ')}). They share one saved state. Give each interactive element a unique statePath.`,
      });
    }
  }

  const firstUses = new Map(distinct.map((entry, index) => [entry.path, { entry, index }]));
  const pairs: { rank: [number, number]; shorter: StatePathEntry; longer: StatePathEntry }[] = [];

  for (const [index, longer] of distinct.entries()) {
    const { path } = longer;

    for (let end = path.indexOf('/', 1); end !== -1; end = path.indexOf('/', end + 1)) {
      const shorter = firstUses.get(path.slice(0, end));

      if (shorter) {
        const rank: [number, number] = [
          Math.min(shorter.index, index),
          Math.max(shorter.index, index),
        ];
        pairs.push({ rank, shorter: shorter.entry, longer });
      }
    }
  }

  // The order a pairwise scan over first uses meets the pairs in.
  pairs.sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1]);

  for (const { shorter, longer } of pairs) {
    conflicts.push({
      paths: [shorter.path, longer.path],
      keys: [shorter.key, longer.key],
      message: `statePath "${shorter.path}" (${shorter.key}) contains "${longer.path}" (${longer.key}). A write to "${shorter.path}" replaces the value at "${longer.path}". Give each interactive element a statePath that is not a prefix of another.`,
    });
  }

  return conflicts;
}

function findStatePathConflictErrors(elements: Record<string, unknown>): ArtifactSpecError[] {
  const entries = Object.entries(elements).flatMap(([key, element]) =>
    isRecord(element) ? collectStatePaths(key, element.props) : [],
  );

  return findStatePathConflicts(entries).map(({ keys, message }) => {
    const first = keys[0] ?? null;

    return {
      element: first,
      component: first ? elementType(elements, first) : null,
      path: 'statePath',
      message,
    };
  });
}

/**
 * The existing elements an element lists, in `children` and in named `slots` (both render as its
 * descendants), with the field path of each reference.
 */
function childReferences(
  elements: Record<string, unknown>,
  element: unknown,
): { child: string; field: string }[] {
  if (!isRecord(element)) {
    return [];
  }

  const lists: [string, unknown][] = [
    ['children', element.children],
    ...(isRecord(element.slots)
      ? Object.entries(element.slots).map(([name, keys]): [string, unknown] => [
          `slots.${name}`,
          keys,
        ])
      : []),
  ];

  return lists.flatMap(([field, keys]) =>
    Array.isArray(keys)
      ? keys.flatMap((child: unknown, index) =>
          typeof child === 'string' && Object.hasOwn(elements, child)
            ? [{ child, field: `${field}.${index}` }]
            : [],
        )
      : [],
  );
}

/**
 * A spec is a tree: every element has at most one parent, appears once in its parent's children,
 * and never contains itself. Shared children would make every walk over descendants (the marker
 * lints below, the renderer) repeat the shared subtree once per parent, so one small spec could
 * cost billions of visits. Linear in the number of child references.
 */
function findElementTreeErrors(elements: Record<string, unknown>): ArtifactSpecError[] {
  const errors: ArtifactSpecError[] = [];
  const parents = new Map<string, { parent: string; field: string }>();

  for (const [parent, element] of Object.entries(elements)) {
    for (const { child, field } of childReferences(elements, element)) {
      const first = parents.get(child);

      if (!first) {
        parents.set(child, { parent, field });
        continue;
      }

      errors.push({
        element: parent,
        component: elementType(elements, parent),
        path: `elements.${parent}.${field}`,
        message:
          first.parent === parent
            ? `Element "${child}" is listed more than once in the children of "${parent}".`
            : `Element "${child}" is a child of both "${first.parent}" and "${parent}". Each element has at most one parent.`,
      });
    }
  }

  // With one parent each, a cycle is a loop of parent links. Each climb stops at an element an
  // earlier climb already settled, so every element is climbed through once.
  const settled = new Set<string>();

  for (const start of parents.keys()) {
    const climbed = new Set<string>();
    let key: string | undefined = start;

    while (key !== undefined && !settled.has(key) && !climbed.has(key)) {
      climbed.add(key);
      key = parents.get(key)?.parent;
    }

    const link = key !== undefined && climbed.has(key) ? parents.get(key) : undefined;

    if (key !== undefined && link) {
      errors.push({
        element: link.parent,
        component: elementType(elements, link.parent),
        path: `elements.${link.parent}.${link.field}`,
        message: `Element "${key}" is its own descendant through the children of "${link.parent}".`,
      });
    }

    for (const climbedKey of climbed) {
      settled.add(climbedKey);
    }
  }

  return errors;
}

/**
 * Specs a person or an agent writes nest a handful of levels (every fixture and example nests 5 or
 * fewer). 64 leaves an order of magnitude of headroom while keeping the recursive walks of
 * @json-render/core's validator and renderer, a few stack frames per level, far from the stack
 * limit.
 */
const ELEMENT_DEPTH_MAX = 64;

/**
 * Rejects a spec whose deepest element sits more than ELEMENT_DEPTH_MAX levels below a top-level
 * element (the root, or an orphan). Assumes the tree `findElementTreeErrors` enforces, so the
 * iterative walk visits each element once.
 */
function findElementDepthErrors(elements: Record<string, unknown>): ArtifactSpecError[] {
  const children = new Set<string>();

  for (const element of Object.values(elements)) {
    for (const { child } of childReferences(elements, element)) {
      children.add(child);
    }
  }

  const stack = Object.keys(elements)
    .filter((key) => !children.has(key))
    .map((key) => ({ key, depth: 1 }));
  let deepest = { key: '', depth: 0 };

  for (let item = stack.pop(); item; item = stack.pop()) {
    if (item.depth > deepest.depth) {
      deepest = item;
    }

    for (const { child } of childReferences(elements, elements[item.key])) {
      stack.push({ key: child, depth: item.depth + 1 });
    }
  }

  if (deepest.depth <= ELEMENT_DEPTH_MAX) {
    return [];
  }

  return [
    {
      element: deepest.key,
      component: elementType(elements, deepest.key),
      path: `elements.${deepest.key}`,
      message: `Element "${deepest.key}" is nested ${deepest.depth} levels deep; a spec nests at most ${ELEMENT_DEPTH_MAX} levels.`,
    },
  ];
}

/**
 * A Day renders one map from every descendant Stop with coordinates (day.tsx), which never passes
 * through Map's own markers cap. The same cap applies per Day here, so an oversized day fails at
 * publish time instead of losing pins at render. The count uses the render path's walk
 * (stop-markers.ts), so a nested Day's stops count toward that Day only.
 */
function findDayMapMarkerCapErrors(elements: Record<string, unknown>): ArtifactSpecError[] {
  const errors: ArtifactSpecError[] = [];

  for (const [key, element] of Object.entries(elements)) {
    if (elementType(elements, key) !== 'Day' || !isRecord(element)) {
      continue;
    }

    const count = Array.isArray(element.children)
      ? collectStopMarkers(elements, element.children).length
      : 0;

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
 * An Itinerary renders one trip map from the stops of all its Days (itinerary.tsx), so the Day cap
 * applies again to their sum.
 */
function findItineraryMapMarkerCapErrors(elements: Record<string, unknown>): ArtifactSpecError[] {
  const errors: ArtifactSpecError[] = [];

  for (const [key, element] of Object.entries(elements)) {
    if (elementType(elements, key) !== 'Itinerary' || !isRecord(element)) {
      continue;
    }

    const count = Array.isArray(element.children)
      ? collectItineraryDays(elements, element.children).reduce(
          (sum, day) => sum + day.markers.length,
          0,
        )
      : 0;

    if (count > MAP_MARKERS_MAX) {
      errors.push({
        element: key,
        component: 'Itinerary',
        path: `elements.${key}.children`,
        message: `Itinerary "${key}" has ${count} stops with coordinates across its days; its trip map shows at most ${MAP_MARKERS_MAX}. Split the trip or omit coordinates on some stops.`,
      });
    }
  }

  return errors;
}

/**
 * Each live Weather block fetches a forecast upstream every time the artifact is viewed, so one
 * artifact with many of them would spend the shared Open-Meteo quota and evict every cached
 * forecast. Takes spec elements and markdown blocks alike, as `{ type, props }`.
 */
export function findLiveWeatherCapErrors(
  blocks: { type?: unknown; props?: unknown }[],
): ArtifactSpecError[] {
  const count = blocks.filter(
    ({ type, props }) => type === 'Weather' && isRecord(props) && props.source === 'live',
  ).length;

  if (count <= LIVE_WEATHER_MAX) {
    return [];
  }

  return [
    {
      element: null,
      component: 'Weather',
      path: 'source',
      message: `${count} Weather blocks use source "live", and an artifact holds at most ${LIVE_WEATHER_MAX}. Each live block fetches a forecast every time the artifact is viewed.`,
    },
  ];
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
        message: `Tabs item count ${items.length} does not match child count ${children.length}. Items and children must match one to one.`,
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

  // Structure first: the marker lints and @json-render/core's recursive validateSpec below repeat
  // shared subtrees and recurse once per level, so they only see a shallow tree.
  const treeErrors = elements ? findElementTreeErrors(elements) : [];
  const structureErrors =
    elements && treeErrors.length === 0 ? findElementDepthErrors(elements) : treeErrors;

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
      ...findStatePathConflictErrors(elements),
      ...findTabsChildCountMismatchErrors(elements),
      ...findLiveWeatherCapErrors(Object.values(elements).filter(isRecord)),
      ...structureErrors,
      ...(structureErrors.length === 0
        ? [...findDayMapMarkerCapErrors(elements), ...findItineraryMapMarkerCapErrors(elements)]
        : []),
    );
  }

  if (isRecord(spec) && structureErrors.length === 0) {
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
