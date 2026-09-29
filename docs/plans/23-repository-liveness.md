# Plan 23 — Enforce artifact liveness inside repository mutations; atomic update_artifact

Move the "mutations touch live artifacts only" rule from the callers into the repository: every mutation that targets one artifact returns `undefined` for an unknown or soft-deleted id, and the callers drop their `getArtifact` pre-checks. Replace `appendVersion` + `updateMetadata` with one transactional `updateArtifact`, so `update_artifact` writes body and metadata atomically. Out of scope: `restoreArtifact`, `purgeArtifact`, `softDeleteArtifact` and the tag rewrites stay unfiltered on purpose, and no tool schema, description or error wording changes.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: M
- **Risk**: LOW
- **Depends on**: docs/plans/07-\*.md (adds the `setArtifactArchivedFn` RPC caller that Phase 2 reuses), docs/plans/08-\*.md (rewrites the `update_artifact` validation block that Phase 1 edits; 08 explicitly leaves the write ordering to this plan)

The audit framed this as a check-then-write race. That race cannot happen: better-sqlite3 is synchronous and no handler awaits between `getArtifact` and the write. The real problems are maintainability and test gaps, and this plan is scoped to them.

## Why this matters

The liveness rule is part of the repository's contract but lives in 7 caller pre-checks across two surfaces (UI server fns and MCP tools). Every new mutation path must remember it, and 3 of them have no test that a trashed artifact is refused: revert, archive and save-state (`artifacts.int.test.ts:228` covers metadata only; `server.int.test.ts` never writes after `delete_artifact`). `update_artifact` also writes the body and the metadata in two separate transactions (`server.ts:380-388`). After this plan, the repository enforces the rule once, tests pin it at both the repository and the transport seams, and a body+metadata update commits whole or not at all.

## Context

- `src/database/repository.ts:291-295` `appendVersion` (only prod caller: `server.ts:380`) and `:332-352` `updateMetadata` (callers: `artifacts.ts:166`, `server.ts:384`) filter by id only; `:328-331` documents that. `:261-288` `Tx` and `insertNextVersion`, the shared append helper. `:67-72` `UpdateMetadataInput`. `:48-50` names `appendVersion` in the `ArtifactVersion` doc.
- `repository.ts:304-326` `revertToVersion` returns `ArtifactVersion | undefined`, with no `deletedAt` check (doc `:297-303`). `:610-619` `setArtifactArchived` and `:688-698` `setArtifactState` (returns `void`) filter by id only. `:358-387` `getArtifact` is the live-only read (`isNull(artifacts.deletedAt)` at `:366`).
- Deliberately unfiltered, and they stay that way: `restoreArtifact` `:631-640` (it must reach trashed rows), `purgeArtifact` `:646-648` (it empties the trash), `rewriteTag` `:567-588` (the reason is at `:563-565`), `softDeleteArtifact` `:622-624` (idempotent by contract, `artifacts.ts:241-245`).
- UI pre-checks, each `requireArtifact(getArtifact(db, data.id))`: `src/lib/artifacts.ts:163` (metadata, with comment `:161-162`), `:198` (save state), `:220` (revert, with comment `:218-219`), `:234` (archive, with comment `:232-233`). `requireArtifact` (`src/lib/artifact-metadata.ts:57-63`) throws `'Artifact not found. It may have been deleted.'` on any falsy value. Its doc (`:51-56`) describes the pre-check and the "vanished between the pre-check and the write" case.
- MCP pre-checks: `src/lib/mcp/server.ts:346-350` (`update_artifact`, which also reads `existing.artifact.type` at `:356` and `existing.version.version` at `:352`), `:413-417` (`restore_version`, which uses `existing.artifact.title` at `:429`), `:636-640` (`set_artifact_archived`, which uses the title at `:646`). `:663` (`delete_artifact`) is a read that picks the idempotent reply, not a guard. It stays.
- Existing pattern to reuse for error classification: `get_artifact` (`server.ts:587-596`) re-reads with `getArtifact(db, id)` only after a miss, to tell "no such version" (`noSuchVersionResult`, `:75-79`) from "no such artifact" (`notFoundResult`, `:68-72`).
- UI consumers ignore the return values of revert and archive (`src/components/artifacts/artifact-detail.tsx:172`, `:180`). `edit-artifact-dialog.tsx:72` ignores the return value of the metadata fn, and its unit test mocks it with an `Artifact`.
- Tests: `src/database/repository.unit.test.ts` (fresh DB per test via `createTestDb`, `:36-43`). `appendVersion` is called there 11 times, 8 of them as fixtures outside its own `describe`, and once at `src/lib/artifacts.int.test.ts:252`. The constraint-violation exemplar is `repository.unit.test.ts:71-75`. RPC suite: `artifacts.int.test.ts` (callers built in `beforeAll`, `:55-146`; trashed-write exemplar `:227-243`). MCP suite: `src/lib/mcp/server.int.test.ts` (it imports repository fns directly at `:9`; not-found exemplar `:855-863`).

