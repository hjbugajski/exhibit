# Plan 13 — Re-resolve map route colours when the theme changes

Make map route lines follow the current colour scheme. Today the route colour is resolved once at mount and stays stale after a light/dark switch. The fix covers the catalog Map (`--color-accent` routes) and the house `MapRoute` default (`--color-info`). This plan does not change the basemap swap, markers, `resolveTokenColor` itself, or the Map `theme` prop.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none

## Why this matters

`--accent` is gray-12: near-black in light, near-white in dark. When the theme changes while a Map with paths is mounted (Appearance menu, cross-tab change, or the OS switch under "System"), the basemap swaps scheme but the route keeps its mount-time colour. The result is a near-black line on a dark basemap, or the reverse. Markers use `bg-accent` and flip correctly, so the map ends up inconsistent.

## Context

- `src/components/catalog/map-inner.tsx:45` resolves the route colour once: `useState(() => resolveTokenColor('--color-accent', '#15171c'))`. It runs in `CatalogMapInner`, outside `<MapCanvas>` (`:61`), so it cannot read the map context. The value goes to every `<MapRoute color={routeColor}>` at `:64-70`.
- `src/components/ui/map/route.tsx:53-56` resolves the default colour with `useMemo(() => colorProp ?? resolveTokenColor('--color-info', '#3366d9'), [colorProp])`. The theme is not a dependency, so the value is also stale. The colour reaches MapLibre in two places. `addLayer` at `:78-92` reads `colorRef.current` (`useLatest`, `:58`). The paint effect at `:121-130` calls `setPaintProperty(layerId, 'line-color', color)` (`:126`) when `color` changes.
- `src/components/ui/map/resolve-token-color.ts:7-22` probes a `var(--token)` through a DOM span and a 1x1 canvas. It returns a concrete `rgb()` string, because MapLibre cannot parse oklch. The function stays unchanged.
- The existing theme mechanism: `useResolvedTheme` (`src/components/ui/map/map.tsx:105-142`) watches `data-theme` on `<html>` with a MutationObserver (`:116-125`). `Map` puts `resolvedTheme` in the context value (`:447-454`; type at `src/components/ui/map/map-context.ts:14`). Every `useMap()` consumer therefore re-renders on a scheme change. The observer fires after the attribute is stamped, so a token probe during that render reads the new scheme. The basemap swap is `setStyle` at `map.tsx:436`. It drops the route layer, and `route.tsx:78-92` re-adds it with `colorRef.current` once the style settles.
- Tokens: `--color-accent`/`--color-info` at `src/styles.css:160,170`. `--accent: var(--gray-12)` at `:408`. The dark scale is redefined under `:root[data-theme='dark']` at `:436`.
- Why not memoize on the theme: `react/exhaustive-deps` is `error` (`.oxlintrc.json:38`). A `useMemo` whose body does not read `resolvedTheme` but lists it as a dependency fails lint. A scratch probe at planning time reported "React Hook useMemo has unnecessary dependency". Suppression comments are banned. That leaves direct resolution during render (locked below).
- Why resolve inside `MapRoute`: `map-inner` sits above the map context and cannot see `resolvedTheme`; moving resolution into `MapRoute` fixes both stale sites with one mechanism.
- Only `map-inner.tsx` renders `MapRoute` (`grep -rn "MapRoute" src`). The library demo (`src/components/library/demos/map.tsx`) has no routes.
- Test exemplars: `src/components/catalog/map-inner.unit.test.tsx:1` (happy-dom directive) and `:15-31` (map modules mocked with passthroughs). The stale note at `src/components/catalog/map-inner.unit.test.ts:7-9` says map-inner calls `resolveTokenColor`. It stops being true after this plan.

Cross-phase rules (from CLAUDE.md):

- Kebab-case filenames, no barrel files. Tests go next to the source file as `*.unit.test.ts(x)`, and use happy-dom (never jsdom).
- Semantic tokens only. No `dark:` variants and no `prefers-color-scheme` in components: `data-theme` is the single scheme trigger.
- No lint-disable comments. Restructure until `react/exhaustive-deps` passes.
- Don't start dev servers. Don't run installs.
- React code follows `/Users/henry/.claude/skills/react-best-practices/SKILL.md` ("Calculate Derived State During Rendering" in `references/rerender.md`, "Store Event Handlers in Refs" in `references/advanced.md`). Comments and prop docs follow `/Users/henry/.claude/skills/code-comments/SKILL.md`.

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before you proceed. Report material drift. Don't silently replan.

## Gate

`pnpm gate` (typecheck, lint --fix, fmt, test) closes the phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If the shell's `node -v` differs from `mise current`, prefix commands with `mise exec --`.

## How to execute

- Single phase, one fresh session. The user commits.
- The orchestrator dispatches one subagent (`Task`, `subagent_type: general-purpose`) with this plan. It verifies with the gate and re-prompts the same subagent on failure.
- On success, the subagent returns a short "what changed, what to test" summary, then stops for user review.

