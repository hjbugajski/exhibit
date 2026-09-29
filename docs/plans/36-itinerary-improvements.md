# Plan 36 — Itinerary improvements: spec-derived day/trip maps, richer Stops, transit connectors

Day and Itinerary read their Stops from the spec during render, not from effect registration. This removes the post-hydration map insertion (audit UX-10). On that base, the day map becomes a numbered route, the Itinerary gets a trip map and a day index, and Stop gains `url`, `cost`, `status`, `transit`, and the kinds `hike` and `shopping`. Out of scope: booking integrations, currency formatting or conversion, calendar export, print styles, drag-to-reorder, a `weather` prop on Day (plan 34's Weather block is a Day child), and any change to `Map`'s own schema or `map-inner.tsx`.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: M (five small phases)
- **Risk**: MED. Phase 1 replaces the Day/Stop data flow and adds registry adapters that depend on `@json-render/react` 0.20 internals being as read here. Phase 1 also drops the markdown-path auto-map (see Context).
- **Depends on**: docs/plans/34-\*.md, docs/plans/35-\*.md (both grow the `get_catalog` payload first; this plan re-measures after them).

## Why this matters

A Day learns its Stops in `useEffect`, so its 320 px map appears one commit after the stops and pushes them down. A trip has no overview: the owner scrolls day by day, and the day map is an unordered scatter. A Stop cannot carry a booking link, a price, or a booked/optional state, and travel between stops needs a separate `travel` Stop. After this plan the map is in the first render, each day reads as a route, and a Stop holds what a real plan needs.

## Context

- `src/catalog/catalog.ts:616-684`: Itinerary, Day, Stop schemas. Stop `kind` enum at `:677-682`. `MAP_MARKERS_MAX` (500) at `:43`. Map `paths[].points` max 500 at `:529`. Table's http(s) href rule at `:300-305` is the exemplar for `url`.
- `src/components/catalog/day.tsx:19-33` collects markers in state from Stop registrations; `:45-62` renders the Map, sliced to the cap, inside a `flowTight` wrapper. `stop.tsx:29-37` registers through `DayMapContext` (`day-map-context.ts`). `stop.tsx:14-20` maps kinds to lucide icons.
- json-render facts (read in `node_modules/@json-render/react/dist`, v0.20.0). `defineRegistry` (`index.mjs:1182-1203`) passes a component only `element.props` (`:1196`), never `element` or the spec. The raw registry entry receives `element` with its `children` keys (`:1036-1047`; type `ComponentRenderProps`, `index.d.ts:366-387`). Nothing exposes the spec to components. `registryMetadata` is a WeakMap keyed by the registry object (`index.mjs:798`, `:1209`). `useVisibility().isVisible(condition)` evaluates a `visible` condition against live state (`index.mjs:149-172`).
- Design it twice, marker source. (A) Registry adapters: `SpecView` provides the padded spec through a context. Day and Itinerary get raw renderers that read `element.children` and walk the spec. (B) A pre-render walk in `SpecView` keyed by element: a component cannot learn its own element key, so B cannot map results back. Pick A: it uses only exported types.
- Design it twice, transit. (A) `transit` on the arriving Stop. (B) A new `Leg` element between Stops. Pick A: Day children stay uniform, map walks need no new type, and it costs one prop, not one component in the size-budgeted catalog.
- `src/catalog/registry.tsx:43-75` builds `catalogComponents` and the registry; `:90-98` is `SpecView`. `src/components/markdown/catalog-dispatch.tsx:70-98` renders a markdown `::start:Day` directive through `catalogComponents` with `{ props, children }` only. Behavior change: a markdown Day wrapping exhibit-fence Stops lost its auto-map, because no spec exists there. No tool description promises it (`src/lib/mcp/server.ts:254` names Day only as a markdown wrapper).
- `src/catalog/validate.ts:136-188`: the per-Day marker cap lint, with its own queue walk. `:333-337` lists the cross-element lints.
- `get_catalog` budget: `src/lib/mcp/catalog-summary.unit.test.ts` asserts `text.length / 4 < 4000`. At `ffee99b` the text is 15,949 chars (about 3,987 tokens). The trimmed example keeps `itinerary`, `day-1`, `stop-1a`, `stop-1b` (`catalog-summary.ts:128-139`).
- Exemplars: external link with render-time http(s) guard, `src/components/catalog/table.tsx:10-32`. Slug id with empty fallback, `heading.tsx:19-29` via `src/lib/slugify.ts`. Scroll offset under the sticky `h-16` header, `blocks/authed-layout.tsx:23,36` (`scroll-mt-16`). Badge variants, `ui/badge.tsx:10-20`. Map test stub, `day.unit.test.tsx:10-14`.
- Plan overlap. Plan 29 already drops UX-10 in favor of this plan (`29-minor-ux-polish.md:3,31`). Plan 25 converts `day.tsx:63` and `stop.tsx:24` to React 19 context syntax; Phase 1 deletes that context, so plan 25's edits there become moot. Plan 18 rewrites the `Day 1 — Saturday` labels (`fixtures/itinerary.ts:19,65`, `catalog.ts:638`). Tests here assert against the fixture's label value, never a literal.

Cross-phase rules (from `CLAUDE.md`): kebab-case files; no barrels; tests colocated as `.unit.test.ts(x)`; semantic tokens only, no `dark:` or `/NN` alpha; catalog blocks space themselves with `flow.ts` tiers; icons tag `data-icon`; React 19 contexts render as `<X value>` and read with `use(X)`; no `dangerouslySetInnerHTML`; artifact content is hostile, so every author URL passes a render-time http(s) check even though the schema checks it too (stored bodies are never re-validated).

Budget rule (Phases 3 to 5): run the budget test after each catalog or fixture change. If it fails, set the ceiling to the measured `text.length / 4` rounded up to the next 100. Update the "~4k tokens" wording at `catalog-summary.ts:3` to match, and report the before and after sizes.

Domain skills the executor must follow:

- `/Users/henry/.claude/skills/building-components/SKILL.md`: presentational components take data as props; no boolean-prop growth.
- `/Users/henry/.claude/skills/web-design-guidelines/SKILL.md`: decorative icons `aria-hidden`; links are `<a>` with visible focus; `scroll-margin-top` on anchors; `min-w-0` and wrapping for long text.
- `/Users/henry/.claude/skills/writing-style/SKILL.md`: catalog descriptions and UI labels. No em dashes, sentence case, no terminal period on labels or badges.
- `/Users/henry/.claude/skills/code-comments/SKILL.md`: rewrite the `day.tsx` and `validate.ts` doc comments to the new data flow; delete comments that describe registration.

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before you proceed. Report material drift. Do not replan silently.

## Gate

`pnpm gate` (typecheck, lint with fix, fmt, test) closes every phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If the shell's `node -v` is not 26, prefix with `mise exec --`.

## How to execute

- One phase per fresh session; the user commits between phases.
- The orchestrator dispatches ONE subagent per phase (`Task` tool, `subagent_type: general-purpose`) with this plan's Context, the phase's Decisions/Scope/Acceptance, and the intent. It verifies with the gate and re-prompts the SAME subagent on failure. It does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for user review.

## Phases

1. Spec-derived Stop markers (UX-10 root fix).
2. Numbered day route and one shared cap lint.
3. Trip map and day index on Itinerary.
4. Stop fields and transit connector.
5. Fixture, example, and demo coverage.

---

## Phase 1 — Spec-derived Stop markers

**Goal**: A Day's map is present in the first render, server or client. No Stop registers anything.

**Decisions**:

- New React-free `src/catalog/stop-markers.ts`: `interface StopMarker { id: string; lat: number; lng: number; label: string; description?: string }` and `collectStopMarkers(elements: Record<string, unknown>, childKeys: readonly unknown[], isVisible?: (condition: unknown) => boolean): StopMarker[]`. Pre-order walk in document order. `id` is the Stop's element key; `label` is `title` (`''` when not a string); `description` is `location`. It skips a subtree when `isVisible(element.visible)` is false and skips any element with `repeat`. It stops at a nested Day, keeps a visited set, and tolerates garbage (a marker needs numeric `lat` and `lng`). `isVisible` defaults to always true.
- `registry.tsx`: a module-private `SpecContext` holds the padded spec; `SpecView` provides it around `Renderer`. A raw adapter `DayElement({ element, children }: ComponentRenderProps<CatalogComponentProps<'Day'>>)` reads the spec with `use`, gets `isVisible` from `useVisibility()`, memoizes `collectStopMarkers(spec.elements, element.children ?? [], isVisible)`, and renders `<Day props={element.props} markers={...}>`. Assign it onto the registry object that `defineRegistry` returns (`registry.Day = DayElement`), not a spread copy, so json-render's slot metadata stays attached. `catalogComponents.Day` stays the plain component for the markdown path.
- `day.tsx`: `Day({ props, markers, children })`, `markers?: StopMarker[]`, pure. No state, no context. Delete `day-map-context.ts` and Stop's `useEffect`, `useId`, and `useContext`.

**Scope**: in: `src/catalog/stop-markers.ts` (new), `src/catalog/stop-markers.unit.test.ts` (new), `src/catalog/registry.tsx`, `src/components/catalog/day.tsx`, `src/components/catalog/stop.tsx`, `src/components/catalog/day-map-context.ts` (delete), `src/components/catalog/day.unit.test.tsx`. Out: `validate.ts` (Phase 2 moves it onto the walker), route drawing (Phase 2).

**Acceptance**:

- `grep -rn "DayMapContext\|day-map-context\|register(" src/components/catalog` → no match.
- `stop-markers.unit.test.ts`: document order across nested containers (a Stop inside a Card inside a Day); a stop without coordinates is skipped; a nested Day's stops are excluded; a `visible` subtree that `isVisible` rejects is excluded; a `repeat` subtree is excluded; a cyclic `children` reference terminates.
- `day.unit.test.tsx` rewritten: Day with `markers` renders the map, Day with none renders no map. A `renderToString(<SpecView spec={itineraryFixture} />)` case (from `react-dom/server`, Map stubbed as today) contains day 1's marker labels. This is the UX-10 regression: the map exists before any effect runs.
- `pnpm gate` → exit 0.

---

## Phase 2 — Numbered day route and one shared cap lint

**Goal**: A day map with two or more pins reads as an ordered route. The publish lint and the render path count markers with the same walker.

**Decisions**:

- `day.tsx` builds Map props from `markers`, sliced to `MAP_MARKERS_MAX`. Each marker label is `${n}. ${title}` (1-based, document order). With two or more markers, add one path `{ id: 'route', points, dashed: true }`. Dashed, because Map draws straight segments and the path is not the road. `map-inner.tsx:97-106` already lists labels for screen readers, so the numbers reach them unchanged.
- `day.tsx`: the `<section>` gets `id={slugify(props.label) || undefined}` and `scroll-mt-16`, per the `heading.tsx` precedent. Phase 3's index links to it. Duplicate labels share an id; the first one wins, as with Heading.
- `stop-markers.ts` gains `collectItineraryDays(elements, childKeys, isVisible?): { key: string; label: string; markers: StopMarker[] }[]`. It returns each Day under the Itinerary in document order, not descending into a Day's Days, with the same visibility and repeat rules. A non-string `label` becomes `''`.
- `validate.ts`: `findDayMapMarkerCapErrors` calls `collectStopMarkers` in place of its queue walk; message and path unchanged. New `findItineraryMapMarkerCapErrors`: the sum over `collectItineraryDays` above `MAP_MARKERS_MAX` fails on the Itinerary key at `elements.<key>.children`. Both registered at `:333-337`.

**Scope**: in: `day.tsx`, `day.unit.test.tsx`, `stop-markers.ts`, `stop-markers.unit.test.ts`, `validate.ts`, `validate.unit.test.ts`. Out: Itinerary rendering (Phase 3).

**Acceptance**:

- `day.unit.test.tsx`: three markers give labels `1. …`, `2. …`, `3. …` and one dashed path of three points; one marker gives no path; the section `id` is the label's slug; an all-symbol label renders no `id`.
- `validate.unit.test.ts`: existing Day-cap cases pass unchanged; an Itinerary whose Days total 501 coordinate Stops (each Day under 500) fails with the Itinerary key; 500 total passes.
- `grep -c "queue" src/catalog/validate.ts` → `0`.
- `pnpm gate` → exit 0.

---

## Phase 3 — Trip map and day index on Itinerary

**Goal**: A multi-day itinerary opens with an overview of the whole trip and links to each day.

**Decisions**:

- `registry.tsx`: `ItineraryElement` adapter, same pattern as `DayElement`, passes `days={collectItineraryDays(...)}`. `itinerary.tsx`: `Itinerary({ props, days, children })`, pure.
- Trip map renders when two or more Days have markers: all markers, capped at `MAP_MARKERS_MAX`, labels unnumbered. One dashed path per Day with two or more markers, id `route-<day key>`. Wrap it in `flowTight` as Day's map wrapper does.
- Day index renders when `days.length >= 2`: `<nav aria-label="Days">` holding an `<ol>`, one `<a href="#<slug>">` per Day. A Day whose slug is `''` renders as plain text. Order after the header: trip map, then index, then children.
- `catalog.ts`: Itinerary description adds one sentence about the automatic trip map and day links. Day description adds that stops are numbered in order. Keep both terse (budget rule).

**Scope**: in: `registry.tsx`, `itinerary.tsx`, `itinerary.unit.test.tsx` (new), `catalog.ts` (Itinerary and Day descriptions only), `catalog-summary.unit.test.ts` and `catalog-summary.ts:3` (budget rule only). Out: Stop props (Phase 4).

**Acceptance**:

- `itinerary.unit.test.tsx` through `SpecView` with the Map stub: two mapped Days render the trip map plus two day maps; one mapped Day renders no trip map; two Days render a nav with two links whose `href` values match the Day `id`s; a single Day renders no nav.
- `pnpm vitest run src/lib/mcp/catalog-summary.unit.test.ts` → pass.
- `pnpm gate` → exit 0.

---

## Phase 4 — Stop fields and transit connector

**Goal**: A Stop carries its booking link, price, and booking state, and shows how you get there from the previous stop.

**Decisions**:

- `catalog.ts` Stop props, all optional: `url` (`z.string().max(2_000).regex(/^https?:\/\//i)`, same as Table href); `cost` (string, `SHORT_MAX`, shown verbatim); `status` (`z.enum(['booked', 'planned', 'optional'])`); `transit` (`z.object({ mode: z.enum(['walk', 'transit', 'drive', 'bike', 'flight', 'boat']), duration: z.string().max(SHORT_MAX).optional() })`, described as travel from the previous stop to this one). `kind` gains `'hike'` and `'shopping'`. Update the kind description's icon list.
- Icons: `hike` Mountain, `shopping` ShoppingBag. Transit: walk Footprints, transit TrainFront, drive Car, bike Bike, flight Plane, boat Ship.
- `stop.tsx`: the title renders as an external `<a>` (table.tsx link classes, `rel="noopener noreferrer"`, `target="_blank"`) only when `url` passes the render-time http(s) check; otherwise plain text. The meta row adds `cost` (`tabular-nums`) and a Badge for `status`: booked `success`, planned `default`, optional `outline`, labels `Booked`, `Planned`, `Optional`.
- Transit connector: when `transit` is set, Stop's root becomes a `div` with `flowTight` holding a muted connector line (icon `aria-hidden`, text `Walk · 15 min`, or the mode label alone when `duration` is absent) and then the Card without its own flow class. Mode labels: Walk, Transit, Drive, Bike, Flight, Boat.

**Scope**: in: `catalog.ts` (Stop only), `stop.tsx`, `stop.unit.test.tsx` (new), `validate.unit.test.ts`, `catalog-summary.unit.test.ts` and `catalog-summary.ts:3` (budget rule only). Out: fixtures (Phase 5), Map changes.

**Acceptance**:

- `stop.unit.test.tsx`: an http(s) `url` renders a link with `target="_blank"`; a `javascript:` url passed straight to the component renders plain text; each `status` renders its label; `transit` without `duration` renders the mode label alone; `transit` absent renders no connector; `hike` and `shopping` render.
- `validate.unit.test.ts`: a Stop with `url: 'ftp://x'` fails publish validation.
- `pnpm gate` → exit 0.

---

## Phase 5 — Fixture, example, and demo coverage

**Goal**: Every new prop and behavior appears in the fixture, the road-trip example, and `/dev/library`.

**Decisions**:

- `src/catalog/fixtures/itinerary.ts`: add coordinates to day 2's stops, so the trip map renders. Put `url`, `cost`, `status`, `transit`, `hike`, and `shopping` only on elements outside the trimmed example set (`stop-1c`, day 2's stops, one new day 2 stop). The `get_catalog` example stays the same size.
- `scripts/examples/road-trip.ts`: add `transit` (drive legs), `status`, `cost`, and `url` to its stops. Add no coordinates: its hand-built route Map with the dashed detour stays the trip overview.
- `src/components/library/demos/catalog-itinerary.tsx`: cover all seven kinds, every new prop, and a second mapped day; update its lead comment.
- `registry.unit.test.tsx`: the itinerary case also asserts the day index link count.

