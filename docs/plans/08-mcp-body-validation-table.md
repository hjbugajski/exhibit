# Plan 08 — One per-type body validator table for MCP publish/update

Replace the per-handler body checks in `src/lib/mcp/server.ts` with one exhaustive `Record<ArtifactType, …>` of type checks behind a single `validateBody(type, body)`, and fold the three identical publish handlers' create-and-respond block into one helper. This also closes one real gap: `update_artifact` accepts an empty or whitespace-only markdown body. Out of scope: tool input schemas, tool descriptions, error wording, and the update transaction ordering.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none

## Why this matters

Body rules for each artifact type live in four places in one file: three publish handlers and a nested ternary in `update_artifact`. The ternary falls through to `null` for any type it does not name, so a tightened or new check must be added in lockstep by hand, and the compiler does not help. The fall-through already hides a bug: `update_artifact` with `markdown: ''` or `'   '` appends an empty version, because markdown updates get only the size check. One exhaustive table makes coverage a compile error and gives publish and update the same rules.

## Context

- `src/lib/mcp/server.ts:95` — `validateSpecOrError(spec: Record<string, unknown>)`. It wraps `validateArtifactSpec`, which already takes `unknown` (`src/catalog/validate.ts:293`).
- `src/lib/mcp/server.ts:119` — `htmlDocumentOrError(html: string)`, the `<html>` sanity check.
- `src/lib/mcp/limits.ts:8` — `checkBodySize(serialized, label)` returns a message string or `null`; callers wrap it with `errorResult`.
- `src/lib/mcp/server.ts:169-198` — `publish_spec`: size check (:171), spec check (:177), `createArtifact` + url + response (:183-197).
- `src/lib/mcp/server.ts:218-246` — `publish_html`: same shape, html check at :225, create/respond at :231-245.
- `src/lib/mcp/server.ts:265-287` — `publish_markdown`: size check (:266), no type check, create/respond at :272-286. Its schema has `z.string().min(1)` (:261), which rejects `''` but accepts `'   '`.
- `src/lib/mcp/server.ts:318-321` — the `update_artifact` `markdown` field has no `.min(1)`.
- `src/lib/mcp/server.ts:329-338` — the `bodies` record (comment :329-330, record :331-335), exhaustive over `ArtifactType`, flattened into `{ type, body }` pairs. The spec body is already serialized here.
- `src/lib/mcp/server.ts:362-378` — update path: size check, then the ternary at :369-374 that passes the parsed `spec` (with a cast) for spec, `update.body` for html, and `null` for markdown.
- `src/lib/artifact-sorts.ts:16` — `artifactTypes = ['spec', 'html', 'markdown']`; `ArtifactType` is derived at `src/database/repository.ts:30`.
- Tests: `src/lib/mcp/server.int.test.ts` drives tools through an in-memory MCP client (`callTool`, `textOf`, :17-54). Error text assertions that must keep passing: `'1 MB'` (:130, :165, :208), `'<html>'` (:156), `'a spec payload instead'` (:297), `'at most one'` (:314). The comment at :186-188 says markdown has "nothing to validate beyond its size". This plan makes that comment false.

Coordination: plan 06 Phase 4 adds `markdownStatePathsOrError(markdown)` to `server.ts` and calls it from `publish_markdown` and the `update_artifact` ternary. Whichever plan lands second composes it into this table's `markdown` entry (empty check first, then statePaths). Never keep a second call site in the handlers.

Stored bodies are not re-validated, so existing artifacts are unaffected.

Domain skills the executor must follow:

- `/Users/henry/.claude/skills/tdd/SKILL.md` — the seam is the MCP tool call through `callTool`, never the private helpers. The empty-markdown update test goes red first; the html/spec update characterization tests go green before the refactor and stay green after.
- `/Users/henry/.claude/skills/code-comments/SKILL.md` — `validateBody` gets a one-line doc comment stating the contract; delete the stale comment at `server.ts:368`.

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before you proceed. Report material drift. Do not replan silently.

## Gate

`pnpm gate` (typecheck, lint with fix, fmt, test) closes the phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If the shell's `node -v` is not 26, prefix with `mise exec --`.

## How to execute

- Single phase, one fresh session; the user commits.
- The orchestrator dispatches ONE subagent (`Task` tool, `subagent_type: general-purpose`) with this plan's Context, the Decisions/Scope/Acceptance below, and the intent. It verifies with the gate and re-prompts the SAME subagent on failure. It does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for user review.

---

## Phase 1 — Exhaustive body validation and a shared publish path

**Goal**: every body that enters through `publish_*` or `update_artifact` passes through one `validateBody(type, body)`. `update_artifact` rejects a whitespace-only markdown body and appends no version. Every existing error message stays the same.

**Decisions**:

- Widen `validateSpecOrError` to take `spec: unknown`. `validateArtifactSpec` already accepts `unknown`, so the `as Record<string, unknown>` cast at :371 goes away.
- New module-local `markdownBodyOrError(markdown: string): CallToolResult | null`. It returns an error when `markdown.trim() === ''`, with the message `markdown has no content (it is empty or whitespace only). Include the markdown document body.` Otherwise it returns `null`. The check does not modify the body: stored markdown stays byte for byte (the round-trip test at :170 must pass unchanged). The check applies to publish too, so `publish_markdown` now rejects `'   '`. This is intentional, so publish and update follow the same rule.
- New module-level `const bodyChecks: Record<ArtifactType, (body: string) => CallToolResult | null>` with `spec: (body) => validateSpecOrError(JSON.parse(body))`, `html: htmlDocumentOrError`, and `markdown: markdownBodyOrError`. The `Record` annotation is the exhaustiveness guarantee: a fourth `ArtifactType` fails typecheck here. Every entry takes the serialized string because `update_artifact` handles `{ type, body }` pairs whose type is a runtime union; a per-type payload signature would need casts there. The spec re-parse is lossless (the string was just serialized from JSON-decoded input) and bounded (size runs first).
- New module-level `validateBody(type: ArtifactType, body: string): CallToolResult | null`. It returns `errorResult(checkBodySize(body, type))` when the size check fails. Otherwise it returns `bodyChecks[type](body)`. Size runs first, so an oversize spec is never parsed.
- New module-level `publishArtifact(db: Db, type: ArtifactType, input: { title; description; tags; body }): CallToolResult`. It runs `validateBody`, then `createArtifact` with `normalizeTags(tags)`, then returns the existing response shape. The response text keeps the current per-type label through a `Record<ArtifactType, string>` (`spec`, `HTML`, `markdown`), so `Published HTML artifact …` does not change. `publish_spec` passes `JSON.stringify(spec)` as the body. Each publish handler becomes a one-line call.
- In `update_artifact`, replace :362-378 with one `validateBody(update.type, update.body)` call. The mismatch check at :356, the at-most-one check at :340, and the `appendVersion`/`updateMetadata` ordering stay as they are. Plan 23 owns making that sequence atomic.
- Keep the `bodies` record and its exhaustiveness comment (:329-335). It still serves the pair-building step.
- No input schema or description changes. Keep `.min(1)` on `publish_html` and `publish_markdown` and add none to `update_artifact`. Plan 18 owns the description prose, and plan 16 owns the stale `limits.ts:1` doc ("spec/html").

**Scope**: in — `src/lib/mcp/server.ts`, `src/lib/mcp/server.int.test.ts`. Out — `src/lib/mcp/limits.ts` (wording owned by plans 16/18), `src/catalog/validate.ts` (plan 06 owns the statePath rules), repository functions (plan 23).

**Acceptance**:

- `pnpm gate` exits 0.
- `grep -n "update.type === 'spec'" src/lib/mcp/server.ts` → no matches (the ternary is gone).
- `grep -c "createArtifact(db" src/lib/mcp/server.ts` → `1`.
- `grep -n "size is the only check" src/lib/mcp/server.ts` → no matches.
- Tests to add in `src/lib/mcp/server.int.test.ts`, modeled on the existing `update_artifact` cases (:267-320):
  - `update_artifact` rejects `markdown: ''` and `markdown: '  \n\t'` against a markdown artifact: `isError` is true, the text contains `no content`, and `get_artifact` versions stay `[1]`. This is the red test.
  - `publish_markdown` rejects `'  \n'` with `isError` and `no content`.
  - `update_artifact` on an html artifact rejects `'<div>hi</div>'`, and the text contains `<html>`.
  - `update_artifact` on a spec artifact with `invalidFixture` returns `isError` and a non-empty `structuredContent.errors` array.
  - `update_artifact` on a markdown artifact rejects `'x'.repeat(1_100_000)`, and the text contains `1 MB`.
- Rewrite the comment at `server.int.test.ts:186-188` to say that raw HTML must be stored verbatim because it is escaped at render time. Drop the "nothing to validate beyond its size" claim.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note the deviation in the final summary. Stop and report instead of improvising in these cases:

- a locked decision turns out to be wrong or impossible (for example, type-aware lint rejects `JSON.parse` flowing into `unknown`),
- the work requires touching out-of-scope files,
- acceptance can't be met after a couple of honest attempts.

## Done criteria

Machine-checkable; ALL must hold:

- [ ] `pnpm gate` exits 0
- [ ] `grep -c "createArtifact(db" src/lib/mcp/server.ts` prints `1`
- [ ] `grep -n "update.type === 'spec'" src/lib/mcp/server.ts` prints nothing
- [ ] `grep -n "size is the only check" src/lib/mcp/server.ts` prints nothing
- [ ] The five new `server.int.test.ts` cases above exist and pass
- [ ] `docs/plans/README.md` status row updated

## Open questions

- Should `publish_markdown`'s schema drop `.min(1)`, so that `''` gets the same `no content` message as update instead of the SDK's zod error? Default: keep it. Tool schemas are a client contract, and plan 18 revisits tool text. Resolves in this phase only if the owner asks.
