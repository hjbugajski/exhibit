# Plan 22 — Mark server-only modules so a client leak fails the build

Add TanStack Start's `server-only` marker to the modules that must never reach the browser, so that the `vite build` that CI already runs fails on a leak. Prove it with deliberate violations. Delete the boundary prose that the markers now enforce, and move `ArtifactType`/`artifactTypes` out of the database module into a client-safe domain module. This plan adds no CI job, changes no `vite.config.ts` option, and does not restructure the session modules.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: M
- **Risk**: MED (a false positive breaks the build; the installed plugin only fails on modules that survive into the client bundle, which lowers the risk)
- **Depends on**: docs/plans/11-\*.md (ordering only: it adds the client-safe `src/lib/unauthorized.ts` and `src/lib/router-context.ts`, which get no marker; landing 11 first means the Phase 1 build proof covers them)

## Why this matters

Today, only comments track which modules may reach the client bundle. Suppose a contributor or agent delegates a server-fn body to an exported helper, or imports `@/database` at runtime from a component. The gate stays green, and the PR docker build stays green too, because no module is marked as server-only. The first symptom is a hydration crash in the browser. After this plan, the same mistake fails `pnpm build`, and the build error names the import chain.

## Context

- Installed mechanism: `@tanstack/start-plugin-core@1.171.38` (via `@tanstack/react-start@1.168.48`). Import protection is on by default. `node_modules/.pnpm/@tanstack+start-plugin-core@1.171.38_*/node_modules/@tanstack/start-plugin-core/dist/esm/import-protection/defaults.js:13-35` denies `**/*.server.*` files and `@tanstack/react-start/server` in the client environment, and defines the `@tanstack/react-start/server-only` marker. In `dist/esm/vite/import-protection-plugin/plugin.js:771`, the default behavior is `error` in build and `mock` in dev. `plugin.js:977` (`generateBundle`) reports a build violation only when the marked module survives into the client bundle, so imports that the Start compiler strips are not flagged.
- Live evidence for that last point: `src/lib/auth-session.ts:2` imports `@tanstack/react-start/server` (a default-denied specifier) inside a module that client routes import, and today's build passes.
- `node_modules/@tanstack/react-start/dist/esm/server-only.js` is `export {}`. Plain `node` (seed chain), Vitest, and Nitro resolve the marker to that empty module, so it has no runtime effect.
- `vite.config.ts:24`: `tanstackStart()` with no options. `package.json:9`: `build` is `vite build`. `Dockerfile:9` runs `pnpm build`, and the PR `docker` job builds that Dockerfile (`.github/workflows/ci.yml:38-51`).
- The client-bundled server-fn modules, which must stay importable: `src/lib/artifacts.ts` (it imports `db` at `:4` and `countAnswers` at `:24`, and uses both only inside handlers), `src/lib/account.ts`, `src/lib/auth-session.ts`, `src/lib/session-middleware.ts`, `src/lib/map-config.ts`, and `src/lib/mcp/origin.ts`.
- The boundary prose that this plan replaces: `src/lib/artifacts.ts:36-48` (IMPORTANT block), `src/lib/request-session.ts:7-11`, `src/lib/answer-count.ts:5-6`, `src/lib/artifact-metadata.ts:11-12`, `src/lib/mcp/tool-names.ts:5`, and `src/lib/artifact-sorts.ts:1-4`.
- `ArtifactType` is derived at `src/database/repository.ts:30` from `artifactTypes` (`src/lib/artifact-sorts.ts:16`), through the type import at `repository.ts:25`.

Locked boundaries:

- No session-module merge. `request-session.ts` is split for bundling, `session-middleware.ts` for `vi.mock` (`:5-12`); merging `request-session.ts` into `auth-session.ts` would put `auth` in the client bundle and fail the new marker. Two route tests (`render.$id.$n.unit.test.ts`, `download.$id.$n.unit.test.ts`) mock `@/lib/request-session`.
- Every `ArtifactType` import from `@/database/repository` is `import type` and erased, so the Phase 2 move is cohesion, not a leak fix.

Cross-phase rules (from `CLAUDE.md`): kebab-case filenames; no barrels, re-exports, or aliases; renames atomic across call sites; never a lint-disable comment. The seed chain (`scripts/seed.ts` → `src/lib/seed.ts`, `auth.ts`, `mailer.ts`, `env.ts`, `src/database/index.ts`) uses relative imports, never `@/*`; the marker is a bare package specifier, so it is allowed there.

Domain skill the executor must follow: `/Users/henry/.claude/skills/code-comments/SKILL.md`. Delete prose that restates what the tooling now enforces. Keep a comment only when it states a constraint that the marker cannot express.

