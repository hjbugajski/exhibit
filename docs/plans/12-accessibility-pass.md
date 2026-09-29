# Plan 12 — Accessibility pass over navigation, tabs, filters, focus, consent, spinner and copy buttons

Fix eight screen-reader and keyboard defects: links announced as buttons, tabs with no panels, a filter trigger that hides its count, focus lost during tag rename, clipped and blank consent destinations, a spinner that pollutes button names, and copy buttons that never report their result. Out of scope: visual redesign, new features, the map controls' own markup, and any consent-flow logic beyond what the screen displays.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none

## Why this matters

The app has one owner, so reach is small, but each defect breaks a basic ARIA rule: native semantics are overridden, state changes are not announced, and focus drops to `<body>`. Two are sharper. On the consent screen, the redirect destination is the one fact an attacker cannot choose. A long dotted host is clipped, and a private-scheme URI renders blank. After this lands, every control exposes its real role, name and state, and the consent screen always shows the full destination.

## Context

- `src/components/ui/button.tsx:31-34` — the doc comment accepts `role="button"` on `render={<a>}` with `nativeButton={false}`. Base UI's non-native mode always merges `role: 'button'` (`node_modules/@base-ui/react/internals/use-button/useButton.mjs:180`). `buttonVariants` is already exported (`:46`) and has no other consumer.
- Link-as-button sites: `src/components/blocks/route-fallbacks.tsx:34`, `:51`; `src/components/account/reset-password-view.tsx:65`; `src/components/artifacts/artifact-detail.tsx:288-300` (the `target="_blank"` Open link). Tests that pin the wrong role: `route-fallbacks.unit.test.tsx:47` (`getByRole('button')`), `artifact-detail.unit.test.tsx:239-241` (comment plus query by text).
- `src/components/ui/spinner.tsx:13-16` — `role="status"`, `aria-label="Loading"` and an `oxlint-disable` comment on the svg. lucide-react 1.33 already adds `aria-hidden="true"` to an icon with no children and no a11y prop (`node_modules/lucide-react/dist/esm/Icon.mjs:36`). Consumers: `route-fallbacks.tsx:16` (standalone, the only place a status helps), `account/sign-in-view.tsx:110`, `artifacts/gallery.tsx:487`, `ui/map/controls.tsx:202` (inside `ControlButton`, which has its own `aria-label` at `:51`), and library demos `demos/button.tsx:27,31`, `demos/spinner.tsx:12,14`.
- Tabs without panels: `artifact-detail.tsx:279-286` (Rendered/Source; content is branched on `showRendered` at `:196` and rendered at `:380-419`) and `gallery.tsx:265-285` (`ViewToggle`, Grid/Table). Base UI's Tab sets `aria-controls` from the registered panel id (`node_modules/@base-ui/react/tabs/tab/TabsTab.js:179`), so with no panel it is undefined. The house `Tabs.Content` wraps `TabsPrimitive.Panel` (`ui/tabs.tsx:64-74`); Panel unmounts when inactive (`keepMounted = false`, `tabs/panel/TabsPanel.js:36`).
- `gallery.tsx:191` — `aria-label="Filter"` overrides the visible `<Badge>{activeCount}</Badge>` at `:194`. Tests query it with `findByLabelText('Filter')`: `gallery.unit.test.tsx:209` (a tag is active), `:281`, `home.unit.test.tsx:235`, `:247` (`?deleted=true` is active).
- `src/components/account/settings-view.tsx:279-368` — `TagRow`. The Rename/Delete buttons unmount while editing (`:316`), the input gets no focus (`:343`), and save (`:297`) and Cancel (`:354`) unmount the form. `TagsCard` keys rows by tag name (`:386`), so a successful rename plus `router.invalidate()` remounts the row under the new name, or merges it into an existing row. The server normalizes the new name with `normalizeTags` (`src/lib/artifacts.ts:93`). That helper is client-safe by contract (`src/lib/artifact-metadata.ts:11-12`, `:29`).
- `src/components/account/consent-view.tsx:63-64` (client name `<strong>`) and `:72` (hosts `<strong>`, joined with `", "`) have no wrap rule. `ui/card.tsx:15` is `overflow-hidden` and `account/auth-screen.tsx:20` is `max-w-sm`, so a long run of dotted labels is clipped. Tailwind 4.3.3 ships `wrap-anywhere`.
- `src/lib/account.ts:116-154` — `redirectHosts` maps each URI to `new URL(uri).host` (`:147`). A private-use redirect such as `com.example.app:/cb` yields `''`. That renders a blank destination, or a stray leading `", "`. Unit tests: `src/lib/account.unit.test.ts:70-98`.
- Copy buttons, three duplicates of the same icon ternary with a constant label and no live region: `catalog/code-block.tsx:25-39` (`Copy code`), `artifact-detail.tsx:397-412` (`Copy source`), `docs/docs-view.tsx:37-61` (`CopyField`, label from a prop). The logic already lives in `src/lib/use-copy-to-clipboard.ts` (`copy` never rejects; status resets after 1.5s). Test exemplar: `docs-view.unit.test.tsx:46-52`.
- Library contract: `src/components/library/registry.unit.test.ts` fails unless every `src/components/ui/*` file has a demo registered in `library/registry.tsx`. Demo exemplar: `library/demos/tabs.tsx`.
- Live-region exemplar: `blocks/form-status.tsx:10-13`.

