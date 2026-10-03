# Plan 06 — Keep owner answers consistent: stale reseed, save-error reset, uncounted invalid fences, statePath collisions

Fixes four defects that corrupt or misreport the owner's interaction state: the detail view seeding its store from cached loader data older than the server copy, a save-error banner that never clears, answer counts that include questions the markdown renderer never shows, and statePaths that overlap by prefix and overwrite each other. It does not change the state storage model (per-artifact, wholesale replace), add a retry control, or re-validate stored bodies.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: M
- **Risk**: MED — Phase 1 adds a blocking load on detail re-entry (a spinner after 300 ms on a cold tap); Phase 4 makes publishes with overlapping paths fail.
- **Depends on**: none

## Why this matters

State lives once per artifact and every save replaces it wholesale (`src/database/repository.ts:688`). If the view mounts from a stale snapshot, the next edit erases answers the server already has. Claude then reads corrupted answers through `get_artifact`. The other three defects make the owner distrust what the page reports: an error that stays after later saves succeed, "awaiting your reply" for a question that cannot render, and two inputs that erase each other.

## Context

- `src/components/artifacts/artifact-detail.tsx` — `saveStatus` state `:91`; the store is seeded from `detail.state` once per mount and on a `versionKey` change `:104-114`; the chained save `:127-135` sets the error only in `catch` `:131-133`; the debounce `:137-146`; the unmount flush `:148-157`; `handleVersionChange` `:160-166` and `handleRestoreVersion` `:170-176` navigate with no flush; the banner `:376`.
- `src/routes/_authed/a.$id/index.tsx:6-20` and `src/routes/_authed/a.$id/v.$n.tsx:7-27` — the two detail routes. Neither sets `gcTime`/`staleTime`/`staleReloadMode`, and `src/router.tsx:13-24` sets no cache defaults.
- Router cache mechanics (`@tanstack/router-core` 1.171.26, `node_modules/.pnpm/@tanstack+router-core@1.171.26/node_modules/@tanstack/router-core/dist/esm/`): exiting successful matches are cached for `gcTime ?? 5 min` (`load-client.js:763`). On re-entry a cached `success` match renders its old `loaderData` at once and reloads in the background unless `staleReloadMode` is `'blocking'` (`load-client.js:335-349`). `router.invalidate` (`router.js:510-547`) only marks matches `invalid`: an invalidated cached match still renders stale first, and the call reloads the current route.
- `src/lib/answer-count.ts` — a fence counts once its JSON parses `:78-85`; the walk descends into every `component` node's children even when `resolveCatalogDirective` rejects it `:87-103`.
- `src/components/markdown/catalog-dispatch.tsx` — `ExhibitBlock` `:136-162` builds a one-element spec and renders `ExhibitError` when `validateArtifactSpec` fails; `CatalogDirective` returns `null` for an unresolved directive and drops its subtree `:79-84`. `src/catalog/directive.ts:1-13` is the model for a shared, React-free acceptance test used by both the renderer and the count.
- `src/catalog/validate.ts` — `collectStatePaths` `:72-91`; `findDuplicateStatePathErrors` flags only exact matches `:97-128`. `src/catalog/catalog.ts:30-33` allows nested pointers (`/^\/[\w/-]+$/`, no `~` escapes). `@json-render/core` `immutableSetByPath` replaces a non-object parent with `{}` (`node_modules/@json-render/core/dist/chunk-7V7ZCHEJ.mjs:596-613`). Result: a Rating at `/feedback` and a NoteBox at `/feedback/note` erase each other.
- `src/lib/mcp/server.ts` — `validateSpecOrError` `:95-113` is the structured isError pattern. `publish_markdown` checks only size `:265-288`. `update_artifact` gives markdown no body check `:368-374`.
- `src/catalog/fixtures` contains no segment-prefix statePath overlaps, so Phase 4 breaks no fixture.

Cross-phase rules (from CLAUDE.md): kebab-case files, no barrels; tests colocated as `.unit.test.ts(x)` / `.int.test.ts`, helpers from `@testing/*`; env only through `src/lib/env.ts`; semantic tokens only; `src/catalog/*` modules reached from answer-count must stay React-free; no `dangerouslySetInnerHTML`; never add a lint-disable comment. The routes folder holds routes only, but colocated tests may sit there (`tsr.config.json` ignores `*.test.*`).

Executors must follow: `/Users/henry/.claude/skills/tdd/SKILL.md` (red first, one seam per cycle, the seams are the Acceptance tests below), `/Users/henry/.claude/skills/react-best-practices/SKILL.md` (`rerender-use-ref-transient-values`, `rerender-move-effect-to-event`), `/Users/henry/.claude/skills/code-comments/SKILL.md` (update every comment these changes make stale; add no narration).

If the code has drifted from this section since `Planned at`, re-check the decision it supports before proceeding; report material drift rather than silently replanning.

## Gate

`pnpm gate` (typecheck, lint --fix, fmt, test) closes every phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If `node -v` differs from `mise current`, prefix the command with `mise exec --`. Do not start a dev server.

