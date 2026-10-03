# Plan 35 — Trail catalog component for hikes (verdict + build)

Verdict: build a dedicated `Trail` catalog component instead of extending Stop or asking Claude to compose Stop, Map, and Chart. A hike has structured stats (distance, elevation gain, difficulty, route type) and an elevation profile that no existing block expresses. The one piece that already exists, a drawn track, comes from reusing the catalog `Map` and `Chart` inside Trail. This plan adds the schema, the component, and its wiring. It does not add GPX import, live trail conditions, slope-colored tracks, route snapping, several trails per block, a topographic basemap, or Stop `kind: 'hike'` (plan 36 owns that).

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: M
- **Risk**: LOW. The `get_catalog` payload sits at 15,949 characters and the budget test fails at 16,000 (measured at planning time), so this plan must raise the ceiling on purpose.
- **Depends on**: none

## Why this matters

The owner asked for a dedicated hiking component. Today Claude can only describe a hike as a Stop with free-text stats, or as loose Map and Chart blocks with no link between them. The alternative, Stop `kind: 'hike'` plus authored Map and Chart, costs no catalog tokens but makes Claude author three or four elements, duplicate track coordinates, and compute chart labels by hand, rendering three unrelated siblings with untyped stats. A dedicated `Trail` costs about 300 `get_catalog` tokens and renders one coherent card; that trade is locked.

## Context

- `src/catalog/catalog.ts:34-37` `latLng`, `:43` `MAP_MARKERS_MAX` (its doc at `:39-42` lists every consumer), `:44-48` `listItemId`, `:89-92` `uniqueIds`. Map schema at `:496-543`: markers `:509-524`, path points `:529` (`z.array(latLng).min(2).max(500)`). Chart at `:462-487`. The travel group starts at `:615`; Stop is `:651-684`. KeyValueList at `:317-337`.
- `src/components/catalog/map.tsx:18-36` is the lazy, viewport-gated wrapper around `map-inner.tsx`. The inner file fits bounds to markers and path points (`map-inner.tsx:16-38`) and adds an sr-only marker list (`:97-106`). `src/components/catalog/day.tsx:53-61` is the precedent for composing the catalog `Map` from another component: it passes a built props object and wraps the Map in a flow div.
- `src/components/catalog/chart.tsx:13-23` is the lazy wrapper for `chart-inner.tsx`. Cartesian x uses `scalePoint<string>()` over `label` (`chart-inner.tsx:72`), so duplicate labels share one slot until plan 10 lands. The inner file builds the aria label from `valueLabel` (`:178-179`) and adds an sr-only data table (`:190-206`). `@tanstack/charts` thins crowded x tick labels (`node_modules/@tanstack/charts/dist/scene.js:758`), so 500 samples are safe.
- `src/components/catalog/stop.tsx:29-37` registers coordinates with the enclosing Day through `DayMapContext` (`day-map-context.ts:16-18`). `validate.ts:136-188` caps Day markers and counts only `Stop` elements (`:168`).
- Card precedent: `src/components/catalog/card.tsx:49-67` (`UiCard.Root` with `flowBlock`, `Title level={3}`, `Action` holding a Badge). `src/components/ui/card.tsx:38-41` defines `level`. The Badge variants are at `src/components/ui/badge.tsx:10-21`. `src/components/catalog/key-value-list.tsx:10-31` shows the stats look.
- `src/components/catalog/markdown-body.tsx:1-3` lists every component with a `markdown` prop. Trail joins that list.
- Wiring the gate enforces. `src/catalog/registry.tsx:43-73` is `catalogComponents`, and markdown exhibit fences reach it too. `src/catalog/fixtures/kitchen-sink.unit.test.ts:7-14` requires every component in the kitchen sink. `src/components/library/registry.unit.test.ts:53-63` requires a `catalog-<kebab>` demo per component. The library list is `src/components/library/registry.tsx:85-112`.
- Budget: `src/lib/mcp/catalog-summary.unit.test.ts:7-12` fails at `text.length / 4 >= 4000`. `catalog-summary.ts:67-86` prints each top-level prop's description but not nested `.describe()` text, so nested field descriptions cost nothing.
- Neighboring plans: plan 16 removes the README component count, so leave `README.md` alone. Plan 18 Phase 2 pins the payload at ≤ 15,949 characters. If this plan lands first, that number is stale (see Open questions). Plan 13 changes how Map resolves route colors. Trail inherits the change through Map.
- Test exemplars: `src/components/catalog/day.unit.test.tsx:10-14` (Map mocked to a stub that prints its props), `src/catalog/validate.unit.test.ts:98-122` (path-level error assertion), `src/catalog/registry.unit.test.tsx:19-21` (Map mock) and `:70` (kitchen-sink render).

