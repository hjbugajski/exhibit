# Plan 09 — Deny lint warnings, remove db:push, add a read-only check script and migration-drift gate, lint process.env

Turn four prose-only conventions into machine checks: lint warnings fail the hook, gate and CI; `process.env` outside `src/lib/env.ts` and a fixed exception list fails lint; a schema change without its migration fails CI; and one read-only `pnpm check` script runs exactly what CI runs, including the CI fuzz depth. The forbidden `db:push` script goes away. Out of scope: promoting individual warn rules to error, type-aware linting in the pre-commit hook, and any source-code change (the tree is clean for every new rule today).

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none

## Why this matters

Commit `ffee99b` (#14) cleared every lint warning by hand, and nothing keeps the count at zero: `lint:check` exits 0 with warnings. `pnpm db:push` is one tab-complete away although `CLAUDE.md` forbids it, and no CI step catches a schema change merged without its migration, which breaks production boot (migrations run from SQL on boot). A green local `pnpm gate` does not predict a green CI, because the fuzz tests run fewer seeds locally and the gate rewrites files. The env.ts-only rule is prose, so one stray `process.env` read skips boot-time validation.

## Context

- `package.json:16` — `"db:push": "drizzle-kit push"`. `:21-22` — `lint` / `lint:check` run `oxlint --type-aware --disable-nested-config` with no `--deny-warnings`. `:24` — `gate` (typecheck, lint --fix, fmt, test). `:90-99` — `simple-git-hooks` pre-commit runs `nano-staged`, whose TS/JS entry runs bare `oxlint --fix` (`:95`).
- `.oxlintrc.json:3` — `reportUnusedDisableDirectives: "warn"`. Warn-level rules: `no-console` (`:29`), `label-has-associated-control` (`:34`), `no-explicit-any` (`:44`), `no-non-null-assertion` (`:46`). `:4-14` — plugin list, no `node`. `:60-65` — the one existing override (`no-console` off for scripts).
- `.github/workflows/ci.yml:22-25` — PR `lint` job runs install, `fmt:check`, `lint:check`, `typecheck`; `:37` — the `test` job runs `pnpm test`. `ci.yml:3` notes that main pushes are checked by `release.yml`'s verify job instead.
- `.github/workflows/release.yml:28-32` — verify job: install, then the same four commands serially.
- `src/lib/diagram/fuzz.unit.test.ts:25-30` — seeds: `DIAGRAM_FUZZ=wide` 12, `process.env.CI` 3, else 1. `src/lib/diagram/core/graph/fuzz.unit.test.ts:88-90` — CI or `wide` 4, else 1. GitHub Actions sets `CI=true`.
- `drizzle.config.ts:5-7` — schema `./src/database/schemas`, out `./src/database/migrations` (4 SQL files plus `meta/`). `drizzle-kit generate` diffs the schema against the last `meta/` snapshot and opens no DB; on a scratch copy at `ffee99b` it reported "No schema changes".
- `process.env` readers at `ffee99b` (`git grep -n "process\.env"`): `src/lib/env.ts:53`, `drizzle.config.ts:7`, `nitro.config.ts:19`, `scripts/dev-publish.ts:28`, `testing/setup.ts:7-9`, and test files. `vitest.config.ts:14` mentions it only in a comment. Test files are both `*.test.ts` (90) and `*.test.tsx` (42).
- `CLAUDE.md:13` (gate line), `:15` (push ban), `:22` (env rule with an exception list that omits `nitro.config.ts`).

Verified at planning time (read-only, oxlint 1.79.0):

- `oxlint --help` lists `--deny-warnings` ("Ensure warnings produce a non-zero exit code"). `lint:check` plus `--deny-warnings` on the current tree prints nothing and exits 0.
- `node_modules/oxlint/configuration_schema.json` defines `node/no-process-env` and accepts `node` in `plugins`. A scratch copy of `.oxlintrc.json` with the plugin, the rule at `error` and the override set below produced zero diagnostics with `--deny-warnings`.

- The `CLAUDE.md:15` wording "drifts the `meta/` snapshot" is inaccurate: push writes nothing to `meta/`. Its real harm is a local DB changed with no migration file.

Cross-phase rules (from `CLAUDE.md`): env vars only via `src/lib/env.ts`; schema changes only through `pnpm db:generate`, forward-only, SQL and snapshot committed together; no lint-disable comments to silence a rule; do not start dev servers.

Domain skill the executor must follow: `/Users/henry/.claude/skills/code-comments/SKILL.md` — any YAML comment added to the workflows states why, not what. Do not add a comment that restates a step name.

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before you proceed. Report material drift. Do not replan silently.

## Gate

`pnpm gate` (typecheck, lint with fix, fmt, test) closes the phase. CI runs the `:check` variants. After this plan lands, `pnpm check` is the read-only equivalent and must also pass. If the shell's `node -v` is not 26, prefix with `mise exec --`.

## How to execute

- Single phase, one fresh session; the user commits.
- The orchestrator dispatches ONE subagent (`Task` tool, `subagent_type: general-purpose`) with this plan's Context, the Decisions/Scope/Acceptance below, and the intent. It verifies with the gate and re-prompts the SAME subagent on failure. It does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for user review.

---

## Phase 1 — Toolchain guardrails

**Goal**: warnings, stray `process.env` reads and migration drift each fail a command that CI runs. `pnpm check` runs the CI checks at CI depth and writes nothing.

**Decisions**:

- `package.json` scripts:
  - Append `--deny-warnings` to `lint` and `lint:check`.
  - Change the nano-staged entry to `oxlint --fix --deny-warnings`. It stays without `--type-aware`: the hook lints staged files only, and CI holds the type-aware line.
  - Delete `db:push`.
  - Add `"check": "pnpm fmt:check && pnpm lint:check && pnpm typecheck && CI=1 pnpm test"`, after `gate`. The order matches CI.
  - `gate` is unchanged. It stays the fixer.
- No new fuzz knob and no fuzz-file edit: `CI=1` reproduces the CI environment exactly (the seed tiers above, plus Vitest's CI snapshot behavior, where a missing snapshot fails instead of being written). `DIAGRAM_FUZZ=wide` stays the deliberate deep pass.
- `ci.yml` keeps its split `lint` / `test` / `docker` jobs (`test` and `docker` depend on `lint`). Only `release.yml`'s serial verify job collapses to `pnpm check`.
- Warn-level rules stay at `warn`. `--deny-warnings` makes them blocking in the hook, gate and CI, and the editor still shows them as warnings, so no severity edits are needed.
- `.oxlintrc.json`:
  - Add `"node"` to `plugins`, in alphabetical position.
  - Add `"node/no-process-env": "error"` to `rules`.
  - Add a second `overrides` entry that turns the rule off for exactly these files: `src/lib/env.ts`, `drizzle.config.ts`, `nitro.config.ts`, `scripts/dev-publish.ts`, `testing/**`, `**/*.test.ts` and `**/*.test.tsx`.
  - Keep it separate from the `no-console` override, because the file sets differ. Do not exempt `vitest.config.ts`, because it has only a comment mention.
- Migration-drift step, identical in `ci.yml`'s `lint` job (after `typecheck`) and in `release.yml`'s verify job (after `pnpm check`):

  ```yaml
  - name: Check migration drift
    timeout-minutes: 2
    run: |
      pnpm db:generate
      drift="$(git status --porcelain src/database/migrations)"
      test -z "$drift" || { echo "$drift"; echo "Schema changed without a committed migration: run pnpm db:generate."; exit 1; }
  ```

  Use `git status --porcelain`, not `git diff`, so new untracked SQL files count as drift. `timeout-minutes` bounds a run where drizzle-kit waits on an interactive rename prompt with no TTY.

- `release.yml` verify: replace the four `run` steps (`:29-32`) with `- run: pnpm check`, then the drift step.
- `CLAUDE.md`:
  - `:13` — split into two bullets. `pnpm check` is the read-only CI mirror (fmt:check, lint:check, typecheck, test at CI fuzz depth); run it before you claim done. `pnpm gate` is the fixer (typecheck, lint --fix, fmt, test).
  - `:15` — replace the push clause with the accurate harm (push changes the local DB and writes no migration file, so production boot diverges). Add that CI fails on migration drift, and that no `db:push` script exists.
  - `:22` — make the exception list match the override exactly, and state that `node/no-process-env` enforces it.

**Scope**: in — `package.json`, `.oxlintrc.json`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `CLAUDE.md`. Out — `README.md:152`: see Open questions. Fuzz test files: the knob already exists. `drizzle.config.ts` and source code: no violations to fix.

**Acceptance**:

- `pnpm check` → exits 0. `git status --porcelain` is byte-identical before and after the run.
- `pnpm gate` → exits 0.
- `grep -n 'db:push' package.json` → no match. `grep -c -- '--deny-warnings' package.json` → `3`.
- Negative probes. Make each probe separately, run the command, then revert the probe with `git checkout -- <file>`:
  - Add `export const probe: any = 1;` to `src/lib/mailer.ts` → `pnpm lint:check` exits non-zero on `typescript(no-explicit-any)`.
  - Add `export const probe = process.env.PROBE;` to `src/lib/mailer.ts` → `pnpm lint:check` exits non-zero on `node(no-process-env)`.
- `pnpm db:generate` on the clean tree → reports no schema changes. `git status --porcelain src/database/migrations` → empty.
- `grep -n 'pnpm check' .github/workflows/release.yml` → one match. `grep -c 'Check migration drift' .github/workflows/*.yml` → `ci.yml:1`, `release.yml:1`.
- No tests to add. The guardrails are config, and the probes above prove them.
- Manual smoke for the user, after the executor finishes. Open a throwaway PR that adds a nullable column to `src/database/schemas/artifact.ts` without a migration → the `lint` job fails at "Check migration drift". Close the PR.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note the deviation in the final summary. Stop and report instead of improvising when:

- a locked decision turns out to be wrong or impossible (for example, oxlint rejects an override glob, or `--deny-warnings` behaves differently with `--fix`),
- the work requires touching out-of-scope files (for example, a new warning or `process.env` hit appears in source after `ffee99b`: report it, and do not fix it or exempt it silently),
- acceptance can't be met after a couple of honest attempts.

## Done criteria

Machine-checkable; ALL must hold:

- [ ] `pnpm gate` exits 0, and `pnpm check` exits 0 with no working-tree change
- [ ] `package.json` has no `db:push` and has three `--deny-warnings` occurrences
- [ ] Both negative lint probes fail `pnpm lint:check`, and both are reverted
- [ ] "Check migration drift" appears once in `ci.yml` and once in `release.yml`, and release verify runs `pnpm check`
- [ ] `CLAUDE.md` names `pnpm check` as the pre-done command, and its env exception list matches `.oxlintrc.json`
- [ ] `docs/plans/README.md` status row updated

## Open questions

- README developer commands (`README.md:152` lists `pnpm gate`): add a `pnpm check` line? Recommended default: no. Agents reach `check` through `CLAUDE.md`, and the README's `pnpm gate` line stays accurate. Resolve in Phase 1 only if the user asks.
- Should `pnpm check` also run the drift check? Recommended default: no. `db:generate` writes files on drift, which breaks the read-only contract, and CI already runs the check.