**Scope**: in: the four files named, plus the budget files under the budget rule. Out: kitchen-sink fixture, label text (plan 18).

**Acceptance**:

- `pnpm vitest run src/catalog src/lib/mcp/catalog-summary.unit.test.ts` → pass (fixture validates in `validate.unit.test.ts`; trimmed example validates; budget holds). No test validates `scripts/examples/road-trip.ts`; the gate only type-checks it, so its `url` values must be literal `https://` strings.
- `pnpm gate` → exit 0.
- Manual smoke (user): `/dev/library` Itinerary demo shows the trip map above a day index; clicking a day link lands below the sticky header; day maps show numbered pins and a dashed route; a Stop title opens its url in a new tab; `scripts/dev-publish.ts` publishes the road-trip example without a validation error.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note the deviation in the final summary. Stop and report when a locked decision is wrong or impossible, when the work needs out-of-scope files, or when acceptance fails after a couple of honest attempts. Stop specifically if the registry adapter cannot receive `element` (a json-render upgrade changed `defineRegistry` or the raw renderer contract): do not fall back to effect registration.

## Done criteria

- [ ] `pnpm gate` exits 0
- [ ] `grep -rn "DayMapContext" src` → no match; `src/components/catalog/day-map-context.ts` is gone
- [ ] `renderToString` of the itinerary fixture contains the day map (Phase 1 test)
- [ ] `validate.ts` Day and Itinerary cap lints both call `stop-markers.ts`
- [ ] `catalog-summary.unit.test.ts` passes; any ceiling change is reported with measured sizes
- [ ] `docs/plans/README.md` row for 36 updated; plan 29 already excludes UX-10 (`29-minor-ux-polish.md:31`), so no change there

## Open questions

- Phase 1: keep an auto-map for a markdown `::start:Day` that wraps exhibit-fence Stops? Default: no. The author embeds a Map fence; a second collection path would restore the layout shift there.
- Phase 4: show the numbered order on Stop cards too? Default: no. A Stop cannot learn its element key from json-render, so matching numbers would need a second adapter; revisit if the map numbers alone confuse.