Repo rules in `CLAUDE.md` apply (happy-dom tests, semantic tokens only, `flow.ts` spacing, no lint-disable comments, no dev servers or installs).

Domain skills the executor follows: `/Users/henry/.claude/skills/building-components/SKILL.md` (house Card and Badge parts, no new primitives), `/Users/henry/.claude/skills/web-design-guidelines/SKILL.md` (`Intl.NumberFormat`, hydration safety, decorative icons `aria-hidden`), `/Users/henry/.claude/skills/writing-style/SKILL.md` (catalog descriptions and UI labels: no em dashes, sentence case, sentences of 25 words or fewer), `/Users/henry/.claude/skills/code-comments/SKILL.md` (always).

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before you proceed. Report material drift. Don't silently replan.

## Gate

`pnpm gate` (typecheck, lint --fix, fmt, test) closes the phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If `node -v` differs from `mise current`, prefix commands with `mise exec --`.

## How to execute

- Single phase, one fresh session. The user commits.
- The orchestrator dispatches one subagent (`Task`, `subagent_type: general-purpose`) with this plan, verifies with the gate, and re-prompts the same subagent on failure.
- On success: a short "what changed, what to test" summary, then stop for user review.

---

## Phase 1 — Trail schema, component, and wiring

**Goal**: a spec with a `Trail` element passes `validateArtifactSpec` and renders one card. The card holds the name, a difficulty badge, stats, an optional map of the track and waypoints, an optional elevation profile, and optional notes. `get_catalog` lists Trail.

**Decisions**:

- Schema (`catalog.ts`, directly after Stop under the travel group). Extract `const mapMarker = latLng.extend({ id, label, description? })` from Map's markers (`:511-519`) and `const trackPoints = z.array(latLng).min(2).max(500)` from `:529`. Map uses both and its payload stays byte-identical. Trail props:
  - `name`: string ≤ `SHORT_MAX`.
  - `distance`: `{ value: z.number().positive(), unit: z.enum(['km', 'mi']) }`.
  - `elevationGain`: `{ value: z.number().min(0), unit: z.enum(['m', 'ft']) }`.
  - `difficulty`: `'easy'|'moderate'|'hard'|'strenuous'`.
  - `routeType`: `'loop'|'out-and-back'|'point-to-point'`.
  - `duration?`: string ≤ `SHORT_MAX`, same copy as Stop.
  - `track?`: `trackPoints`.
  - `waypoints?`: `z.array(mapMarker).max(MAP_MARKERS_MAX).check(uniqueIds)`. Its describe asks for the trailhead as the first waypoint.
  - `elevationProfile?`: `z.array(z.number()).min(2).max(500)`. The values are in `elevationGain.unit`, sampled evenly from start to finish.
  - `markdown?`: string ≤ `LONG_MAX`.
