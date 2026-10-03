# Plan 27 — Replace hand-rolled latest-value refs with useEffectEvent

Replace every hand-rolled "latest value in a ref" pattern with React 19.2's `useEffectEvent`, and delete `useLatest`. The plan covers four places: the diagram `onDiagnostics` latch, the text-measurer scene ref, the gallery `urlQuery` ref, and the map components (`useLatest` plus the route layer listeners that re-subscribe). It fixes no live bug and changes no behavior. The work is hardening plus deleted code. It does not touch `use-canvas.ts` or any ref that holds state rather than a mirrored prop.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: M
- **Risk**: LOW
- **Depends on**: docs/plans/13-\*.md. Plan 13 rewrites `route.tsx:53-56` and creates `src/components/ui/map/route.unit.test.tsx`, which Phase 2 extends.

## Why this matters

`useLatest` (`src/components/ui/map/map-utils.ts:5-18`) syncs `ref.current` in an effect. Its own doc says it is safe only in the same component, for effects declared below the call. A child's effects read it one commit behind. `home.tsx:64-67` and `use-text-measurer.ts:188-189` repeat that ordering rule by hand. Every current caller follows the rule, so nothing is broken today. But the next edit that moves a declaration can break it silently. `useEffectEvent` has no ordering rule, because React updates it before any effect runs. It also removes the ref entries from four dependency arrays, and it stops `route.tsx` from re-subscribing its layer listeners on every parent render when the handler identities change.

## Context

- React 19.2.8: `useEffectEvent` is exported and typed (`@types/react/index.d.ts:1791`), and `react-dom/server` implements it, so SSR'd `home.tsx` and diagram code are safe. oxlint 1.79 (`react/exhaustive-deps` is `error`, `.oxlintrc.json:38`) knows Effect Events: it rejects them in dependency arrays and rejects calls outside effects.
- `useLatest` callers at HEAD: `map.tsx:276,280,317`, `marker.tsx:61`, `route.tsx:58-62`, `popup-utils.tsx:56-57`. Ref-typed deps: `map.tsx:388`, `route.tsx:95`, `marker.tsx:126`, `popup-utils.tsx:72`.
- Other hand-rolled latches: `src/components/diagram/diagram.tsx:255-265` (`notify` ref and its sync effect), `src/components/diagram/use-text-measurer.ts:188-194` (`latest` scene ref, read at `:206`), `src/components/artifacts/home.tsx:64-86` (`urlQuery` ref and the navigate effect).
- Listener churn: `route.tsx:132-158` lists `onClick`/`onMouseEnter`/`onMouseLeave` as deps. `marker.tsx:88-126` does the same job through a ref.
- Not in scope, on purpose. `src/components/diagram/use-canvas.ts:94,132` (`sceneRef`) is read by `applyFit`, a `useCallback` that handlers call outside effects. An Effect Event cannot serve a render-attached handler. `home.tsx:38` (`pushedQuery`) records this component's own last write. It is state, not a mirrored prop, so it stays a ref. `map.tsx:259-261` refs are imperative state.
- No test covers the map components' callback behavior: the only map test at HEAD is `protomaps-style.unit.test.ts`, and plan 13 adds `route.unit.test.tsx` (its stub map treats `on`/`off` as no-ops). Phases 2 and 3 therefore add characterization tests first.
- Line numbers are at `ffee99b`. Plan 13 shifts `route.tsx`. Plan 16 edits comments in `map.tsx` and `diagram.tsx`; plan 24 edits `diagram.tsx`. Re-locate by symbol, not by line.
- Existing coverage for Phase 1: `diagram.unit.test.tsx:226` (diagnostics reported) and `:428-466` (not re-invoked on parent re-render). `use-diagram.unit.test.tsx:67-105` (font refinement). `home.unit.test.tsx:131-228` (search sync, including in-flight writes and external back/forward).
- Test exemplars: happy-dom directive and map-module mocking at `src/components/catalog/map-inner.unit.test.tsx:1,15-31`. `useMap` throws without a provider (`map-context.ts:19-25`), so render inside `<MapContext value={…}>`.

Cross-phase rules (from CLAUDE.md):

- Kebab-case files, no barrels. Colocated tests `*.unit.test.ts(x)`, run with Vitest under happy-dom, never jsdom.
- No lint-disable comments. Restructure until `react/exhaustive-deps` passes.
- Effect Events are called only from effects or from listeners and timers that effects register. They never appear in a dependency array. They are never called during render and never passed as props or JSX handlers.
- Don't start dev servers or run installs.
- React code follows `/Users/henry/.claude/skills/react-best-practices/SKILL.md` and `/Users/henry/.claude/skills/react-best-practices/references/advanced.md` (rule `advanced-use-latest`, the `useEffectEvent` form). Every comment that is touched follows `/Users/henry/.claude/skills/code-comments/SKILL.md`. Comments that explain the old ref ordering are rewritten to state the remaining why, or deleted.

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before you proceed. Report material drift. Don't silently replan.

## Gate