Coordination: plan 06 edits `answer-count.ts`, plan 08 edits `mcp/server.ts`, and plan 04 edits `mcp/auth.ts`. Plan 17 edits other comments in `artifacts.ts`. This plan changes only import lines and the comment ranges named above in those files, so rebase onto whichever lands first. If the code has drifted from this section since `ffee99b`, re-check the decision it supports before you proceed, and report material drift.

## Gate

`pnpm gate` (typecheck, lint with fix, fmt, test) closes every phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). The gate does not build, so each phase also runs `pnpm build` (needs no env vars; the Dockerfile builds without any). If the shell's `node -v` is not 26, prefix with `mise exec --`. Do not start a dev server.

## How to execute

- Run one phase per fresh session. The user commits between phases.
- The orchestrator dispatches ONE subagent per phase (`Task` tool, `subagent_type: general-purpose`) with this plan's Context, the phase's Decisions/Scope/Acceptance, and the intent. It verifies with the gate and re-prompts the SAME subagent on failure. It does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for user review.

## Phases

1. Mark the server-only modules, prove that a leak fails `pnpm build`, and delete the prose that the markers replace.
2. Move `artifactTypes`/`ArtifactType` into `src/lib/artifact-types.ts`.

---

## Phase 1 — Server-only markers and build proof

**Goal**: A client-reachable runtime import of any server-only module makes `pnpm build` exit non-zero with an `[import-protection]` error. The clean tree still builds.

**Decisions**:

- Marker: `import '@tanstack/react-start/server-only';`. Use the marker, not a `*.server.ts` rename. Both give the same enforcement (`defaults.js:17` and `:32`), but the marker needs no renames through the seed chain's relative `.ts` imports and dozens of call sites. oxfmt decides where the import goes.
- Mark exactly these nine modules (locked list). Rationale: they own a server-only resource (Node builtins, `better-sqlite3`, Drizzle, the Better Auth server, Resend, the MCP server SDK, `process.env`) or, for `answer-count.ts`, declare server-only in their header. Never mark a client-imported server-fn module (Context list), even though several import Drizzle directly:
  - `src/database/index.ts`, `src/database/open.ts`, `src/database/repository.ts`
  - `src/lib/env.ts`, `src/lib/auth.ts`, `src/lib/mailer.ts`
  - `src/lib/mcp/server.ts`, `src/lib/mcp/auth.ts`
  - `src/lib/answer-count.ts` (keeps its declared contract)
- Transitive modules get no marker (`seed.ts`, `seed-plugin.ts`, `request-session.ts`, `resolve-artifact-version.ts`, route files): a leak through them reaches a marked module, and the trace names the chain.
- No `importProtection` options in `vite.config.ts`. The defaults already fail the build and mock in dev. No CI change, because the PR docker job is the enforcement point.
- Comment edits:
  - `artifacts.ts:36-48`: sharpen the IMPORTANT paragraph to the constraint. Handlers stay inline in `.handler(...)`, because Start strips only the literal handler body, and an exported helper that uses `db` keeps `@/database` in the client bundle. Replace "crashes hydration" with the new failure mode: `pnpm build` fails with an import-protection error. Keep the first paragraph (`:37-39`).
  - Delete `request-session.ts:7-11`, `answer-count.ts:5-6`, `artifact-metadata.ts:11-12`, and the "Client-safe on purpose" sentence at `tool-names.ts:5`.
  - Leave `src/lib/theme.ts:4-5` and `src/components/catalog/mermaid-schema.ts:1-5` as they are: they state DOM and React constraints that the marker does not enforce. `artifact-sorts.ts:1-4` belongs to Phase 2.

**Scope**: in: the nine marked modules, plus the comment edits in `artifacts.ts`, `request-session.ts`, `artifact-metadata.ts`, and `tool-names.ts` (13 files, each one import line or a comment trim). Out: the `ArtifactType` move (Phase 2); `auth-session.ts`, `session-middleware.ts` (no change); `CLAUDE.md`, `package.json` scripts (Open questions).

**Acceptance**:

- `pnpm gate` exits 0. `pnpm build` exits 0, and its output contains no `[import-protection]`.
- `grep -rl "@tanstack/react-start/server-only" src | sort` → exactly the nine files above.
- `grep -rnE "crashes hydration|Client-safe on purpose|^ \* Server-only:" src/lib` → no match.
- Seed-chain check: `DATABASE_PATH=:memory: BASE_URL=http://localhost:3000 BETTER_AUTH_SECRET=x node scripts/seed.ts` exits 1 with the `OWNER_EMAIL and OWNER_PASSWORD` message (`scripts/seed.ts:19-22`), not a module-resolution error. Proves the marker resolves under plain `node`.
- Red check A: in `src/components/artifacts/type-badge.tsx`, add `import { db } from '@/database';` and a runtime use of `db` inside `TypeBadge`. Expect `pnpm build` to exit non-zero with `[import-protection]` naming a marked module. Revert the change.
- Red check B: move the `listTagsFn` body (`artifacts.ts:72-74`) into `export function listTagsFromDb() { return listTags(db); }` and call it from the handler. Expect `pnpm build` to exit non-zero. Revert the change. Check B is the case that the old IMPORTANT comment warned about. If it builds green, stop and report, because the sharpened comment would then be wrong.
- Report both red checks' build output in the summary. After reverting, `git diff --stat -- src/components/artifacts/type-badge.tsx` prints nothing.
- No test file is added. The build is the enforcement, and the red checks prove it.
- Manual smoke for the user: run your dev server and open the gallery, a detail page, settings, and docs. The terminal shows no `[import-protection]` line. In dev a leak is mocked and logged, not fatal.

---

## Phase 2 — Client-safe artifact type module

**Goal**: `ArtifactType` and `artifactTypes` live in one client-safe module. No file imports them from `@/database/repository` or `@/lib/artifact-sorts`.

**Decisions**:

- New file `src/lib/artifact-types.ts`: `export const artifactTypes = ['spec', 'html', 'markdown'] as const;` and `export type ArtifactType = (typeof artifactTypes)[number];`. Put both in one place, as `artifact-sorts.ts` does for `artifactSorts`/`ArtifactSort`. Add no module header comment. The name says what the file holds.
- Delete `artifactTypes` from `artifact-sorts.ts:16` and `ArtifactType` from `repository.ts:30`. `repository.ts` imports the type from the new module. Do not re-export from `repository.ts`.
- Delete the `artifact-sorts.ts:1-4` header. The Phase 1 marker on `repository.ts` enforces what it described.
- Switch every importer: `repository.ts`, `repository.unit.test.ts:25,30`, `type-badge.tsx:2`, `gallery.tsx:23`, `artifact-detail.tsx:33`, `artifacts.ts:33`, `answer-count.ts:20`, `mcp/server.ts:7,31`, `download.$id.$n.ts:3`, and `_authed/index.tsx:4-5`. Keep `import type` wherever the import is type-only.
- `Artifact`, `ArtifactVersion`, `ArtifactListItem`, `JsonObject`, and `TagUsage` stay in `repository.ts`. Their UI imports are type-only and erased, so moving them would be churn with no gain in enforcement.

**Scope**: in: `src/lib/artifact-types.ts` (new), `artifact-sorts.ts`, and the importers listed above. The edits are import paths only. Out: moving any other type; renaming `artifact-sorts.ts`.

**Acceptance**:

- `pnpm gate` exits 0. `pnpm build` exits 0.
- `grep -rnE "\bArtifactType\b|\bartifactTypes\b" src testing | grep -E "@/database/repository|@/lib/artifact-sorts"` → no match.
- `grep -rln "@/lib/artifact-types" src | wc -l` → at least 10.
- `grep -c "artifactTypes" src/lib/artifact-sorts.ts` → 0.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note the deviation in the final summary. Stop and report instead of improvising in these cases:

- a locked decision turns out to be wrong or impossible;
- the work requires touching out-of-scope files;
- acceptance cannot be met after a couple of honest attempts.

Stop in particular in these cases:

- The clean `pnpm build` flags a marked module that is reached only through a stripped handler import. Do not work around it with `ignoreImporters` or by dropping the marker.
- The Phase 1 seed-chain check fails with a module-resolution error.

## Done criteria

Machine-checkable; ALL must hold:

- [ ] `pnpm gate` exits 0 and `pnpm build` exits 0 after each phase
- [ ] `grep -rl "@tanstack/react-start/server-only" src | wc -l` → 9
- [ ] Red checks A and B were run and reverted, and their output is in the Phase 1 summary
- [ ] `test -f src/lib/artifact-types.ts` succeeds; no `ArtifactType` import from `@/database/repository` remains
- [ ] `docs/plans/README.md` status row for 22 updated

## Open questions

- Add `pnpm build` to `pnpm gate`? This resolves outside this plan (plan 09 owns the scripts). Default: no. The PR docker job already builds, and a local build would make every gate run slower.
- Add a `CLAUDE.md` Security-invariants bullet? It would read: "Server-only modules import `@tanstack/react-start/server-only`; a client leak fails `pnpm build`." Phase 1 resolves this. Default: the executor proposes the exact line in its summary, and the owner adds it on review.