---

## Phase 1 — Resolve route colour tokens per scheme inside MapRoute

**Goal**: after a scheme change, every mounted route's `line-color` is the token value for the new scheme. A unit test fails on HEAD and passes after the fix.

**Decisions**:

- `MapRouteProps` gains `colorToken?: \`--color-${string}\``, default `'--color-info'`. Its prop doc says the line colour follows this theme token across scheme changes and that `color`overrides it. Rewrite the`color` doc (`route.tsx:13`): a literal CSS colour that overrides `colorToken` and does not follow the theme.
- In `MapRoute`, replace the `useMemo` at `route.tsx:53-56` with direct resolution during render: `const color = colorProp ?? resolveTokenColor(colorToken, '#3366d9')`. Add one comment on why it is not memoized: the map context re-renders this component on every scheme change, so each render must read the current token. Keep the single `'#3366d9'` fallback for every token; it only fires without a 2D canvas context or computed colour.
- No module-level cache of resolved colours: the probe is cheap at `MapRoute`'s render rate, and a cache would go stale on HMR token edits. Reconsider only if profiling shows the probe on a hot path.
- Keep `colorRef`/`useLatest` and both paint paths as they are. On a scheme change, the paint effect (`:121-130`) repaints the current layer. When `setStyle` rebuilds the style, `addLayer` re-adds the layer with `colorRef.current`, which already holds the new colour. The `blank` style never triggers `setStyle`, so it relies on the paint effect alone.
- `map-inner.tsx`: delete the `useState` at `:45` and the `resolveTokenColor` import (`:7`). Pass `colorToken="--color-accent"` to each `MapRoute` in place of `color`. Drop `useState` from the React import if nothing else uses it.
- `map-inner.unit.test.ts:7-9`: fix the stale sentence. `resolveTokenColor` now runs only inside `MapRoute`.

**Scope**: in: `src/components/ui/map/route.tsx`, `src/components/catalog/map-inner.tsx`, `src/components/ui/map/route.unit.test.tsx` (new), `src/components/catalog/map-inner.unit.test.tsx`, `src/components/catalog/map-inner.unit.test.ts` (comment only). Out: `resolve-token-color.ts`, `map.tsx`, `marker.tsx`, `styles.css`, and the Map `theme` prop. A forced `theme` that differs from the document scheme would still leave token colours on the document scheme. No caller passes `theme` today, so it stays out of scope.

**Acceptance**:

- `pnpm gate` exits 0.
- New `src/components/ui/map/route.unit.test.tsx` (happy-dom). Render `MapRoute` inside `<MapContext value={…}>` (exported from `map-context.ts`) with a stub map. The stub records `addLayer` and `setPaintProperty` calls; `getLayer` returns truthy; `getSource` returns `{ setData }`; `on`, `off`, `moveLayer`, `getCanvas`, `removeLayer`, and `removeSource` are no-ops. `vi.mock` `@/components/ui/map/resolve-token-color` so it returns `` `${document.documentElement.dataset.theme}:${token}` ``. Reset `dataset.theme` after each test. Cases:
  1. No `color`/`colorToken`, `data-theme="light"` → the `addLayer` paint has `line-color` `light:--color-info`. Set `data-theme="dark"` and rerender with `resolvedTheme: 'dark'` → the last `setPaintProperty(…, 'line-color', …)` is `dark:--color-info`. This is the regression, and it fails on HEAD.
  2. `colorToken="--color-accent"` → the same flip, with `light:--color-accent` then `dark:--color-accent`.
  3. `color="#ff0000"` plus `colorToken` → `#ff0000` before and after the scheme change.
- `map-inner.unit.test.tsx`: the `MapRoute` mock (`:21-23`) records its props. A new case renders one path and asserts that the route got `colorToken: '--color-accent'` and no `color`.
- `grep -n "resolveTokenColor\|useState" src/components/catalog/map-inner.tsx` → no match.
- `grep -n "useMemo" src/components/ui/map/route.tsx` → no match.
- Manual smoke (user): open an artifact whose Map has a path. Toggle Appearance between Light and Dark. The route line flips between near-black and near-white along with the basemap and the markers. Repeat once with "System" while the OS switches scheme.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note each deviation in the final summary. Stop and report instead of improvising when:

- a locked decision is wrong or impossible,
- the work requires touching out-of-scope files,
- acceptance can't be met after a couple of honest attempts.

Plan-specific risk: if case 1 passes on HEAD before the fix, the stub or the mock is not exercising the stale path. Fix the test before you change `route.tsx`.

## Done criteria

- [ ] `pnpm gate` exits 0
- [ ] `route.unit.test.tsx` has three passing cases, and case 1 failed against HEAD's `route.tsx`
- [ ] `map-inner.tsx` passes `colorToken="--color-accent"` and no longer imports `resolveTokenColor`
- [ ] `route.tsx` has no `useMemo` and no lint-disable comment
- [ ] `docs/plans/README.md` status row updated