Deviations from the audit brief, locked here:

- `update_artifact` keeps its `getArtifact` read. It needs the artifact type to validate the body before any write, and a deleted id should report not-found before a validation error. The read is no longer the liveness guard: a miss from `updateArtifact` also maps to `notFoundResult`. So 6 pre-checks are deleted and 1 becomes a type lookup.
- The brief added `updateArtifact` next to `appendVersion`/`updateMetadata`. Both old functions lose every prod caller, so this plan deletes them (no aliases). Their tests migrate.
- `revertToVersion` returns `{ artifact, version }` so that `restore_version` keeps the title in its reply without a pre-read.

Cross-phase rules (from `CLAUDE.md`): kebab-case files, no barrels; tests colocated as `.unit.test.ts` / `.int.test.ts`, with shared helpers from `@testing/*`; env only via `src/lib/env.ts`; server fns keep `sessionMiddleware` and keep their handler bodies inline in `.handler(...)` (`artifacts.ts:41-47`); `/mcp` stays Bearer-only. Never silence a lint rule with a disable comment.

Domain skills the executor must follow:

- `/Users/henry/.claude/skills/tdd/SKILL.md`: red before green, and test only at the seams named under Acceptance (repository functions, the server-fn RPC route, the MCP tool call), never through raw SQL.
- `/Users/henry/.claude/skills/code-comments/SKILL.md`: delete the "doesn't filter soft-deleted" comments, and state the liveness contract once in each mutation's doc comment.

If the code has drifted from this section since `ffee99b` (plans 07 and 08 move `server.ts` and `artifacts.int.test.ts` lines, so locate by symbol), re-check the decision it supports before you proceed. Report material drift. Do not replan silently.

## Gate

`pnpm gate` (typecheck, lint with fix, fmt, test) closes every phase. If the shell's `node -v` is not 26, prefix with `mise exec --`.

## How to execute

- One phase per fresh session. The user commits between phases.
- The orchestrator dispatches ONE subagent per phase (`Task` tool, `subagent_type: general-purpose`) with this plan's Context, the phase's Decisions/Scope/Acceptance, and the intent. It verifies with the gate and re-prompts the SAME subagent on failure. It does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for user review.

## Phases

1. Atomic, live-only `updateArtifact` replaces `appendVersion` + `updateMetadata`.
2. Liveness inside `revertToVersion`, `setArtifactArchived` and `setArtifactState`; the remaining pre-checks go.

---

## Phase 1 — Atomic, live-only updateArtifact

**Goal**: one repository call writes an artifact's body and/or metadata in a single transaction, and refuses unknown or soft-deleted ids. `update_artifact` and `updateArtifactMetadataFn` use it.

**Decisions**:

- New export in `src/database/repository.ts`: `updateArtifact(db: Db, artifactId: string, input: UpdateArtifactInput): { artifact: Artifact; version: ArtifactVersion } | undefined`. Rename `UpdateMetadataInput` to `UpdateArtifactInput` and add `body?: string`. The existing `undefined`-leaves-unchanged / `null`-clears-description doc stays.
- Semantics, in one `db.transaction`: read the live row (`isNull(artifacts.deletedAt)`), and return `undefined` if it is absent. If `body` is defined, append through `insertNextVersion`. Then, if any of title/description/tags is defined, update those fields and `updatedAt`. Keep the order body-then-metadata, so a failed metadata write rolls back the appended version. Return the post-write artifact and the latest version (the new version when a body was given). Input with no fields writes nothing and returns the current state.
- Delete `appendVersion` and `updateMetadata`. Fix the `ArtifactVersion` doc (`:48-50`) to name `updateArtifact`/`revertToVersion`.
- `update_artifact` (`server.ts:328-397`): keep the `getArtifact` read for the type check (see the deviation in Context). Replace the two writes (`:380-389`) with one `updateArtifact` call. Pass `tags` through `normalizeTags` as today. `undefined` → `notFoundResult(id)`. Take `versionNumber` from the result. The response shape and text do not change.
- `updateArtifactMetadataFn` (`artifacts.ts:157-172`): delete the pre-check and its comment. Return `requireArtifact(updateArtifact(...)).artifact`, so the fn still returns an `Artifact`. Its doc says unknown or deleted ids throw.

**Scope**: in: `src/database/repository.ts`, `src/database/repository.unit.test.ts`, `src/lib/artifacts.ts`, `src/lib/artifacts.int.test.ts` (fixture at `:252` only), `src/lib/mcp/server.ts`, `src/lib/mcp/server.int.test.ts`. Out: revert/archive/state paths and the `artifact-metadata.ts:51-56` doc (Phase 2 owns them); the body validation in `update_artifact` (plan 08 owns it).

**Acceptance**:

- Gate exits 0.
- `grep -rnE "appendVersion|updateMetadata\b|UpdateMetadataInput" src testing scripts` → one match only, the `requireArtifact` doc at `src/lib/artifact-metadata.ts:54` (Phase 2 rewrites it).
- `grep -n "getArtifact(" src/lib/artifacts.ts` → exactly 4 matches: `getArtifactDetailFn` plus the save/revert/archive pre-checks Phase 2 removes.
- Tests in `repository.unit.test.ts`: replace `describe('appendVersion')` and `describe('updateMetadata')` with `describe('updateArtifact')`. Cases: a body-only call appends N+1 and bumps `updatedAt`; a metadata-only call changes fields, adds no version, and returns the current latest; body+metadata in one call adds exactly one version and applies the fields; a soft-deleted id returns `undefined`, `getLatestVersion` is unchanged, and the trashed row's title is unchanged (read through `listArtifacts(db, { deleted: true })`); an unknown id returns `undefined`; atomicity: body plus `title: null` (cast, modeled on `:71-75`) throws, and `listVersions` is unchanged. Write the soft-deleted case first; it is red until `updateArtifact` exists. Migrate the other 8 `appendVersion` fixtures to `updateArtifact(db, id, { body })`.
- Test in `server.int.test.ts` `describe('update_artifact')`: publish markdown, `delete_artifact`, then `update_artifact` with `markdown` and `title`. `isError` is true, the text contains `list_artifacts`, and `getLatestVersion(db, id)?.version` is still 1.
- The existing `artifacts.int.test.ts:228` case ("rejects a metadata update on a soft-deleted artifact") stays green after the pre-check deletion. It is now the regression test for the repository filter.

---

## Phase 2 — Liveness in revert, archive and state writes

**Goal**: `revertToVersion`, `setArtifactArchived` and `setArtifactState` return `undefined` for unknown or soft-deleted ids and write nothing. The remaining 5 pre-checks and their comments are gone. Each trashed-artifact refusal has a test at the repository seam and at its transport seam.

**Decisions**:

- `revertToVersion`: read the live row inside the existing transaction and return `undefined` when it is absent. The return type becomes `{ artifact: Artifact; version: ArtifactVersion } | undefined`, with the artifact's post-bump `updatedAt`. Rewrite the doc (`:297-303`) to state the live-only contract. It still returns `undefined` for a missing version.
- `setArtifactArchived`: add `isNull(artifacts.deletedAt)` to its WHERE. The doc says that unknown and soft-deleted ids return `undefined`.
- `setArtifactState(db, artifactId, state): { updatedAt: number } | undefined`. It reads the live row and upserts in one transaction, and returns `undefined` without writing when the row is absent. This also turns an unknown id's FK error into `undefined`.
- `artifacts.ts`: delete the pre-checks at `:198`, `:220`, `:234` and the comments at `:218-219`, `:232-233`. Save → `requireArtifact(setArtifactState(...))`, then return `{ saved: true }`. Revert → `requireArtifact(revertToVersion(...)).version` (the fn's return shape does not change). Archive → `requireArtifact(setArtifactArchived(...))`.
- `server.ts` `restore_version`: delete the pre-check. On `undefined`, return `getArtifact(db, id) ? noSuchVersionResult(id, version) : notFoundResult(id)`, the `get_artifact` pattern from `:589-596`. The reply uses `restored.artifact.title`. `set_artifact_archived`: delete the pre-check. `undefined` → `notFoundResult`, and the reply uses the returned artifact's title.
- Rewrite `requireArtifact`'s doc (`artifact-metadata.ts:51-56`): repository mutations return `undefined` for unknown or soft-deleted ids, and this turns that into the user-facing error. Drop the pre-check narrative.
- Ordering for a real red: add the int/MCP tests first (they pass while the pre-checks exist), delete the pre-checks and watch them fail, then add the repository filters.

**Scope**: in: `src/database/repository.ts`, `src/database/repository.unit.test.ts`, `src/lib/artifacts.ts`, `src/lib/artifacts.int.test.ts`, `src/lib/mcp/server.ts`, `src/lib/mcp/server.int.test.ts`, `src/lib/artifact-metadata.ts` (doc only). Out: `delete_artifact`'s read (`server.ts:663`) and the unfiltered functions listed in Context.

**Acceptance**:

- Gate exits 0.
- `grep -n "getArtifact(" src/lib/artifacts.ts` → exactly 1 match, inside `getArtifactDetailFn`.
- `grep -n "getArtifact(" src/lib/mcp/server.ts` → exactly 5 matches (`update_artifact` type lookup, `restore_version` miss classification, `get_artifact` ×2, `delete_artifact`).
- `grep -rnE "doesn't filter soft-deleted|doesn't check .deletedAt|live-artifact check" src` → no matches.
- `repository.unit.test.ts`: for each of `revertToVersion`, `setArtifactArchived`, `setArtifactState`, add a soft-deleted case that returns `undefined` and writes nothing (check with `listVersions`, then `restoreArtifact` + `getArtifact(...).artifact.archivedAt`, then `getArtifactState` → `null`). Add `setArtifactState` on an unknown id → `undefined`. Update the existing `revertToVersion` cases for the new return shape.
- `artifacts.int.test.ts`: `saveArtifactStateFn` and `revertArtifactVersionFn` reject a soft-deleted artifact with `'Artifact not found. It may have been deleted.'`. `setArtifactArchivedFn` archives a live artifact (`archivedAt` not null) and rejects a soft-deleted one. Use plan 07's caller; add it to `beforeAll` if it is absent.
- `server.int.test.ts`: `restore_version` after `delete_artifact` → `isError`, the text contains `list_artifacts` and not `no version`; `set_artifact_archived` after `delete_artifact` → `isError`, and the text contains `list_artifacts`. The existing "missing version distinct from missing artifact" case (`:358-376`) stays green.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note the deviation in the final summary. Stop and report instead of improvising when a locked decision turns out to be wrong or impossible, when the work requires touching out-of-scope files, or when acceptance can't be met after a couple of honest attempts.

## Done criteria

- [ ] Gate exits 0
- [ ] `grep -rnE "appendVersion|updateMetadata\b|UpdateMetadataInput" src testing scripts` → no matches
- [ ] `grep -n "getArtifact(" src/lib/artifacts.ts` → 1 match; `src/lib/mcp/server.ts` → 5 matches
- [ ] Every mutation that targets one artifact (`updateArtifact`, `revertToVersion`, `setArtifactArchived`, `setArtifactState`) has a passing soft-deleted test in `repository.unit.test.ts`
- [ ] `docs/plans/README.md` status row updated

## Open questions

- Should `update_artifact` read the type only when a body is provided, so that a metadata-only update is a single call? Resolves in Phase 1. Default: no. Keep one read ahead of validation, so the error order stays not-found before validation for every input.
