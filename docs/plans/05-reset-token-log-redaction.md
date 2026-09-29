# Plan 05 — Keep password-reset tokens out of the evlog request log

Stop evlog from writing the live password-reset token to stdout when the owner opens an emailed reset link, and prove it with a test that drives evlog's real Nitro plugin. Add one README note that reverse-proxy access logs still record the link. This plan does not change the reset flow, Better Auth config, or any proxy setup.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none

## Why this matters

Better Auth puts the reset token in the URL path: `/api/auth/reset-password/<token>`. evlog logs the pathname of every request, so the owner's click writes a working credential to container logs. It stays valid until the reset completes or up to 1 hour passes. Anyone who can read the logs (`docker logs`, a shared aggregator, a future drain) can reset the owner password and take over the gallery. The leak only happens when Resend is configured. Severity is moderate: exploiting it needs log access, and the window is short.

## Context

- `node_modules/better-auth/dist/api/routes/password.mjs:82` builds the emailed link as `${baseURL}/reset-password/${token}?callbackURL=…` under basePath `/api/auth`. `:74` sets the expiry (default 3600 s). `:128` redirects to the callback with the token in `?token=`. `/reset-password/:token` is the only Better Auth or oauth-provider endpoint that carries a credential in the path. Email verification uses `?token=` (`email-verification.mjs:30`).
- `node_modules/evlog/dist/nitro/v3/plugin.mjs:135-148` is the request hook. It parses `pathname` (query dropped), computes `shouldLog(pathname, include, exclude)` at `:137`, and seeds the event's `path` at `:146`. The response hook (`:153-178`) and error hook (`:179-216`) emit only when `_evlogShouldEmit` is true, so an excluded path emits nothing on success or on error.
- `nitro.config.ts:15-20` configures evlog with `env` and `enabled: process.env.NODE_ENV !== 'test'`. It has no `include`, `exclude`, or `redact`.
- evlog's `exclude` is `string[]` of globs (`node_modules/evlog/dist/nitro-0F0w6a3_.d.mts:38-43`). In `node_modules/evlog/dist/utils.mjs:139-157`, `*` matches one segment (`[^/]*`) and `**` matches across segments. `matchesPattern` is not in evlog's `exports` map, so a test can't import it.
- The evlog Nitro module serializes its options with `JSON.stringify` (`node_modules/evlog/dist/nitro/v3/module.mjs:22-25`). `setup()` pushes the plugin's absolute path, without an extension, into `nitro.options.plugins` (`:14-15`). It also sets `process.env.__EVLOG_CONFIG`, which is what the plugin reads outside a Nitro bundle (`nitroConfigBridge-C1PaDQe1.mjs`, `resolveEvlogConfigForNitroPlugin`).
- Why not `redact`. `RedactConfig.patterns` is typed `RegExp[]`, and a `RegExp` serializes to `{}`. evlog's `normalizeRedactConfig` (`redact-C7FmdhwI.mjs:409`) silently drops `{}` entries via `deserializeRegexList` (`:426-444`). A string pattern works at runtime but fails typecheck. Adding any `redact` object also changes the built-in PII masking. Today `redact` is unset, so `initLogger` masks in production only (`audit-DZIXf7Z8.mjs:81`, `redact ?? !isDev()`). `exclude` avoids all of this. This plan locks `exclude`.
- Out of scope, residual: a reverse proxy's access log records the full reset URL, path and query. The README note covers this. Also, evlog passes the raw `request.path` to `evlog:enrich` and `evlog:drain` hook contexts (`plugin.mjs:32-39`). The repo registers no such hooks today (`grep -rn "evlog:" src` finds nothing).
- Exemplar for a small `src/lib` Nitro-side module plus a colocated unit test: `src/lib/security-headers-plugin.ts` and `src/lib/security-headers-plugin.unit.test.ts`. That module uses relative imports because Nitro loads it outside Vite's `@/*` alias (`src/lib/security-headers-plugin.ts:3`). Console-spy exemplar: `src/lib/auth.unit.test.ts:52`.

Cross-phase rules (from CLAUDE.md):

- Kebab-case filenames, no barrel files. Tests go next to the source file as `*.unit.test.ts` and must match vitest's `src/**/*.test.{ts,tsx}` include (`vitest.config.ts:12`).
- App code reads env only through `src/lib/env.ts`, never `process.env`. `nitro.config.ts` is build config and keeps its existing `process.env.NODE_ENV` read.
- Modules that Nitro config imports use relative imports, never `@/*`.
- Don't start dev servers. Don't run installs.
- Comments follow `/Users/henry/.claude/skills/code-comments/SKILL.md`. The README bullet follows `/Users/henry/.claude/skills/writing-style/SKILL.md`.

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before you proceed. Report material drift. Don't silently replan.

## Gate

`pnpm gate` (typecheck, lint --fix, fmt, test) closes the phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If the shell's `node -v` differs from `mise current`, prefix commands with `mise exec --`.

## How to execute