`pnpm gate` (typecheck, lint --fix, fmt, test) closes every phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If the shell's `node -v` differs from `mise current`, prefix commands with `mise exec --`.

## How to execute

- One phase per fresh session. The user commits between phases.
- The orchestrator dispatches one subagent per phase (`Task`, `subagent_type: general-purpose`) with this plan. It verifies with the gate and re-prompts the same subagent on failure.
- On success: a short "what changed, what to test" summary, then stop for user review.

## Phases

1. Diagram and gallery latches → `useEffectEvent`.
2. Map overlays (`route.tsx`, `marker.tsx`, `popup-utils.tsx`) → `useEffectEvent`, with characterization tests first.
3. `map.tsx` → `useEffectEvent`, then delete `useLatest`.

Naming rule for all phases: a ref that held one callback becomes a forwarding Effect Event named for the action. A ref that held values, or a bag of callbacks, becomes a getter Effect Event named `read*`.

---

## Phase 1 — Diagram and gallery latches

**Goal**: no hand-rolled latest-value ref remains in `src/components/diagram` or `src/components/artifacts/home.tsx`. Existing tests pass unchanged.

**Decisions**:

- `diagram.tsx`: delete the `notify` ref and its sync effect. Add `const notifyDiagnostics = useEffectEvent((next: typeof diagnostics) => onDiagnostics?.(next))`. The effect becomes `useEffect(() => notifyDiagnostics(diagnostics), [diagnostics])`. Keep a one-line why: the consumer hears each diagnostics value once, whatever the callback identity.
- `use-text-measurer.ts`: delete `latest` and its sync effect. Add `const readSamples = useEffectEvent(() => (scene ? longestLabels(scene) : []))`, and call it inside `audit` in place of `:206-207`. The deps stay `[enabled, drawn, metrics, onRefine]`. Rewrite the `:188-189` comment: the audit samples whatever is drawn when the fonts settle, and it must not re-run per scene.
- `home.tsx`: delete `urlQuery` and its sync effect. Move the skip check and the write (`:74-85`) into `const pushQuery = useEffectEvent((next: string | undefined) => …)`. It reads `search.query` directly, and it keeps the `:76-79` comment. The event also calls `navigate`, so the effect becomes `useEffect(() => pushQuery(debouncedQuery || undefined), [debouncedQuery])`. Replace `:64-67` with the remaining why: the write reacts only to settled debounce values, and it reads the URL at write time. `pushedQuery` and the resync effect at `:43-48` are unchanged.

**Scope**: in: `src/components/diagram/diagram.tsx`, `src/components/diagram/use-text-measurer.ts`, `src/components/artifacts/home.tsx`. Out: all map files (Phases 2 and 3), `use-canvas.ts` (see Context), and all test files. Existing tests are the behavior contract, so edit a test only to report a failure.

**Acceptance**:

- `pnpm gate` exits 0, and `diagram.unit.test.tsx`, `use-diagram.unit.test.tsx`, `home.unit.test.tsx` pass with no edits.
- `grep -nE "notify\.current|latest\.current|urlQuery" src/components/diagram/diagram.tsx src/components/diagram/use-text-measurer.ts src/components/artifacts/home.tsx` → no match.
- `grep -c useEffectEvent` on each of the three files → 1 or more.

---

## Phase 2 — Map overlays

**Goal**: `route.tsx`, `marker.tsx`, and `popup-utils.tsx` no longer import `useLatest`. Route layer listeners subscribe once per layer, whatever the handler identities. New tests pin the latest-callback behavior.

**Decisions**:

- Test order: write the new tests against the HEAD code first. The latest-callback cases must pass before the refactor. The route churn case must fail before the refactor.
- `route.tsx`: `const readPaint = useEffectEvent(() => ({ color, width, opacity, dashArray, beforeId }))` replaces the five refs. The `addLayer` effect reads it once, and its deps become `[isLoaded, map, sourceId, layerId]`. `const readHandlers = useEffectEvent(() => ({ onClick, onMouseEnter, onMouseLeave }))`. The listener effect keeps its local handlers, including the cursor writes, and calls `readHandlers().onClick?.()` and the other two the same way. Its deps become `[isLoaded, map, layerId, interactive]`. The paint-sync effect (`:121-130`) is unchanged.
- `marker.tsx`: `const readCallbacks = useEffectEvent(() => ({ onClick, onMouseEnter, onMouseLeave, onDragStart, onDrag, onDragEnd }))` replaces `callbacksRef`. The handlers call `readCallbacks().x?.(…)`, and the deps become `[marker]`. Delete the `:88-89` comment. It explains a ref that no longer exists.
- `popup-utils.tsx`: `const attachPopup = useEffectEvent(attach)` and `const emitClose = useEffectEvent(() => onClose?.())`. `handleClose` stays a local arrow that calls `emitClose()`. Deps become `[map, popup, container]`.