## How to execute

- One phase per fresh session; the user commits between phases.
- The orchestrator dispatches ONE subagent per phase (`Task` tool, `subagent_type: general-purpose`) with a self-contained brief: this plan's Context, the phase's Decisions/Scope/Acceptance, and intent. It verifies with the gate and re-prompts the SAME subagent on failure. It does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for user review.

## Phases

1. Detail view never seeds from state older than the server's copy.
2. Clear the save error on the next successful save.
3. Count only the questions the markdown renderer renders.
4. Reject statePath prefix overlaps in specs and markdown bodies.

---

## Phase 1 — Never seed the store from stale state

**Goal**: Re-entering an artifact (from the gallery, or by switching versions and back) always mounts with the server's current state. An edit made inside the debounce window reaches the server before a version switch loads the next view.

**Decisions**:

- Set `gcTime: 0` on both detail routes (`a.$id/index.tsx`, `a.$id/v.$n.tsx`). An exiting match is then dropped, and re-entry performs a fresh blocking load. Rejected alternatives: `router.invalidate` after each save (a cached `success` match still renders stale first, and each save would reload the current route); updating cached `loaderData` (no public API, and state is shared across every version's match id); reseeding the store from background-reloaded data (races local edits mid-session). Set no router-wide default, because other routes keep their cache.
- The flush is exposed through a ref: `const flushSaveRef = useRef<() => Promise<void>>(...)`. The save effect assigns it. The flush clears the timer, saves any `pendingSnapshot` through the existing chain, and resolves when `inFlight` settles. `handleVersionChange` and `handleRestoreVersion` await it before they navigate (restore also navigates to a route whose loader reads state). They navigate even when that save failed; the view stays mounted (keyed by id), so Phase 2's banner still reports it. The unmount flush stays for navigation that leaves the component.
- Update the stale comments at `artifact-detail.tsx:98-103` and in both route components (`index.tsx:26-27`, `v.$n.tsx:33-34`) so they state why the match is not cached.

**Scope**: in: the two detail route files, `artifact-detail.tsx`, `artifact-detail.unit.test.tsx`, one new route test. Out: the save-error UI (Phase 2); gallery answer-count freshness (not reported); a save that the unmount flush sends while the owner re-enters within milliseconds (residual race, accepted).

**Acceptance**:

- Gate exits 0.
- New `src/routes/_authed/a.$id/loader-cache.unit.test.ts`: imports `Route` from both route files, with `@/lib/artifacts` mocked as in `artifact-detail.unit.test.tsx:16-22` plus `getArtifactDetailFn`, and asserts `Route.options.gcTime === 0` for each. A comment names the regression.
- `artifact-detail.unit.test.tsx`, beside the flush test at `:317-336`: toggle an item, then pick v1 in the Version select inside the debounce window with `saveArtifactStateFn` held pending. Assert that the save is called with the edit, that the view is still mounted while the save is pending, and that after resolution the router has navigated (the `/a/$id/v/$n` dummy route renders `null`, so the checklist is gone). Mount with `makeChecklistDetail({ version: 2 })`.
- Manual smoke (user): check an item, go to the gallery, reopen the artifact at once on a touch viewport, and the item is still checked. Check an item, switch to v1 within half a second, and v1 shows the item checked.

---

## Phase 2 — Clear the save error on success

**Goal**: The save-error banner shows only while the most recent save attempt has failed.

**Decisions**:

- In `save` (`artifact-detail.tsx:127-135`), call `setSaveStatus(null)` after `saveArtifactStateFn` resolves. Do not clear on the `versionKey` reseed: Phase 1 flushes a pending save just before a version switch, and a reseed clear would hide that save's failure.
- Change the copy to the declarative state `'Your latest changes are not saved.'`. "Try again" points to a control that does not exist. Any new edit re-saves.

**Scope**: in: `artifact-detail.tsx`, `artifact-detail.unit.test.tsx`. Out: a retry button (not requested).

**Acceptance**:

- Gate exits 0.
- Update the test at `artifact-detail.unit.test.tsx:374-384` to the new copy. Add a test: the first save rejects and the alert shows; a second toggle's save resolves; `screen.queryByRole('alert')` is `null`.

---

## Phase 3 — Count only rendered questions

**Goal**: A markdown fence that fails catalog validation, and any question inside an unresolved directive wrapper, adds nothing to `countAnswers`. Valid content counts exactly as before.

**Decisions**:

- New React-free `src/catalog/exhibit-fence.ts` exports `resolveExhibitFence(json: string): ArtifactValidationResult | null`. It returns `null` when the JSON does not parse to an object with a string `type`. Otherwise it returns `validateArtifactSpec` of the one-element spec `{ root: 'exhibit', elements: { exhibit: { type, props: props ?? {}, children: [] } } }`. Its doc comment follows `directive.ts:1-13`: one acceptance test shared by renderer and count.
- `ExhibitBlock` (`catalog-dispatch.tsx:136-162`) uses it and keeps both existing error messages. `null` maps to the "isn't a JSON object with a `type`" message.
- `markdownStatePaths` (`answer-count.ts:57-109`): a fence counts only when `resolveExhibitFence` returns `valid: true`. Collect from `result.spec.elements.exhibit.props`, never from the raw object. A `component` node that `resolveCatalogDirective` rejects returns without walking its children, which mirrors `catalog-dispatch.tsx:82-84`. Update the comments at `answer-count.ts:80` and `:88-90`.

**Scope**: in: `exhibit-fence.ts` (new), `catalog-dispatch.tsx`, `answer-count.ts`, `answer-count.unit.test.ts`. Out: spec-artifact counting (spec bodies are validated at publish); the return shape of `markdownStatePaths` (Phase 4).

**Acceptance**:

- Gate exits 0; `catalog-dispatch.unit.test.tsx` stays green unchanged (refactor safety net).
- `answer-count.unit.test.ts`, modelled on `:122-144`, each case expecting `{ answered: 0, total: 0 }`: a Rating fence missing its required `label`; a fence with a statePath but no string `type`; a valid Rating fence inside `<!-- ::start:Nope -->…<!-- ::end:Nope -->`; a valid NoteBox directive inside the same unknown wrapper. The existing nested-in-Card test (`:100-120`) still counts 1.

---

## Phase 4 — Reject overlapping statePaths

**Goal**: A spec or markdown body where one statePath equals another, or is a segment prefix of another (`/feedback` and `/feedback/note`), fails `publish_spec`, `publish_markdown` and `update_artifact` with a structured isError.

**Decisions**:

- Overlap rule, in segments: split each path after the leading `/` on `/`. Two occurrences conflict when one segment list equals the other or is a prefix of it. `/feedback/backup` and `/feedback/backup-decision` do not conflict. The same element may conflict with itself (two Checklist items).
- `validate.ts` exports `findStatePathConflicts(entries: { key: string; path: string }[])`. It returns one record per exact-duplicate path (all owning keys, as today) plus one record per prefix-conflicting pair, each with the paths and owning keys. `findDuplicateStatePathErrors` becomes a mapper from those records to `ArtifactSpecError` (`path: 'statePath'`). The exact-duplicate message stays as it is. The prefix message names both paths and says that a write to the shorter path replaces the longer path's value.
- `answer-count.ts` exports `markdownStatePaths(body): { key: string; path: string }[]`, where `key` is the component name (fence `type` or `resolved.name`). `countAnswers` maps it to paths. The collision check then covers exactly the rendered questions from Phase 3.
- `server.ts` gets `markdownStatePathsOrError(markdown)` beside `validateSpecOrError`. It returns `errorResult(summary, { errors })` with `ArtifactSpecError` entries (`element: null`, `component: key`). `publish_markdown` calls it after the size check. `update_artifact` uses it in place of `null` for markdown, and the comment at `:368` is updated.

**Scope**: in: `validate.ts`, `validate.unit.test.ts`, `answer-count.ts`, `server.ts`, `server.int.test.ts`. The `publish_markdown` tool description gains one clause: overlapping statePaths are rejected. Out: re-validating stored bodies (existing artifacts render as before).

**Acceptance**:

- Gate exits 0.
- `validate.unit.test.ts`, modelled on `:183-220`: a Rating at `/feedback` plus a NoteBox at `/feedback/note` is invalid, and the message contains both paths; `/feedback/backup` next to `/feedback/backup-decision` stays valid; two items in one Checklist at `/a` and `/a/b` are invalid.
- `server.int.test.ts` `publish_markdown` block: a body with a Rating directive at `/feedback` and a NoteBox fence at `/feedback/note` returns `isError: true` with `structuredContent.errors[0].path === 'statePath'`. `update_artifact` rejects the same body on a markdown artifact, and the version stays at 1.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note the deviation in the final summary. Stop and report instead of improvising when a locked decision turns out to be wrong or impossible, the work requires touching out-of-scope files, or acceptance can't be met after a couple of honest attempts. Specific risk: if importing a route module under the node test environment fails on a browser API, add the `// @vitest-environment happy-dom` pragma rather than restructuring the route.

## Done criteria

- [ ] `pnpm gate` exits 0
- [ ] `grep -n "gcTime: 0" src/routes/_authed/a.\$id/index.tsx src/routes/_authed/a.\$id/v.\$n.tsx` shows two matches
- [ ] `grep -rn "Could not save your changes" src/` shows no matches
- [ ] `grep -n "resolveExhibitFence" src/lib/answer-count.ts src/components/markdown/catalog-dispatch.tsx` shows both files
- [ ] `grep -n "size is the only check" src/lib/mcp/server.ts` shows no matches
- [ ] `docs/plans/README.md` status row updated

## Open questions

- Phase 1: the blocking load on re-entry shows `RoutePending` after 300 ms on touch (desktop hover-preload usually hides it). Default: accept it, because correctness outweighs the spinner.
- Phase 4: markdown bodies that reuse one exact statePath in two places are now rejected, as specs already are. Default: reject, for parity with `validate.ts`.