Locked calls:

- The gallery view toggle uses Base UI ToggleGroup, not RadioGroup. `@base-ui/react` 1.7.0 exports `./toggle-group` and `./toggle` (`node_modules/@base-ui/react/package.json:595-612`); `Toggle` sets `aria-pressed` (`toggle/Toggle.js:77`) and the group sets `role="group"`.
- The Filter trigger keeps an explicit `aria-label`, made dynamic. Dropping it would rely on happy-dom's accessible-name whitespace between "Filter" and the badge digit, which is fragile to assert.
- `ui/map/controls.tsx` needs no change: `ControlButton`'s `aria-label` already names the button, and the spinner becomes hidden.
- The consent screen keeps its current alert logic. The fix is display-only.

Cross-phase rules: the Conventions and Design system sections of `CLAUDE.md` apply. Never silence a lint rule with a disable comment; restructure instead.

Domain skills the executor must follow:

- `/Users/henry/.claude/skills/building-components/SKILL.md` and `/Users/henry/.claude/skills/building-components/references/accessibility.md` — semantic HTML before ARIA, do not change native semantics, and live regions for async results.
- `/Users/henry/.claude/skills/web-design-guidelines/SKILL.md` — `<a>`/`<Link>` for navigation, decorative icons `aria-hidden`, async updates `aria-live="polite"`, loading copy ends with `…`, long content wraps.
- `/Users/henry/.claude/skills/code-comments/SKILL.md` — fix the stale comments at `button.tsx:31-34`, `gallery.tsx:173-176` and `artifact-detail.tsx:194-195`; do not add new ones that restate code.

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before you proceed. Report material drift. Do not replan silently.

## Gate

`pnpm gate` (typecheck, lint with fix, fmt, test) closes every phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If the shell's `node -v` is not 26, prefix with `mise exec --`.

## How to execute

- One phase per fresh session; the user commits between phases.
- The orchestrator dispatches ONE subagent per phase (`Task` tool, `subagent_type: general-purpose`) with this plan's Context, the phase's Decisions/Scope/Acceptance, and the intent. It verifies with the gate and re-prompts the SAME subagent on failure. It does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for user review.

## Phases

1. Link semantics and a decorative Spinner (ui primitives, route fallbacks, reset password).
2. Shared `ToggleGroup` primitive and `CopyButton` block, adopted by code-block and docs-view.
3. Artifacts views: detail tab panels, Open link, copy source; gallery view toggle and filter name.
4. Account views: tag-rename focus, consent wrapping, private-scheme redirect destinations.

---

## Phase 1 — Link semantics and a decorative Spinner

**Goal**: "Back to artifacts" and "Back to sign in" are exposed as links. `Spinner` adds nothing to any accessible name. The route pending screen announces "Loading…".

**Decisions**:

- A navigation element is a `<Link>`/`<a>` with `className={buttonVariants({ variant })}`, never `Button` with `render`. Rewrite the `button.tsx:31-34` doc to state this and why: Base UI forces `role="button"` in non-native mode. Remove the "query it by text" advice.
- `spinner.tsx`: delete `role`, `aria-label` and the disable comment, and rely on lucide's default `aria-hidden="true"`. Keep the signature and `data-slot`.
- `RoutePending` becomes an `<output>` element (implicit `role="status"`, which satisfies `jsx-a11y/prefer-tag-over-role` without a disable) that contains the Spinner and `<span className="sr-only">Loading…</span>`. Keep the layout classes.

**Scope**: in — `ui/button.tsx`, `ui/spinner.tsx`, `blocks/route-fallbacks.tsx`, `blocks/route-fallbacks.unit.test.tsx`, `account/reset-password-view.tsx`. Out — the Open link in `artifact-detail.tsx`, which Phase 3 owns because it rewrites that file. Button consumers need no edit: `sign-in-view`, `gallery` LoadMore, map controls, library demos.

**Acceptance**:

- `pnpm gate` exits 0.
- `grep -rn "nativeButton" src/components/blocks src/components/account` → no matches.
- `grep -rn "oxlint-disable" src/components/ui/spinner.tsx` → no matches.
- Tests in `route-fallbacks.unit.test.tsx`: `:47` becomes `getByRole('link', { name: 'Back to artifacts' })` with `href="/"`. New case: render `<RoutePending />` directly, then assert `getByRole('status')` has text `Loading…` and the svg inside it has `aria-hidden="true"`.

---

## Phase 2 — Shared ToggleGroup primitive and CopyButton block

**Goal**: A house `ToggleGroup` exists and is demoed. Every copy button announces "Copied" or "Copy failed" through one shared block.

**Decisions**:

- `src/components/ui/toggle-group.tsx` exports `ToggleGroup = { Root, Item }`. `Root` wraps `@base-ui/react/toggle-group`, keeping its `Value extends string` generic. `Item` wraps `@base-ui/react/toggle`. The visuals match the default `Tabs.List` and `Tabs.Trigger` exactly, with `data-pressed` in place of `data-active`. Reusing `tabsListVariants` from `ui/tabs.tsx` is the executor's call. The Item is 32px high, and `data-disabled` drives disabled styling.
- `src/components/library/demos/toggle-group.tsx` (a single-select Playground with a disabled control), registered in `library/registry.tsx`.
- `src/components/blocks/copy-button.tsx` exports `CopyButton({ text, label, className }: { text: string; label: string; className?: string })`. It renders a ghost `Button` with a constant `aria-label={label}` and the existing Check/X/Copy icon ternary. A sibling `<output className="sr-only">` holds `Copied` / `Copy failed` / empty from `useCopyToClipboard`. Keep the name constant: renaming a focused control announces inconsistently, and it keeps the existing name-based tests valid. Keep the output mounted at all times, because a live region that mounts together with its text is often not announced.
- Replace the duplicates in `catalog/code-block.tsx` and `docs/docs-view.tsx` (`CopyField` keeps its wrapper and passes `label` and `value` through).

**Scope**: in — `ui/toggle-group.tsx` (new), `library/demos/toggle-group.tsx` (new), `library/registry.tsx`, `blocks/copy-button.tsx` (new), `blocks/copy-button.unit.test.tsx` (new), `catalog/code-block.tsx`, `docs/docs-view.tsx`. Out — `artifact-detail.tsx` and `gallery.tsx` adoption (Phase 3).

**Acceptance**:

- `pnpm gate` exits 0, including `library/registry.unit.test.ts` and the unchanged `docs-view.unit.test.tsx`.
- `grep -n "copyStatus ===" src/components/catalog/code-block.tsx src/components/docs/docs-view.tsx` → no matches.
- Tests in `copy-button.unit.test.tsx`, modeled on `docs-view.unit.test.tsx:46-52`: clicking calls `writeText(text)`, `getByRole('status')` then reads `Copied`, and the button name is still `label`. With `writeText` rejecting, the status reads `Copy failed`. The status element exists before the first click.

---

## Phase 3 — Artifacts views

**Goal**: Rendered/Source are real tabs with panels. Grid/Table is a pressed-state toggle group. Open is a link. Copy source announces its result. The Filter trigger's name includes the active count.

**Decisions**:

- `artifact-detail.tsx`: a `Tabs.Root` wraps the toolbar, the `FormStatus` lines and the content region, with no visual change (the page column spacing stays `gap-8`, `artifact-detail.tsx:207`). For non-html artifacts, `Tabs.List` stays where it is, and the rendered and source branches move into `<Tabs.Content value="rendered">` and `<Tabs.Content value="source">`. html artifacts render no `Tabs.List`, and they show the source block outside any panel. Delete `showRendered` and its comment, and keep the html rationale in one line where the List is gated.
- The Open link is an `<a className={buttonVariants()} …>` with the same `href`, `target` and `rel`, per Phase 1.
- Copy source uses `CopyButton` with `label="Copy source"`, and keeps its absolute-position classes through `className`.
- `gallery.tsx` `ViewToggle` uses `ToggleGroup.Root` with `value={[view]}`. `onValueChange` takes the first element and calls `setView` only when one exists: single-select Base UI emits `[]` when the pressed item is clicked again, and the view must never be empty. Keep the `aria-label`s "Grid view" and "Table view" and the coarse-pointer 44px sizing. Add `aria-label="View"` on the Root.
- Filter trigger: `aria-label={activeCount > 0 ? \`Filter, ${activeCount} active\` : 'Filter'}`. Update the comment at `:173-176`.

**Scope**: in — `artifacts/artifact-detail.tsx`, `artifacts/artifact-detail.unit.test.tsx`, `artifacts/gallery.tsx`, `artifacts/gallery.unit.test.tsx`, `artifacts/home.unit.test.tsx`. Out — `routes/` (the view already lives in search params), `ui/tabs.tsx`.

