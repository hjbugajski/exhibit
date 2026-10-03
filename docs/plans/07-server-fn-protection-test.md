# Plan 07 — Structural test pinning sessionMiddleware on every server fn

Add a source-scanning unit test that fails when any `createServerFn` in `src/` lacks `.middleware([sessionMiddleware])` and is not on a reviewed public allowlist. Also add the missing unauthenticated RPC cases for the guarded fns that no test calls without a cookie. Test-only: no source file under `src/lib/` or `src/routes/` changes, and the session guard itself stays as it is.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none

## Why this matters

`beforeLoad` guards are UX-only. `sessionMiddleware` is the real auth boundary for every server fn reachable over `/_serverFn/`. Today, deleting `.middleware([sessionMiddleware])` from `getArtifactDetailFn`, `listArtifactsFn`, `deleteArtifactFn` or `listMcpConnectionsFn` leaves the suite green, which would ship an unauthenticated read of every artifact body or an unauthenticated delete. Route files already have this kind of structural check. Server fns do not.

## Context

- `src/routes/route-protection.unit.test.ts:15-58` — the exemplar to model after: a doc-commented allowlist `Set`, a file walk via `readdirSync(..., { recursive: true, withFileTypes: true })` that excludes `*.test.*`, one "accounts for every X" case, and one "has no stale allowlist entries" case.
- `src/lib/session-middleware.ts:29-33` — `sessionMiddleware`, a `createMiddleware({ type: 'function' })` that calls `requireSession()` (`:21-27`) and throws `'Unauthorized'` without a session. Its unit test (`src/lib/session-middleware.unit.test.ts:26-41`) covers `requireSession` only, not the wiring.
- The 20 `createServerFn` declarations at `ffee99b`, all `export const <name> = createServerFn({ method })` followed by a chained `.middleware(...)`/`.validator(...)`/`.handler(...)`:
  - `src/lib/artifacts.ts:61,70,76,89,105,127,157,188,214,228,246,256,270` — all guarded.
  - `src/lib/account.ts:89,165,192` — guarded. `src/lib/account.ts:81` `passwordResetAvailableFn` — unguarded on purpose (sign-in page reads it; reveals only whether a mailer is configured).
  - `src/lib/auth-session.ts:14` `getServerSession` — unguarded on purpose (it is the session lookup; `sessionMiddleware` and the `_authed`/`consent`/`sign-in`/`reset-password` `beforeLoad` guards call it).
  - `src/lib/map-config.ts:11` `getProtomapsApiKeyFn`, `src/lib/mcp/origin.ts:10` `getMcpConnectUrlFn` — guarded.
- No global function middleware exists (no `src/start.ts`; `src/routes/__root.tsx:16` registers a request-middleware error handler only), so per-fn wiring is the only guard.
- RPC harness: `testing/server.ts:165-180` `serverFnCaller(server, modulePath, exportName, method, origin)` returns a `ServerFnCaller` (`:157`) that sends the owner cookie only when `{ cookie }` is passed. It can target any module the booted dev server can transform.
- Existing unauthenticated cases, to model after: `src/lib/artifacts.int.test.ts:222-224` (save), `:281-285` (revert), `:349-353` (tag fns), `:405-410` (restore/purge); `src/lib/account.int.test.ts:204-206` (`getConsentClientFn`), `:248-250` (`revokeMcpConnectionFn`). Callers are built in `beforeAll` at `artifacts.int.test.ts:55-146` and `account.int.test.ts:148-179`.
- Missing unauthenticated cases: `getArtifactDetailFn`, `listArtifactsFn`, `updateArtifactMetadataFn` (callers exist, only authed cases), `listTagsFn`, `setArtifactArchivedFn`, `deleteArtifactFn` (no callers), `listMcpConnectionsFn`, `getProtomapsApiKeyFn`, `getMcpConnectUrlFn` (no RPC test at all).

All nine missing int cases are in scope, not just a sample: they reuse the two suites' existing dev-server boots and prove end to end that the wiring rejects, which the source scan cannot show.

Rules (from `CLAUDE.md`): tests colocated as `.unit.test.ts` / `.int.test.ts`, shared helpers from `@testing/*`; security invariant — everything except `/sign-in`, `/reset-password`, `/api/auth/*`, `/.well-known/*`, `/healthz` needs a session.

Domain skills the executor must follow:

- `/Users/henry/.claude/skills/tdd/SKILL.md` — test only at the seams named in Acceptance; red before green (see the red check under Acceptance, since these tests pass against current code).
- `/Users/henry/.claude/skills/code-comments/SKILL.md` — comments state why, not what; one doc comment per allowlist entry reason, no narration.

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before you proceed. Report material drift. Do not replan silently.

## Gate

`pnpm gate` (typecheck, lint with fix, fmt, test) closes the phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If the shell's `node -v` is not 26, prefix with `mise exec --`.

## How to execute

- Single phase, one fresh session; the user commits.
- The orchestrator dispatches ONE subagent (`Task` tool, `subagent_type: general-purpose`) with this plan's Context, the Decisions/Scope/Acceptance below, and the intent. It verifies with the gate and re-prompts the SAME subagent on failure. It does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for user review.

---

## Phase 1 — Server-fn protection test and unauthenticated RPC cases

**Goal**: Removing `.middleware([sessionMiddleware])` from any server fn in `src/`, or adding an unguarded one, fails `pnpm test`. Every guarded server fn has at least one RPC case that proves a cookie-less call rejects with `'Unauthorized'`.

**Decisions**:

- New file `src/lib/server-fn-protection.unit.test.ts`. It sits beside `session-middleware.ts` because it pins that module's contract. It walks `src/` (`join(import.meta.dirname, '..')`) for `*.ts`/`*.tsx`, excluding `*.test.*`, the same way the route test walks `src/routes/`.
- Allowlist: `const PUBLIC = new Set(['lib/account.ts#passwordResetAvailableFn', 'lib/auth-session.ts#getServerSession'])`, keyed `<path relative to src>#<export name>`. The path is in the key so that a same-named fn in another module is not exempted. Each entry gets a trailing `//` reason, as in `route-protection.unit.test.ts:15-24`.
- Detection works on source text and tolerates formatting. Match declarations with `/const\s+(\w+)\s*=\s*createServerFn\s*\(/g`. The chain of each match is the text from the match to the next `.handler(`. The fn is guarded when its chain matches `/\.middleware\(\s*\[[^\]]*\bsessionMiddleware\b/`, which also accepts `sessionMiddleware` inside a longer middleware array. When no `.handler(` follows, treat the fn as unguarded.
- Anonymous calls: in each file, the number of `createServerFn(` calls must equal the number of named declarations found. Otherwise the test fails and names the file. This closes the gap where an inline or re-wrapped `createServerFn(...)` evades the name regex. The import line has no `(`, so it does not count.
- Three cases, named as specifications:
  1. "guards every server fn outside the public allowlist": the unguarded, non-allowlisted keys equal `[]`.
  2. "has no stale allowlist entries": each `PUBLIC` key must be a discovered unguarded fn. The case fails when an entry is deleted or renamed, or when it becomes guarded.
  3. "declares every server fn as a named const": the per-file count check above equals `[]`.
- File doc comment (2–4 lines): states that `beforeLoad` is UX-only, that `sessionMiddleware` is the boundary, and that adding to `PUBLIC` is a security review decision tied to the CLAUDE.md invariants.
- `src/lib/artifacts.int.test.ts`: add `ServerFnCaller`s for `listTagsFn` (GET), `setArtifactArchivedFn` (POST) and `deleteArtifactFn` (POST) in the existing `beforeAll`. Add one new `describe('unauthenticated calls (through the real server-fn RPC route)')`. It asserts `rejects.toThrow('Unauthorized')` for `getArtifactDetailFn`, `listArtifactsFn`, `listTagsFn`, `updateArtifactMetadataFn`, `setArtifactArchivedFn` and `deleteArtifactFn`, each with a schema-valid payload against the fixture `artifactId`. Send valid payloads so that the rejection is the session guard and not the validator. The delete case also reads the artifact back with `ownerCookie` via `getArtifactDetail` and asserts that it is non-null: a rejected delete must have no effect.
- `src/lib/account.int.test.ts`: in the `/settings server fns` describe, add callers for `listMcpConnectionsFn` (`/src/lib/account.ts`), `getMcpConnectUrlFn` (`/src/lib/mcp/origin.ts`) and `getProtomapsApiKeyFn` (`/src/lib/map-config.ts`), all GET. Add one `it` per fn that asserts `rejects.toThrow('Unauthorized')` with `undefined` data. The two config fns go here because this suite already boots a server. Their values are low-sensitivity, but the case pins the wiring end to end at no boot cost.

**Scope**: in — `src/lib/server-fn-protection.unit.test.ts` (new), `src/lib/artifacts.int.test.ts`, `src/lib/account.int.test.ts`. Out — every non-test file: no server fn changes, and no edits to `session-middleware.ts`, its unit test, `testing/server.ts` or `CLAUDE.md`. The fns are already correctly guarded, and this plan pins them.

**Acceptance**:

- `pnpm gate` exits 0.
- `pnpm vitest run src/lib/server-fn-protection.unit.test.ts` → 3 tests pass.
- Red check (executor runs it, then reverts, and reports the output in the summary): delete the `.middleware([sessionMiddleware])` line from `getArtifactDetailFn` in `src/lib/artifacts.ts`. Then `pnpm vitest run src/lib/server-fn-protection.unit.test.ts` fails and names `lib/artifacts.ts#getArtifactDetailFn`, and `pnpm vitest run src/lib/artifacts.int.test.ts` fails on the new unauthenticated `getArtifactDetailFn` case. After the revert, `git diff --stat -- src/lib/artifacts.ts` prints nothing.
- Stale check (same revert discipline): add `.middleware([sessionMiddleware])` to `passwordResetAvailableFn`. Then the "has no stale allowlist entries" case fails and names `lib/account.ts#passwordResetAvailableFn`.
- `git status --porcelain -- src testing` lists exactly the three in-scope files (the new unit test as `??`).

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note the deviation in the final summary. Stop and report instead of improvising in these cases: a locked decision turns out to be wrong or impossible; the work requires touching out-of-scope files; or acceptance cannot be met after a couple of honest attempts. Stop and report in particular when an unauthenticated RPC case does not reject with `'Unauthorized'`: that is a real auth hole, not a test to adjust.

## Done criteria

Machine-checkable; ALL must hold:

- [ ] `pnpm gate` exits 0
- [ ] `src/lib/server-fn-protection.unit.test.ts` exists with 3 passing cases, and `PUBLIC` holds exactly the two keys above
- [ ] `grep -c "'Unauthorized'" src/lib/artifacts.int.test.ts` → at least 13 (7 at `ffee99b` plus the 6 new cases)
- [ ] `grep -c "'Unauthorized'" src/lib/account.int.test.ts` → at least 5 (2 at `ffee99b` plus the 3 new cases)
- [ ] The red and stale checks were run and reverted, and their output is in the summary
- [ ] `docs/plans/README.md` status row for 07 updated