- Extend the `MAP_MARKERS_MAX` doc (`:39-42`) to name Trail waypoints.
- Description, 25 words or fewer per sentence, no em dash. It covers three points: a hike with stats and an optional map and elevation profile; use Trail rather than Stop to detail a hike, including inside a Day; Trail draws its own map, and its points never join the Day map. The `## Trail` block in the payload must be ≤ 1,200 characters.
- Component `src/components/catalog/trail.tsx` exports `Trail`. Structure: `UiCard.Root` with `flowBlock`, then `UiCard.Header` with `UiCard.Title level={3}` for the name and `UiCard.Action` holding the house `Badge`, then `UiCard.Content`. This matches catalog Card. The rank is fixed at 3 because plan 14 keeps title ranks out of nesting logic.
- Content order: stats, map, profile, notes. Each child is a flow block, so the Content's first and last resets apply.
  - Stats: render the catalog `KeyValueList` with `columns: 2`. The item ids are `distance`, `elevation-gain`, `duration` (only when set), and `route`. The keys are "Distance", "Elevation gain", "Duration", and "Route".
  - Map: render the catalog `Map` from `@/components/catalog/map` with `paths: [{ id: 'track', points: track }]` and `markers: waypoints`. It renders when `track` or `waypoints` is non-empty: a trailhead plus summit still earns a map, and authored waypoints are never dropped silently.
  - Profile: render the catalog `Chart` with `kind: 'area'`, `valueLabel: 'Elevation (<unit>)'`, and data from `elevationSeries`. It renders only when `elevationProfile` is set.
  - Notes: `MarkdownBody` with `className={flowBlock}`.
- No second map or chart: Trail imports neither `ui/map/*`, maplibre, nor `@tanstack/charts`. Trail never reads `DayMapContext`.
- `export function elevationSeries(profile, distance): { label: string; value: number }[]` sits in `trail.tsx`, exported for unit tests like `fitOptions` (`map-inner.tsx:16`). Sample `i` is labeled with the distance from the start, `distance.value * i / (n - 1)`. The label uses the smallest fixed fraction-digit count in 1..3 that makes every label unique, else 3. Why: the x scale merges equal labels until plan 10 lands.
- Number formatting: `Intl.NumberFormat('en-US', { style: 'unit', unit, unitDisplay: 'short' })` with unit `kilometer`, `mile`, `meter`, or `foot`. Stats use module-scope formatters with `maximumFractionDigits: 1`. `elevationSeries` builds one formatter per call with minimum and maximum fraction digits both set to the chosen count. The locale is pinned because the stats render during SSR and must match on hydrate. Catalog copy is English. Route labels: "Loop", "Out and back", "Point to point". Difficulty labels are capitalized enum values.
- Difficulty badge variants: `easy` → `success`, `moderate` → `info`, `hard` → `warning`, `strenuous` → `danger`. The text carries the meaning, and the color only reinforces it.
- Wiring: add `Trail` to `catalogComponents` (after Stop). Add a `trail` element as the last child of `day-1` in `kitchen-sink.ts` (`:410-414`), with a 3+ point track, one waypoint, and a 5-point profile; this also exercises Trail inside Day in `registry.unit.test.tsx`. Add `src/components/library/demos/catalog-trail.tsx` (`catalogTrailDemo`, slug `catalog-trail`, Kyoto Fushimi Inari summit loop, select controls for `difficulty` and `routeType`), and list it alphabetically in the library registry. In `catalog-summary.unit.test.ts`, apply the shared budget rule (plans 34, 35, 36): if the test fails, set the ceiling to the measured `text.length / 4` rounded up to the next 100, update the "~4k" wording at `catalog-summary.ts:3`, and report the before and after sizes; assert `text` contains `'## Trail'`.