**Acceptance**:

- `pnpm gate` exits 0.
- `grep -rn "nativeButton" src` → no matches.
- `grep -n "Tabs\." src/components/artifacts/gallery.tsx` → no matches.
- Tests: `artifact-detail.unit.test.tsx:239-241` queries `getByRole('link', { name: 'Open' })`. The comment goes. A spec fixture asserts `getByRole('tabpanel')`, and the selected tab's `aria-controls` equals that panel's `id`. The existing `getByRole('tab', { name: 'Source' })` clicks stay valid. `gallery.unit.test.tsx:353` queries `getByRole('button', { name: 'Table view' })`, and the Grid item has `aria-pressed="true"`. Clicking the already-pressed Grid item does not call `setView`. The Filter queries at `gallery.unit.test.tsx:209` and `home.unit.test.tsx:247` use `getByRole('button', { name: /^Filter/ })`. New case: the tags `['red','blue']` plus type `spec` give the name `Filter, 3 active`.

---

## Phase 4 — Account views

**Goal**: Tag rename never drops focus to `<body>`. The consent screen wraps long names and hosts, and it shows private-scheme destinations instead of blanks.

**Decisions**:

- `TagRow` focus contract: Rename moves focus to the "New name" input. Cancel returns focus to that row's Rename button. A failed save leaves focus in the form. A successful save moves focus to the Rename button of the row whose tag equals `normalizeTags([value])[0]`. That row may be a remounted row or an existing merge target. Use refs and effects, not `autoFocus`.
- The save handoff state lives in `TagsCard` as `focusTag: string | null`. The matching row focuses its Rename button when it becomes the target, and TagsCard then clears `focusTag`, so a later rename to the same name fires again. Prop names are the executor's call. The server fn signature does not change.
- `consent-view.tsx`: add `wrap-anywhere` to both `<strong>` elements. Keep the `", "` join.
- `redirectHosts`: when `url.host` is empty, emit `` `${url.protocol}${url.pathname}` `` (for example `com.example.app:/cb`). The entry then shows exactly where the code goes. Keep the `redirectHosts` name. Update its doc (`account.ts:116-125`) to say entries are the host, or the scheme and path for a URI without a host.

**Scope**: in — `account/settings-view.tsx`, `account/settings-view.unit.test.tsx`, `account/consent-view.tsx`, `account/consent-view.unit.test.tsx`, `src/lib/account.ts`, `src/lib/account.unit.test.ts`. Out — `src/lib/artifacts.ts` (its return shape is unchanged) and the consent alert logic.

**Acceptance**:

- `pnpm gate` exits 0.
- Tests in `settings-view.unit.test.tsx` assert `document.activeElement`: after Rename it is the `New name` input, and after Cancel it is `trips`'s Rename button. For the merge case, render `[trips, travel]`, rename `trips` to `' travel '`, and after save focus is on `travel`'s Rename button (`within` the travel row).
- Tests in `account.unit.test.ts`: `redirectHosts(['com.example.app:/cb', 'https://claude.ai/cb'])` → `['com.example.app:/cb', 'claude.ai']`. The existing cases stay green.
- Tests in `consent-view.unit.test.tsx`: a 200+ character host of dotted labels with no hyphens renders in a `<strong>` whose class contains `wrap-anywhere`. The client-name `<strong>` has the same class.
- Manual smoke for the user (the agent never runs it): register a client whose redirect is `com.example.app:/cb`, then open `/consent`. The destination reads `com.example.app:/cb`. At 375px, a long host wraps inside the card.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note the deviation in the final summary. Stop and report instead of improvising in these cases:

- a locked decision turns out to be wrong or impossible,
- the work requires touching out-of-scope files,
- acceptance can't be met after a couple of honest attempts.

Specific stop conditions: happy-dom might not register the Base UI tab panel, which leaves `aria-controls` empty in tests. If so, assert the `tabpanel` role only and report. Wrapping the detail toolbar in `Tabs.Root` might change layout in a way `gap-8` cannot restore. If so, stop and report; do not switch the detail view to ToggleGroup.

## Done criteria

- [ ] `pnpm gate` exits 0
- [ ] `grep -rn "nativeButton" src` → no matches
- [ ] `grep -n "role=\|oxlint-disable" src/components/ui/spinner.tsx` → no matches
- [ ] `src/components/ui/toggle-group.tsx` and `src/components/blocks/copy-button.tsx` exist
- [ ] `grep -rln "copyStatus ===" src` → only `src/components/blocks/copy-button.tsx`
- [ ] `grep -ln "getByRole('link'" src/components/artifacts/artifact-detail.unit.test.tsx src/components/blocks/route-fallbacks.unit.test.tsx` → both files listed
- [ ] `docs/plans/README.md` status row updated
