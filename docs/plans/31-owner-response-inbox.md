# Plan 31 — Direction: let Claude find fresh owner responses (stateUpdatedAt sort/filter)

Give MCP `list_artifacts` a `state-updated-desc` sort and two filters, `hasState` and `stateSince`, so Claude can find the artifacts the owner answered most recently without paging through everything. Point the `list_artifacts` and `get_artifact` descriptions at the sort instead of "your last check". This plan does not add answered counts to MCP responses, add gallery filter UI, or add an index.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none

## Why this matters

`README.md:7` names the feedback-form loop as a headline feature: interactive components persist owner input and Claude reads it back later. Claude has the data (`list_artifacts` rows carry `stateUpdatedAt`), but no way to order or filter by it. Both tool descriptions tell Claude to "compare against your last check", which Claude cannot remember across conversations. So "what did I respond to?" costs Claude a full paged listing and a manual scan.

## Context

- `src/lib/artifact-sorts.ts:5-12` — `artifactSorts`, the client-safe enum shared by the repository, the gallery server fn (`src/lib/artifacts.ts:56`), the route search validator (`src/routes/_authed/index.tsx:33-35`), and the MCP schema (`src/lib/mcp/server.ts:461`). A new member flows to all four.
- `src/components/artifacts/gallery.tsx:39-46` — `sortLabels: Record<ArtifactSort, string>`. The `Record` type forces a label for any new sort; `:48` derives the dropdown options from it.
- `src/database/repository.ts:74-94` — `ListArtifactsInput` and its doc comment. `:80-82` is the cost rule: only the gallery opts into `withAnswers`; MCP leaves it off.
- `src/database/repository.ts:161-186` — `SortField`, `sortSpecs`, `sortColumnExpr`. `:188-218` — cursor type, `encodeCursor`, `cursorSchema` (`k: number | string`), `decodeCursor`.
- `src/database/repository.ts:417-509` — `listArtifacts`. Conditions build at `:422-453`, the keyset condition at `:455-468` compares `sortColumnExpr(field)` to the cursor's `k`, and the select always left-joins `artifact_states` (`:475`, `:495`). `sortKey` (`:492`) is what the cursor stores.
- `src/database/schemas/artifact-state.ts:10-16` — one row per artifact, `updated_at` not null; a missing row means untouched. `setArtifactState` (`src/database/repository.ts:688`) stamps `Date.now()`.
- `src/database/schemas/artifact.ts:19-22` — indexes cover the updated and created sorts only; the title sort already runs unindexed.
- `src/lib/mcp/server.ts:436-496` — `list_artifacts`: description `:441`, sort `.describe` `:460-465`, handler `:477-495`. `artifactRow` (`:129-141`) already returns `stateUpdatedAt`.
- `src/lib/mcp/server.ts:569-621` — `get_artifact`: description `:574`; the payload (`:602-618`) already returns raw `state` and `stateUpdatedAt`.
- Tests: `src/database/repository.unit.test.ts:410` (updated-desc keyset pagination with a mocked `Date.now`), `:479` (mismatched-sort cursor), `:503` (query-plan index test), `:516` (`stateUpdatedAt` per item). `src/lib/mcp/server.int.test.ts:379` (`describe('list_artifacts')`), `:540` (`stateUpdatedAt` through MCP).

Locked non-goals:

- No `answers` on `get_artifact`. It already returns the body and raw state, so Claude can derive answered/total. See Open questions.
- No index. The sort key is a coalesced column of a left-joined table, so no single index on either table serves the ORDER BY. The gallery is single-owner scale, and the title sort sets the unindexed precedent.

Overlap with other plans: plan 18 rewrites every `server.ts` description to controlled English and later greps for `—` and `e.g.` in `server.ts`. Plan 23 edits `repository.ts` update paths, line-disjoint from `listArtifacts`. If either landed first, locate code by symbol, not line number. New description text must already pass plan 18's rules so a later sweep has nothing to change.

Cross-phase rules (from CLAUDE.md):

- Constants the client imports live in client-safe modules (`artifact-sorts.ts`), never in `repository.ts`.
- `/mcp` stays Bearer-authed; gallery server fns keep `sessionMiddleware`.
- Don't start dev servers.

Domain skills the executor must follow:

- `/Users/henry/.claude/skills/writing-style/SKILL.md` and, for tool descriptions and `.describe()` strings (agent-parsed text), `/Users/henry/.claude/skills/writing-style/references/controlled-english.md`. The gallery label follows the UI-copy rules in `/Users/henry/.claude/skills/writing-style/references/surfaces.md`.
- `/Users/henry/.claude/skills/code-comments/SKILL.md` for the `ListArtifactsInput` and `sortSpecs` doc comments.

## Gate

`pnpm gate` (typecheck, lint --fix, fmt, test) closes the phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If the shell's `node -v` is not 26, prefix with `mise exec --`.

## How to execute

- Single phase, one fresh session; the user commits.
- The orchestrator dispatches ONE subagent with this plan's Context and the phase below, verifies with the gate, and re-prompts the same subagent on failure.
- On success: a short "what changed, what to test" summary, then stop for user review.

## Phase 1 — State-updated sort and response filters

