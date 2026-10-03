# Plan 17 — Remove banner comments and journal-tense comments; move misplaced doc comments

Delete every section-divider banner in the diagram subsystem, rephrase the journal-tense comments as present-tense rationale, and move doc comments that sit on the wrong declaration onto the exports they describe. This plan changes comments only. It does not change code, split large files, or audit comments outside the files named here.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: S
- **Risk**: LOW
- **Depends on**: docs/plans/24-\*.md (plan 24 edits `src/components/diagram/diagram.tsx`, `src/lib/diagram/families/flowchart/parse.ts` and its unit test, which hold 19 of the banners; running this plan first churns the same hunks)

## Why this matters

The diagram subsystem carries 84 banner comments (`// ---- label`, `/* ---- label */`) that restate what the named functions, types, and CSS selectors already show; they are the only banners in the repo. Seven comments in six files narrate history ("used to", "turned out to be a red herring", "before this was extracted"), which ages badly and belongs in commits. Six exports in four files lack hover docs because the doc sits on a private neighbor or inside the handler body. Low severity, no runtime effect; the cost is reader noise and lost hover docs.

## Context

- Domain skill (the executor must read and follow it): `/Users/henry/.claude/skills/code-comments/SKILL.md`. Banners and journal comments are "cruft — delete on sight"; doc comments document the contract (side effects, error behavior), not the implementation. Its "Prose style" section points at `/Users/henry/.claude/skills/writing-style/references/controlled-english.md` for rewritten prose.
- Banners (verified at `ffee99b`): `git grep -nE '^[[:space:]]*// -{10,}' -- src testing` finds 74 lines in 16 files. Use `[[:space:]]`, not `\s`: this git grep silently misses indented lines with `\s` (53 in 13 files). Per-file counts: `src/lib/diagram/types.ts` 7, `src/components/library/demos/diagram.tsx` 7, `src/lib/diagram/families/flowchart/parse.unit.test.ts` 9, `src/components/diagram/diagram.tsx` 6, `src/components/diagram/sequence-parts.tsx` 6, `src/lib/diagram/families/sequence/layout.ts` 6, `src/lib/diagram/core/graph/layout-graph.ts` 5, `src/lib/diagram/families/flowchart/parse.ts` 4, `src/lib/diagram/families/gantt/layout.ts` 4, `src/components/diagram/gantt-parts.tsx` 4, `src/components/diagram/graph-parts.tsx` 4, `testing/diagram/invariants.ts` 4, `src/lib/diagram/families/gantt/time.ts` 3, `src/components/diagram/canvas-parts.tsx` 3, `src/lib/diagram/core/graph/model.ts` 1, `src/lib/diagram/families/flowchart/ir.ts` 1. Some are indented (inside `describe` blocks and functions). Every banner sits alone between blank lines, for example `src/lib/diagram/types.ts:69` and `src/lib/diagram/core/graph/layout-graph.ts:60`.
- CSS banners: `src/components/diagram/diagram.css:210,252,295,319,348,446,509,543,621,686` (10 lines, `/* ---- nodes */` and similar). oxfmt 0.64 formats CSS (`oxfmt --check src/components/diagram/diagram.css` passes at HEAD), so the gate collapses the double blank lines that deletion leaves.
- Journal comments:
  - `testing/server.ts:34-36`: the parenthetical "(This turned out to be a red herring ... so it stays fixed.)".
  - `testing/server.ts:57-59`: "Uncaught, that turned an empty session cookie into ... looked exactly like a real auth bug. Fixed at the source:" inside the `waitUntilNitroReady` doc (`:63`).
  - `src/lib/resolve-artifact-version.ts:15`: "(status/shape is the same 401/400/404 both routes already returned before this was extracted)".
  - `src/lib/diagram/core/graph/cluster.ts:222`: "which is what this used to be" in the `titlePad` doc.
  - `src/lib/diagram/core/graph/gutter.ts:145`: "This used to be a model of that route" in the `drawnIsClear` doc.
  - `src/lib/diagram/core/graph/spacing.ts:6`: "all three used to sweep once from the low end" in the module comment.
  - `src/lib/auth.ts:137`: "1.7 replaced `validAudiences` with ..."; `:139-140` "Pre-1.7 behavior ... would 403 existing clients" explains why `enforcePerClientResources: false`.
