# Plan 26 — Make pnpm seed read .env and fix the dev-publish run line

Make `pnpm seed` load `.env` when the file exists, so the workflow that `.env.example` describes works without exported shell vars. Change the `scripts/dev-publish.ts` run line from `127.0.0.1` to `localhost`, to match `README.md` and Better Auth's origin check. This plan does not retire `pnpm seed`, change the boot seeding, change `src/lib/env.ts`, or edit `README.md` / `.env.example`.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none

## Why this matters

`.env.example:14-17` says `OWNER_*` are "Also consumed by `pnpm seed`". But `package.json:18` runs plain `node`, which does not read `.env`. So a developer with only `.env` populated gets `Invalid environment` from `src/lib/env.ts:55-57` (required `BASE_URL` at `:18` and `BETTER_AUTH_SECRET` at `:19`), which looks like a broken `.env`. Separately, the `dev-publish.ts` header tells an agent to use `BASE_URL=http://127.0.0.1:PORT`. Better Auth rejects requests whose Origin does not match `BASE_URL`, and `vite dev` binds `::1`, so an agent that copies that line gets connection refused or "Invalid origin".

## Context

- `package.json:18` — `"seed": "node scripts/seed.ts"`.
- `scripts/seed.ts:1-11` — header. `:4` says `Run with: pnpm seed  (or: node scripts/seed.ts)`. After this plan the bare `node` form no longer loads `.env`, so that alternative becomes misleading. `:19-22` is the script's own guard for missing `OWNER_*` (they are optional in the schema, `src/lib/env.ts:24-25`).
- `scripts/dev-publish.ts:9-10` — the run line with `127.0.0.1`. The script reads `process.env` directly through `requireEnv` (`:27-36`).
- `README.md:162` — already shows the correct `localhost` form of the dev-publish command. The header must match it.
- `src/lib/seed-plugin.ts:18-24` — boot seeding at server start. It makes `pnpm seed` mostly redundant for Docker; the script stays (see Open questions).
- `src/database/index.ts:14-16` — `DATABASE_PATH` of `:memory:` skips the directory creation and opens an in-memory database. The acceptance check uses this to avoid a write to the owner's real `data/app.db`.
- `--env-file-if-exists` exists since Node 22.9; `.node-version` pins 26, and a stale shell Node 24 also has it. Verified at planning time: a missing file prints `<file> not found. Continuing without it.` to stderr and the process continues with exit 0; a variable already in the shell environment takes precedence over the file value. So current usage with exported vars does not change.
- `.env` is gitignored (`.gitignore:20`) and holds secrets. The executor never prints, reads into output, or modifies it.

Don't start dev servers (CLAUDE.md).

Domain skill the executor must follow: `/Users/henry/.claude/skills/code-comments/SKILL.md` (the two header edits are comment fixes: state the constraint, no journal wording).

Overlap with other plans: plan 09 edits other lines of `package.json` (`:16`, `:21-22`, `:24`, hooks), and plan 18 rewrites `.env.example` prose. Both are line-disjoint from this plan. If either landed first, re-locate the `seed` line by content, not by line number.

## Gate

`pnpm gate` (typecheck, lint --fix, fmt, test) closes the phase. If the shell's `node -v` is not 26, prefix with `mise exec --`.

## How to execute

- One fresh session; the user commits.
- The orchestrator dispatches ONE subagent with this plan's Context, the phase below, and the intent. It verifies with the gate and re-prompts the same subagent on failure; it does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for user review.

## Phase 1 — Seed script loads .env; dev-publish header uses localhost

**Goal**: `pnpm seed` succeeds with only `.env` populated, and the `dev-publish.ts` run line works when copied against a default dev server.

**Decisions**:

- `package.json:18` becomes exactly `"seed": "node --env-file-if-exists=.env scripts/seed.ts"`. Use `--env-file-if-exists`, not `--env-file`: `--env-file` exits with an error when `.env` is absent, which would break a checkout that exports every var in the shell. pnpm runs scripts from the package root, so the relative `.env` path resolves to the repo root.
- `scripts/seed.ts:4` — replace the run line so that it names only `pnpm seed` and states the constraint: the script loads `.env` when present, and exported shell vars take precedence. Drop the `(or: node scripts/seed.ts)` alternative. Keep the rest of the header (`:1-3`, `:6-10`) unchanged.
- `scripts/dev-publish.ts:10` — change `BASE_URL=http://127.0.0.1:PORT` to `BASE_URL=http://localhost:PORT`. Keep the rest of the line and the explicit `OWNER_*` vars. Do not add `--env-file-if-exists` to dev-publish: its usual targets are throwaway servers on other ports, where the `.env` `BASE_URL` would be wrong, and the README command (`README.md:162`) would then need a change too.
- No new tests. The change is a script flag and two comments; no test harness covers `package.json` scripts, and the flag behavior is Node's. The acceptance command below is the regression check.

**Scope**: in — `package.json` (the `seed` line only), `scripts/seed.ts` (header comment only), `scripts/dev-publish.ts` (header comment only). Out — `README.md` (already correct), `.env.example` (its claim becomes true; plan 18 owns its prose), `src/lib/seed-plugin.ts` and `src/lib/env.ts` (no behavior change needed).

**Acceptance**:

- `grep -n '"seed"' package.json` → `"seed": "node --env-file-if-exists=.env scripts/seed.ts",`
- `grep -n '127.0.0.1' scripts/dev-publish.ts` → no matches. `grep -n 'localhost:PORT' scripts/dev-publish.ts` → one match in the header.
- `grep -n 'node scripts/seed.ts' scripts/seed.ts` → no matches.
- With a `.env` in the repo root that sets `BASE_URL` and `BETTER_AUTH_SECRET`: `env -u BASE_URL -u BETTER_AUTH_SECRET -u OWNER_EMAIL -u OWNER_PASSWORD DATABASE_PATH=:memory: pnpm seed` → output does not contain `Invalid environment`. It prints `Created owner user ...` when `.env` sets `OWNER_*`, or the script's own `OWNER_EMAIL and OWNER_PASSWORD environment variables are required` guard (exit 1) when it does not. Both outcomes prove `.env` was loaded. If no `.env` exists, report that and skip this check; do not create one.
- `pnpm gate` exits 0.
- Manual smoke for the user: with only `.env` populated, run `pnpm seed` against the real database → `Created owner user ...` or `... already exists, skipping`.

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope; note the deviation in the final summary. Stop and report instead of improvising when a locked decision turns out to be wrong or impossible, the work requires touching out-of-scope files, or acceptance can't be met after a couple of honest attempts.

## Done criteria

- [ ] `pnpm gate` exits 0
- [ ] `package.json` `seed` script uses `node --env-file-if-exists=.env`
- [ ] `scripts/dev-publish.ts` contains no `127.0.0.1`
- [ ] `scripts/seed.ts` header names only `pnpm seed` and states the `.env` / shell precedence
- [ ] `docs/plans/README.md` status row for 26 updated

## Open questions

- Retire `pnpm seed` instead, because boot seeding (`src/lib/seed-plugin.ts:18-24`) covers every deployment path? Resolves before Phase 1. Recommended default: keep it. It seeds a dev database without a server boot, and the fix is one flag. Retiring it would also require edits to `.env.example:16-17`, which plan 18 owns.