**Scope**: in: `src/catalog/catalog.ts`, `src/components/catalog/trail.tsx` (new), `src/components/catalog/trail.unit.test.tsx` (new), `src/catalog/registry.tsx`, `src/catalog/validate.unit.test.ts`, `src/lib/mcp/catalog-summary.unit.test.ts`, `src/catalog/fixtures/kitchen-sink.ts`, `src/components/library/demos/catalog-trail.tsx` (new), `src/components/library/registry.tsx`, `src/components/catalog/markdown-body.tsx` (comment `:1-3` only). There are 10 files, over the ~6 cap. Six of them are one-line or fixture edits, and the gate's coverage tests (kitchen sink, library registry, `defineRegistry` typing) fail unless they land with the schema. A split would leave a red phase. Out: `map.tsx`, `map-inner.tsx`, `chart.tsx`, and `chart-inner.tsx` (reused unchanged); `day.tsx`, `stop.tsx`, `validate.ts` (plan 36 owns Day and Stop); `README.md` (plan 16); `get_catalog` example specs.

**Acceptance**:

- `pnpm gate` exits 0.
- `pnpm vitest run src/components/catalog/trail.unit.test.tsx src/catalog src/lib/mcp src/components/library` → all pass.
- `grep -nE "maplibre|ui/map|@tanstack/charts|DayMapContext" src/components/catalog/trail.tsx` → no match.
- `grep -n "Trail" src/components/catalog/markdown-body.tsx src/components/library/registry.tsx` → at least one match per file.
- New `trail.unit.test.tsx` (happy-dom). Mock `@/components/catalog/map` and `@/components/catalog/chart` with stubs that print their props (model `day.unit.test.tsx:10-14`). Cases:
  1. Full props → the name is a level-3 heading, the badge reads "Moderate", and the stats show "8.4 km", "650 m", the duration, and "Out and back".
  2. `track` + `waypoints` → the Map stub gets one path with id `track` and the waypoint markers.
  3. Neither `track` nor `waypoints` and no `elevationProfile` → no Map stub and no Chart stub.
  4. `elevationProfile` → the Chart stub gets `kind: 'area'` and `valueLabel: 'Elevation (m)'`.
  5. `elevationSeries` on 101 samples over 1 km → 101 unique labels, first `0.00 km`, last `1.00 km`. On 3 samples over 10 mi → `0.0 mi`, `5.0 mi`, `10.0 mi`.
  6. Trail with a track inside `<Day>` → exactly one Map stub renders (Trail's own), so Day adds no auto-map.
- `validate.unit.test.ts` (model `:98-122`): a full Trail spec is valid. `distance.unit: 'ft'` fails at `elements.trail.props.distance.unit`. A 501-point `track` fails at `elements.trail.props.track`. Duplicate waypoint ids produce the `uniqueIds` message.
- Manual smoke (user): `/dev/library/catalog-trail` renders the card with map and profile in light and dark. Switching difficulty recolors the badge. A published spec with a Trail inside a Day shows no Day auto-map unless a Stop has coordinates.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note each deviation in the final summary. Stop and report instead of improvising when a locked decision is wrong or impossible, when the work needs out-of-scope files, or when acceptance fails after a couple of honest attempts.

Plan-specific risk: if the `## Trail` block exceeds 1,200 characters, cut description words. Don't raise the ceiling further.

## Done criteria

- [ ] `pnpm gate` exits 0
- [ ] `trail.unit.test.tsx` has the six cases above, all passing
- [ ] `validate.unit.test.ts` has the four Trail cases, all passing
- [ ] Map's summary line in `get_catalog` is byte-identical to `ffee99b` (compare with a throwaway assertion, not committed)
- [ ] `docs/plans/README.md` status row updated

## Open questions

- Difficulty badge colors, or a monochrome `default` for all four? Resolved in Phase 1. Recommended default: graded colors as locked. Difficulty is a warning signal, and the text label keeps it accessible.
- Plan 18 Phase 2 measures the payload at its own start and treats that value as its ceiling, so plan order does not matter for the budget. No action here.
- Show a start marker at `track[0]` when no waypoints are given? Recommended default: no. Claude supplies the trailhead as a waypoint, and the description says so.