- Misplaced or missing doc comments:
  - `src/lib/theme.ts:81-85`: the `subscribeThemePreference` doc sits on the private `themeListeners` (`:86`); the export at `:88` has none. `setThemePreference` (`:105`) has no doc; it persists (`'system'` as absence), stamps `<html>`, notifies subscribers, and swallows storage failure (`:106-127`).
  - `src/lib/session-middleware.ts:14-20`: the doc on `requireSession` explains `sessionMiddleware` ("`sessionMiddleware` below is that check"); `sessionMiddleware` (`:29`) has no doc. `:5-12` is a detached `/**` module rationale stacked above that doc.
  - `src/lib/account.ts:196-200`: the revocation contract of `revokeMcpConnectionFn` (`:192`) is a line comment inside the handler. The `azp` check it cites is real: `src/lib/mcp/auth.ts:102` in `verifyMcpBearer` (`:83`).
  - `src/lib/artifacts.ts:65-66`: `listArtifactsFn` (`:61`) always computes answered counts (a body fetch and a parse per row); stated only inside the handler. `getArtifactDetailFn` (`:127`) returns `null` for a missing artifact or version, while `updateArtifactMetadataFn` (`:156-157`) documents that it throws.
- Convention exemplars: module-level rationale uses a plain `/*` block (`src/lib/diagram/core/graph/spacing.ts:1`); doc one-liner on an export, `/** Throws for unknown ids; a null description clears it. */` (`src/lib/artifacts.ts:156`).
- Cross-phase rules: comment-only edits; no code, rename, or import changes. `pnpm gate` runs `oxfmt` in write mode, so blank-line cleanup is the formatter's job.

## Gate

`pnpm gate` (typecheck, lint with fix, fmt, test) closes every phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If `node -v` does not match `.node-version` (26), prefix with `mise exec --`.

## How to execute

- One phase per fresh session; the user commits between phases.
- The orchestrator dispatches ONE subagent per phase (`Task` tool, `subagent_type: general-purpose`) with a self-contained brief: this plan's Context, the phase's Decisions/Scope/Acceptance, and intent. It verifies with the gate and re-prompts the SAME subagent on failure; it does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for user review.

## Phases

1. Delete all 84 banner comments in the diagram subsystem.
2. Rephrase the seven journal-tense comments as present-tense rationale.
3. Move or add doc comments on six exports in four files.

---

## Phase 1 — Delete banner comments

**Goal**: No section-divider banner remains in `src/` or `testing/`.

**Decisions**: Delete each banner line outright; do not replace it with a shorter label, a `#region`, or a doc comment. Where the label carried information the code does not show (none found at HEAD), stop and report instead of rewording. Do not split `layout-graph.ts` (1743 lines) or any other file to compensate for lost navigation; the editor symbol outline covers it. The phase touches 17 files, over the usual ~6 cap, because every edit is the same one-line deletion with no judgment.

**Scope**: in — the 16 TS/TSX files and `src/components/diagram/diagram.css` listed in Context. Out — every other comment in those files (Phase 2 and Phase 3 own the prose edits; other comments are out of this plan).

**Acceptance**:

- `git grep -nE '^[[:space:]]*// -{10,}' -- src testing` → no output.
- `git grep -nE '/\* -{10,}' -- src testing` → no output.
- `git diff --numstat` → every changed file shows 0 added lines (deletions only).
- Gate exits 0.

---

## Phase 2 — Rephrase journal-tense comments

**Goal**: Each journal comment states its rationale in the present tense, and every rejected alternative is kept.

**Decisions**:

- `testing/server.ts:34-36`: delete the red-herring parenthetical; keep the port-collision reason for `ws: false`. `:57-59`: keep the failure mode (a Nitro-runner 503 makes sign-in yield an empty cookie, and every later call reads as `Unauthorized`), stated as what happens without the wait; delete "Uncaught, that turned", "looked exactly like a real auth bug", and "Fixed at the source".
- `src/lib/resolve-artifact-version.ts:15`: delete the parenthetical. The remaining sentence ("callers own the `ok: false` response verbatim") is the contract.
- `cluster.ts:222`, `gutter.ts:145`, `spacing.ts:6`: rewrite as "the obvious alternative X fails because Y", present tense, with no "used to". Keep every technical reason (half a padding masks the arrow tail; a modelled elbow sits up to half a node from the drawn one; a single low-end sweep leaves the group lopsided).
- `src/lib/auth.ts:137`: state what the list does now (it seeds the provider's resource rows); drop the `validAudiences` history. `:139-140`: keep the 1.7 reference, because the reason for `enforcePerClientResources: false` is that clients registered before 1.7 have no `oauthClientResource` link rows. Rephrase lightly so that it reads as a constraint, not as a changelog.
- Leave the regression comments in tests as they are (`src/lib/diagram/families/flowchart/parse.unit.test.ts:319`, `src/components/diagram/diagram.unit.test.tsx:220`, `src/lib/mcp/server.int.test.ts:663`, `src/components/artifacts/home.unit.test.tsx:50`): a test states the bug it pins. `src/lib/diagram/core/geometry/path.ts:132` ("nothing it used to clear") describes geometry before smoothing, not history; leave it.

**Scope**: in — `testing/server.ts`, `src/lib/resolve-artifact-version.ts`, `src/lib/diagram/core/graph/cluster.ts`, `src/lib/diagram/core/graph/gutter.ts`, `src/lib/diagram/core/graph/spacing.ts`, `src/lib/auth.ts`. Out — any non-comment line, including the auth provider options and the harness retry logic.

**Acceptance**:

- `git grep -nE 'used to|red herring|stays fixed|before this was extracted|validAudiences|Fixed at the source' -- testing/server.ts src/lib/resolve-artifact-version.ts src/lib/diagram/core/graph/cluster.ts src/lib/diagram/core/graph/gutter.ts src/lib/diagram/core/graph/spacing.ts src/lib/auth.ts` → no output.
- `git grep -n 'enforcePerClientResources' src/lib/auth.ts` → one match, still preceded by a comment that names the missing link rows.
- `git diff -U0 | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | grep -vE '^[+-][[:space:]]*(//|/?\*|\*/|$)'` → no output (comment lines only).
- Gate exits 0.

---

## Phase 3 — Move or add doc comments on exports

**Goal**: Hover on `subscribeThemePreference`, `setThemePreference`, `sessionMiddleware`, `revokeMcpConnectionFn`, `listArtifactsFn`, and `getArtifactDetailFn` shows their contract.

**Decisions**:

- `src/lib/theme.ts`: move `:81-85` onto `subscribeThemePreference`; `themeListeners` gets no comment. Add a doc to `setThemePreference` that covers persistence (`'system'` stored as absence), the `<html>` stamp, subscriber notification, and that a storage failure is swallowed (the choice applies to this tab only). Keep the inline comments at `:107-108`, `:115`, and `:118-119`.
- `src/lib/session-middleware.ts`: move the "route guards are UX-only; every server fn must re-check" rationale onto `sessionMiddleware`, including the `Unauthorized` throw. `requireSession` gets a one-liner (the check behind `sessionMiddleware`; throws `Unauthorized` without a session). Convert the detached `:5-12` block from `/**` to a plain `/*` module comment, as in `spacing.ts:1`.
- `src/lib/account.ts`: lift `:196-200` into a doc comment on `revokeMcpConnectionFn` (cascade to refresh tokens, access-token rows, and consent; outstanding JWTs fail at the next `/mcp` call via the `azp` check in `verifyMcpBearer`). Delete the in-handler copy.
- `src/lib/artifacts.ts`: lift `:65-66` into a doc on `listArtifactsFn` (always returns answered counts, at a body fetch and parse per row). Add a one-liner to `getArtifactDetailFn`: null for an unknown or soft-deleted artifact or a missing version, unlike `updateArtifactMetadataFn`, which throws. (`getArtifact` filters `deletedAt` at `src/database/repository.ts:366`.)
- Nothing else: `listTagsFn`, `McpAuthResult`, and the other low-value gaps stay undocumented.

**Scope**: in — `src/lib/theme.ts`, `src/lib/session-middleware.ts`, `src/lib/account.ts`, `src/lib/artifacts.ts`. Out — `src/lib/session-middleware.unit.test.ts` (its describe name already matches); `src/lib/mcp/auth.ts` (plan 04 owns it).

**Acceptance**:

- `grep -n -B1 'export function subscribeThemePreference' src/lib/theme.ts` → the preceding line is ` */`.
- `grep -n -B1 -E 'export (function setThemePreference|const sessionMiddleware|const revokeMcpConnectionFn|const listArtifactsFn|const getArtifactDetailFn)' src/lib/theme.ts src/lib/session-middleware.ts src/lib/account.ts src/lib/artifacts.ts` → each export is preceded by a line that ends a doc comment (` */` or a `/** ... */` one-liner).
- `grep -c 'Deleting the client registration' src/lib/account.ts` → 0 (the handler copy is gone; the doc may reword it).
- The same comment-lines-only `git diff -U0` check as Phase 2 → no output.
- Gate exits 0.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope; note the deviation in the final summary. Line numbers drift after plans 01, 03, 07, 16, and 24 land, so locate each comment by its quoted text, not its line. Stop and report instead of improvising when:

- a locked decision turns out to be wrong or impossible (for example, a comment named here was already rewritten by plan 16),
- the work requires touching out-of-scope files or non-comment lines,
- acceptance can't be met after a couple of honest attempts.

## Done criteria

Machine-checkable; ALL must hold:

- [ ] Gate exits 0
- [ ] `git grep -nE '^[[:space:]]*// -{10,}|/\* -{10,}' -- src testing` → no output
- [ ] The Phase 2 journal-phrase grep → no output
- [ ] Each of the six exports named in Phase 3 is directly preceded by a doc comment
- [ ] `docs/plans/README.md` status row updated