- Single phase, one fresh session. The user commits.
- The orchestrator dispatches one subagent (`Task`, `subagent_type: general-purpose`) with this plan. It verifies with the gate and re-prompts the same subagent on failure.
- On success, the subagent returns a short "what changed, what to test" summary, then stops for user review.

---

## Phase 1 — Exclude the token-bearing reset path from the request log

**Goal**: evlog emits no event for `GET /api/auth/reset-password/<token>`. Every other request, including `POST /api/auth/reset-password` and `GET /reset-password?token=…`, logs as before. A unit test proves this through evlog's real Nitro plugin and its serialized config.

**Decisions**:

- New module `src/lib/request-log-options.ts` exports `requestLogOptions`, typed with `NitroModuleOptions` via `import type` from `evlog/nitro` (the `evlog/nitro/v3` entry does not export the type; both resolve to the same interface in `nitro-0F0w6a3_.d.mts`). Contents: `env: { service: 'exhibit' }` (moved from `nitro.config.ts:16`) and `exclude: ['/api/auth/reset-password/*']`. Use single-segment `*`: it matches the token segment but not the bare `/api/auth/reset-password` POST, which carries no token and stays logged. Add a doc comment on the export. It states the reason only: Better Auth puts the live reset token in that path, and evlog logs pathnames.
- `nitro.config.ts` calls `evlog({ ...requestLogOptions, enabled: process.env.NODE_ENV !== 'test' })`. Import via relative path `./src/lib/request-log-options.ts`. The existing `enabled` comment (`:17-18`) stays with `enabled`. `enabled` stays out of the src module so that module never reads `process.env`.
- New test `src/lib/request-log-options.unit.test.ts` drives evlog's real plugin, never a reimplementation of its matching: run `evlog({ ...requestLogOptions, enabled: true, pretty: false }).setup()` on a stub Nitro (`{ options: {} }` cast to `Nitro` from `nitro/types`), import the registered plugin path plus `.mjs`, run it against a stub `nitroApp` that records `hooks.hook` handlers, then fire `request` and `response` per case. Capture output with a silenced `console.info` spy (`pretty: false` emits one JSON line per event via `console[level]`).
- Test cases (token = a 24-char alphanumeric literal, matching `generateId(24)` at `password.mjs:75`):
  1. `GET http://localhost/api/auth/reset-password/<token>?callbackURL=%2Freset-password` → zero captured lines, and no captured text contains the token.
  2. `POST http://localhost/api/auth/reset-password` → exactly one line, with `path` `/api/auth/reset-password`. This proves the harness captures output, so case 1 can't pass vacuously.
  3. `GET http://localhost/reset-password?token=<token>` → one line, with `path` `/reset-password` and no token anywhere in it.
- README: add one bullet to "Auth and proxy notes" (`README.md:102-106`). It says that password-reset links carry a live token (valid up to 1 hour) in the URL, that the app's request log omits it, and that a reverse proxy's access log still records it, so restrict who can read those logs.

**Scope**: in: `src/lib/request-log-options.ts` (new), `src/lib/request-log-options.unit.test.ts` (new), `nitro.config.ts`, `README.md`. Out: `src/lib/auth.ts` and the reset email link, since changing the flow is a larger behavior change (see Open questions). Also out: evlog `redact`, `evlog:enrich`/`evlog:drain` hooks, and proxy configuration.

**Acceptance**:

- `pnpm gate` exits 0.
- `pnpm vitest run src/lib/request-log-options.unit.test.ts` → 3 tests pass.
- Temporarily set `exclude` to `[]` → case 1 fails. Revert. Mention this check in the summary.
- `grep -n "exclude" nitro.config.ts` → no match (the list lives only in `requestLogOptions`).
- `grep -rn "process.env" src/lib/request-log-options.ts` → no match.
- Manual smoke (user, Resend configured): request a reset, open the emailed link, and confirm `docker logs` shows no line containing the token. `GET /reset-password` still logs.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note each deviation in the final summary. Stop and report instead of improvising when:

- a locked decision is wrong or impossible,
- the work requires touching out-of-scope files,
- acceptance can't be met after a couple of honest attempts.

Plan-specific risk: the test depends on evlog's plugin shape. That covers the registered plugin path, the `request`/`response` hook names, `event.req.url`, and `event.req.context`. If the plugin can't be driven that way, stop and report. Don't fall back to asserting on the `exclude` array alone, because that test proves nothing about what gets logged.

## Done criteria

- [ ] `pnpm gate` exits 0
- [ ] `src/lib/request-log-options.unit.test.ts` exists, and its three cases pass
- [ ] `nitro.config.ts` spreads `requestLogOptions` and still sets `enabled` from `NODE_ENV`
- [ ] `README.md` "Auth and proxy notes" has the proxy access-log bullet
- [ ] `docs/plans/README.md` status row updated

## Open questions

- Root-cause alternative: have `sendResetPassword` (`src/lib/auth.ts:53`) email `${BASE_URL}/reset-password?token=<token>` directly. The token then never appears in any path. Recommended default: not in this plan. It skips Better Auth's pre-validation redirect (`password.mjs:124-128`), and proxies log query strings anyway, so it doesn't close the proxy leak.
