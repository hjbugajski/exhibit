# Plan 28 — Replace the nitro-nightly alias with the canonical nitro beta

Swap the `nitro` dependency from an `npm:nitro-nightly@…` alias to an exact pin on the canonical `nitro` package's dated beta line, then fix the two places that name the nightly (README note, one test-harness comment). This plan does not change Nitro config, plugins, or TanStack Start, and does not bump any other dependency.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: S
- **Risk**: MED — the beta has never run with this app; the dev-server path is covered by int tests, the build path only by `pnpm build` / the CI docker job.
- **Depends on**: none. Plan 21 depends on this plan (it relies on `nitro`'s config types and static handler).

## Why this matters

The server/HTTP layer resolves as `nitro-nightly`, so `pnpm audit` and Dependabot security updates (`.github/dependabot.yml`, security-only groups) check a package name that nitro advisories are never filed against: a future nitro CVE would not alert. evlog's optional `nitro` peer range is also unmet. When the alias was introduced (`c5b2aef`) nitro v3 had no maintained channel; the canonical package now publishes dated betas newer than the pinned nightly, so the alias buys nothing.

## Context

Facts verified at planning time (read-only `npm view`, 2026-09-26):

- `npm view nitro dist-tags` → `latest: 3.0.260903-beta` (published 2026-09-03). Beta line: `3.0.260311-beta` … `3.0.260610-beta`, `3.0.260903-beta`. The pinned nightly `3.0.1-20260821-005124-e36e7a60` is from 2026-08-21.
- Neither `nitro@3.0.260903-beta` nor the pinned nightly declares `peerDependencies`; both declare `engines.node: ^20.19.0 || >=22.12.0`.
- `@tanstack/react-start` (installed 1.168.48) has no dependency or peer on `nitro`; the app wires Nitro in itself through `nitro/vite`. So there is no TanStack-imposed nitro range to satisfy.
- `evlog@2.26.0` peers on `nitro: ^3.0.260311-beta`, marked optional (`pnpm-lock.yaml:2841`, `peerDependenciesMeta` at `:2872-2873`). The unmet peer is a warning, not a hard break. `3.0.260903-beta` satisfies it.
- Two nitro advisories reportedly affect `nitro <3.0.260429-beta`. Their IDs are unverified; do not cite them in commits or docs.

Repo touch points:

- `package.json:53` — `"nitro": "npm:nitro-nightly@3.0.1-20260821-005124-e36e7a60"`.
- `pnpm-lock.yaml:86-88` (importer spec), `:73` and `:6196-6201` (evlog resolved against the nightly), `:3387`, `:6668` (package entries). All regenerate from the install; never hand-edit.
- Nitro consumers, unchanged by this plan but exercised by it: `vite.config.ts:5,14-22` (`nitro/vite`, seed and security-headers plugins), `nitro.config.ts:1-2` (`defineConfig`, `evlog/nitro/v3`), `src/lib/seed-plugin.ts:1`, `src/lib/security-headers-plugin.ts:1` (`definePlugin`), `src/lib/request-log.ts:2` (`nitro/context`), `src/routes/__root.tsx:7`.
- `testing/server.ts:40-41` reaches into `vite.environments.nitro.devServer` (internal API); `:50-52` doc comment cites `nitro-nightly/dist/runtime/internal/vite/dev-worker.mjs` and a fixed retry budget (5 tries, 100ms * 2^attempt, about 3.1s; the 3.1s figure repeats at `:56`). The four files that boot this harness (`src/lib/{account,artifacts,auth,auth-mailerless}.int.test.ts`) are the dev-path regression check.
- `README.md:167` — the nightly note, including the "`pnpm outdated` reports it as `nitro-nightly`" sentence.
- `Dockerfile:1-9` — `pnpm install --frozen-lockfile` then `pnpm build`; CI's `docker` job (`.github/workflows/ci.yml:38-51`) builds it on every PR.
- Toolchain: node 26 via `.node-version` + `mise.toml`. The Bash shell's `node` may be stale (24 at planning time); prefix commands with `mise exec --` when `node -v` is not 26.

Cross-phase rules (from `CLAUDE.md`):

- Security invariants hold: public routes unchanged; `/render/:id/:n` keeps CSP `sandbox allow-scripts`; the security-headers plugin must still load.
- Comments follow `/Users/henry/.claude/skills/code-comments/SKILL.md` (stale comments get fixed, not left).

Neighbouring plans: plan 17 rewrites `testing/server.ts:57-59` in the same doc block — touch only the path/budget facts at `:50-52` and `:56`. Plan 18 leaves the README nitro note's facts to others; if it has already reworded `README.md:167`, edit whichever sentence carries the nightly claim.

If the code or the npm registry has drifted from this section since `Planned at`, re-check the decision it supports before proceeding; report material drift rather than silently replanning.

## Gate

`pnpm gate` (typecheck, lint --fix, fmt, test; CI runs the `:check` variants) — plus the build checks under Acceptance.

## How to execute

- Single phase, one fresh session; the user commits.
- The orchestrator dispatches one subagent with this plan's Context, Decisions, Scope, Acceptance, and intent; it verifies with the gate and re-prompts the same subagent on failure.
- On success: a short "what changed, what to test" summary, then stop for user review.

---

## Phase 1 — Swap to the canonical nitro beta

**Goal**: `nitro` resolves from the canonical package at an exact dated beta; no file outside `docs/` names `nitro-nightly`; tests, build, and docker build pass.

**Decisions**:

- `package.json:53` becomes `"nitro": "<version>"`, exact (no caret), where `<version>` is `npm view nitro dist-tags.latest` at execution time, provided it matches `3.0.YYMMDD-beta` and is at least `3.0.260429-beta` (the advisory floor) and dated after 2026-08-21. At planning time that is `3.0.260903-beta`. Why exact: this is a pre-1.0-style prerelease line with date-coded versions; bumps must stay deliberate. If `latest` is not a beta of that shape (e.g. a stable `3.x` shipped), stop and report — that is a different upgrade.
- Regenerate the lockfile with `pnpm install` (no `--frozen-lockfile`); the diff must be limited to nitro and its transitive deps plus evlog's re-resolved peer suffix. If unrelated packages move, stop and report.
- `README.md:167` states: nitro v3 has no stable release; `nitro` is pinned exactly to a dated beta (`3.0.YYMMDD-beta`) of the canonical package and is bumped by hand. Drop the `pnpm outdated`/`nitro-nightly` sentence.
- `testing/server.ts:50`: replace `nitro-nightly/dist/…` with the real path in the installed `nitro` package. Re-read the installed dev-worker's retry loop; if the 5-tries / 100ms * 2^attempt budget changed, correct the numbers at `:51-52` and `:56`. If the file moved or the budget no longer exists, fix the comment to match, and report it.
- No source code changes. If typecheck or tests fail because the beta changed an API (`definePlugin`, `defineConfig`, `nitro/context`, `vite.environments.nitro.devServer`), stop and report the break with the failing symbol — do not adapt app code inside this plan.

**Scope**: in — `package.json`, `pnpm-lock.yaml`, `README.md`, `testing/server.ts` (comment only). Out — `nitro.config.ts` options (plan 21), other dependency bumps, Dependabot config.

**Acceptance**:

- `git grep -n "nitro-nightly" -- ':!docs'` → no matches.
- `grep -c "nitro-nightly" pnpm-lock.yaml` → `0`.
- `pnpm why nitro` → `nitro <version>` (the pinned beta), no alias.
- `pnpm peers check` → no issue that names `nitro`.
- `pnpm audit --prod` → no advisory against `nitro`. If one is listed, stop and report: the chosen beta is vulnerable.
- `pnpm gate` exits 0; the four `*.int.test.ts` files above pass (they boot the real Nitro dev environment, including both plugins).
- `pnpm build` exits 0 and writes `.output/server/index.mjs`.
- `docker build -t exhibit:plan-28 .` exits 0. If Docker is not available locally, say so in the summary; CI's `docker` job then carries this check.
- No tests to add: the change is a dependency swap, and the int tests plus build are the regression check.
- Manual smoke for the user (agent does not run it): run the built server or container, then confirm `/healthz` returns 200, sign-in works, an HTML artifact at `/render/:id/:n` carries `Content-Security-Policy: sandbox allow-scripts`, and responses carry the security headers.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope — note the deviation in the final summary. Stop and report instead of improvising when:

- a locked decision turns out to be wrong or impossible,
- the work requires touching out-of-scope files (any `src/` change counts),
- acceptance can't be met after a couple of honest attempts.

Plan-specific risk: the beta and the nightly come from different release pipelines, so a nightly-only fix may be absent from the beta. A failure in the int tests, `pnpm build`, or docker build after the swap is that case — report it with the error; the fallback (pin a newer nightly or wait for the next beta) is the user's call.

## Done criteria

Machine-checkable; ALL must hold:

- [ ] `pnpm gate` exits 0
- [ ] `git grep -n "nitro-nightly" -- ':!docs'` → no matches
- [ ] `package.json` `nitro` value is an exact `3.0.YYMMDD-beta` string, no `npm:` prefix
- [ ] `pnpm peers check` names no `nitro` issue
- [ ] `pnpm build` exits 0
- [ ] Docker build exits 0 locally, or its absence is reported
- [ ] `docs/plans/README.md` status row updated

## Open questions

- Should Dependabot open version-update PRs for `nitro` now that the name is canonical (currently `open-pull-requests-limit: 0`, security-only)? Default: no — keep hand bumps; out of scope here.