**Goal**: `list_artifacts` with `sort: 'state-updated-desc', hasState: true` returns the owner's most recently answered artifacts first and paginates stably. The gallery offers the same sort.

**Decisions**:

- `artifactSorts` gains `'state-updated-desc'`, appended last. Descending only: the use is "newest responses first", and an ascending variant has no caller.
- `SortField` gains `'stateUpdatedAt'`; `sortSpecs['state-updated-desc'] = { field: 'stateUpdatedAt', dir: 'desc' }`. `sortColumnExpr('stateUpdatedAt')` returns `` sql<number | string>`coalesce(${artifactStates.updatedAt}, 0)` `` (the existing return type). Why: the keyset condition and `sortKey` both use this one expression, so an untouched row gets `k: 0` (a number `cursorSchema` already accepts), and `eq`/`lt` never meet a NULL. Untouched rows sort after every touched row, ties broken by `id desc`. `encodeCursor`, `cursorSchema`, and `decodeCursor` stay unchanged. The expression depends on the left join at `:495`, which is unconditional; keep it so.
- `ListArtifactsInput` gains `hasState?: boolean` and `stateSince?: number`. `hasState: true` adds `isNotNull(artifactStates.updatedAt)`, `false` adds `isNull(...)`, omitted adds nothing. `stateSince` adds `gte(artifactStates.updatedAt, stateSince)`: inclusive, epoch milliseconds, and it excludes untouched rows because a NULL comparison fails. Document both fields in the existing doc comment at `:74-83`, next to the `archived`/`deleted` semantics.
- MCP `list_artifacts` input gains `hasState: z.boolean().optional()` and `stateSince: z.number().int().nonnegative().optional()`, passed straight through. `withAnswers` stays off (cost rule `:80-82`). The sort `.describe` lists `state-updated-desc` ("last owner interaction; untouched artifacts last").
- Description text, controlled English, no em dash, no `e.g.`: the `list_artifacts` description drops "compare against your last check…" and says that to find fresh owner input, Claude passes `sort: "state-updated-desc"` and `hasState: true`, and that `stateSince` limits the result to input at or after a timestamp. The `get_artifact` description drops the same phrase and names that `list_artifacts` sort instead. Every other fact in both descriptions survives.
- Gallery: `sortLabels['state-updated-desc'] = 'Recently answered'`, matching the gallery's "answered" vocabulary. No filter UI; `listArtifactsFn`'s schema (`src/lib/artifacts.ts:50-59`) gets no new fields.

**Scope**: in: `src/lib/artifact-sorts.ts`, `src/database/repository.ts` (`listArtifacts` and its sort helpers only), `src/lib/mcp/server.ts` (`list_artifacts` schema and handler, the two descriptions), `src/components/artifacts/gallery.tsx` (one label), and the two test files. Out: `get_artifact` payload, answer counts over MCP, migrations and indexes, and the other `server.ts` descriptions (plan 18).

**Acceptance**:

- `pnpm gate` → exit 0.
- `grep -n "last check" src/lib/mcp/server.ts` → no matches.
- `grep -c "state-updated-desc" src/lib/mcp/server.ts` → at least 2 (sort describe and description).
- Tests to add in `src/database/repository.unit.test.ts` `describe('listArtifacts')`, modeled on `:410` and `:516`:
  - `state-updated-desc` orders touched artifacts by state time, newest first, then untouched artifacts, even when `updatedAt` order disagrees.
  - Keyset pagination with `limit: 2` across a page boundary that falls between the last touched row and the first untouched row returns every row exactly once, and the final `nextCursor` is null.
  - `hasState: true` returns only touched rows; `hasState: false` returns only untouched rows.
  - `stateSince` equal to a row's state time includes that row; one millisecond later excludes it; untouched rows never match.
- Test to add in `src/lib/mcp/server.int.test.ts` `describe('list_artifacts')`, modeled on `:540`: after `setArtifactState` on the second of two published specs, `{ sort: 'state-updated-desc', hasState: true }` returns only that artifact, and `{ stateSince: -1 }` returns an MCP validation error.
- Manual smoke for the user: in the gallery, Sort → "Recently answered" puts the artifact you last checked a box on first; the URL gains `?sort=state-updated-desc` and survives a reload.

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope; note the deviation in the final summary. Stop and report instead of improvising when:

- a locked decision turns out to be wrong or impossible (for example, Drizzle types reject `coalesce` in `SQL<number | string>`),
- the work requires touching out-of-scope files,
- acceptance can't be met after a couple of honest attempts.

## Done criteria

- [ ] `pnpm gate` exits 0
- [ ] `grep -n "last check" src/lib/mcp/server.ts` → no matches
- [ ] `grep -n "state-updated-desc" src/lib/artifact-sorts.ts src/components/artifacts/gallery.tsx` → one match in each
- [ ] The new repository and MCP tests exist and pass
- [ ] `docs/plans/README.md` status row updated

## Open questions

- Add `answers: { answered, total }` to `get_artifact` via `countAnswers`? One parse of one body, so no cost problem, but Claude can already derive it from `body` and `state`. Default: no. Revisit if Claude transcripts show it miscounting answers. (Phase 1)
- Should `hasState` accept only `true`? `false` ("never answered") is cheap and symmetric with `archived`. Default: accept both. (Phase 1)