**Scope**: in: `src/components/ui/map/route.tsx`, `src/components/ui/map/marker.tsx`, `src/components/ui/map/popup-utils.tsx`, `src/components/ui/map/route.unit.test.tsx` (extend plan 13's file), `src/components/ui/map/marker.unit.test.tsx` (new), `src/components/ui/map/popup-utils.unit.test.tsx` (new). Out: `map.tsx` and `map-utils.ts` (Phase 3; `useLatest` stays exported until then), and `popup.tsx`, which only calls `usePopupInstance`.

**Acceptance**:

- `pnpm gate` exits 0.
- `route.unit.test.tsx`, new case: render with `onClick` A, then rerender with `onClick` B. The stub's `map.on('click', layerId, …)` count stays at 1. Invoking the recorded click listener calls B, not A. The count assertion fails on the pre-refactor code. A second new case: rerender with a new `width` → `addLayer` is still called once.
- `marker.unit.test.tsx`: `vi.mock('maplibre-gl')` with a stub `Marker` that implements every method `Root`'s effects call (`getElement` returns the `element` option, getters return the defaults `Root` compares against, `on` is recorded). Render `Marker.Root` with `onClick` A inside a `MapContext` whose `map` is null, then rerender with B. Dispatching `click` on the element calls B. Firing the recorded `dragend` handler calls the latest `onDragEnd` with `{ lng, lat }`.
- `popup-utils.unit.test.tsx`: `renderHook(usePopupInstance)` with a stub popup and map. `attach` runs once on mount. After a rerender with a new `onClose`, firing the recorded `close` handler calls the new one. Unmount runs `attach`'s teardown and `popup.off('close', …)`.
- `grep -n "useLatest" src/components/ui/map/route.tsx src/components/ui/map/marker.tsx src/components/ui/map/popup-utils.tsx` → no match.

---

## Phase 3 — Map root; delete useLatest

**Goal**: `map.tsx` uses Effect Events, and `useLatest` no longer exists in `src`.

**Decisions**:

- Test order: write `map.unit.test.tsx` against the HEAD code first. Both cases must pass before and after the refactor.
- `const emitViewportChange = useEffectEvent((next: MapViewport) => onViewportChange?.(next))`, called from `handleMove`. `const readProjection = useEffectEvent(() => projection)`, read inside the `styledata` timer. `const readInitialOptions = useEffectEvent(() => ({ resolvedTheme, mapStyles, props, initialViewport: viewport ?? defaultViewport }))`, called once at the top of the mount effect. The mount-effect deps become `[clearStyleTimeout, styleReady]`.
- Rewrite `:277-279` and `:315-316` to state the remaining why. A style reload must re-apply the current projection, not the mount-time one. Creation can be deferred by `styleReady`, so the map must use the values current at creation.
- Delete `useLatest` and its doc from `map-utils.ts`, and drop the now-unused `useEffect`/`useRef` import. `removeMapLayers` stays.

**Scope**: in: `src/components/ui/map/map.tsx`, `src/components/ui/map/map-utils.ts`, `src/components/ui/map/map.unit.test.tsx` (new). Out: the theme/style swap effect and `useResolvedTheme`. They hold no latest-value ref.

**Acceptance**:

- `pnpm gate` exits 0.
- `map.unit.test.tsx` (happy-dom, fake timers). Mock `maplibre-gl` (a stub `Map` class that records `on` handlers and `setProjection` calls and implements every other method `Map` calls, plus a no-op `setWorkerUrl`), the worker `?worker&url` import, and `@/lib/map-config`. Pass `styles` so creation does not wait on the key fetch. Cases:
  1. Rerender with a new `onViewportChange`. The `Map` constructor ran once, and firing the recorded `move` handler calls the new callback with the stub's viewport.
  2. Mount with projection A, then fire `styledata` and advance 100 ms. Rerender with projection B, then fire `styledata` and advance 100 ms again. The last `setProjection` argument is B.
- `grep -rn "useLatest" src` → no match.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note each deviation in the final summary. Stop and report instead of improvising when:

- a locked decision is wrong or impossible,
- the work requires touching out-of-scope files,
- acceptance can't be met after a couple of honest attempts.

Plan-specific risks. If oxlint asks for an Effect Event in a dependency array, or rejects an Effect Event call from a listener closure an effect registers, stop and report; never suppress the rule. If `map.tsx` cannot be mounted under Vitest because the worker `?worker&url` import resists mocking, drop `map.unit.test.tsx`, report it, and add the manual smoke below to the summary.

## Done criteria

- [ ] `pnpm gate` exits 0 after each phase
- [ ] `grep -rn "useLatest" src` → no match
- [ ] `grep -rnE "notify\.current|latest\.current|urlQuery" src/components` → no match
- [ ] Route churn test failed before Phase 2's refactor and passes after
- [ ] No `eslint-disable`/`oxlint-disable` comment added
- [ ] `docs/plans/README.md` status row updated

Manual smoke (user): open an artifact with a map that has markers and a path. Pan the map, hover and click a marker, and toggle Light/Dark. The route redraws in the new scheme, and popups still open and close. In the gallery, type a query, then press Back. The box resyncs, and the URL does not bounce.
