# Plan 19 — Test hygiene: order independence, negative boundary cases, mock reset, brittle selectors, example validation

Make the suite independent of test order and mock history, add the missing negative cases at the env, search-param and metadata boundaries, and replace class-name and side-channel assertions with public seams. Also pull the dev scripts' specs and plain-node import chains into `pnpm test`, and seed auth/OAuth rows in the migration upgrade test. Test-only, plus one `vitest.config.ts` key: no product source changes.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none

## Why this matters

`auth.int.test.ts` passes only in file order: run the change-email case alone and it fails at sign-in, which reads as an auth regression. Module-factory mocks keep call history across tests, and three files use different ad-hoc patches to cope. Removing an env refine, a search-param sanitizer or a metadata bound leaves the suite green. An `@/` import leaking into the seed chain passes CI and breaks `pnpm seed` in production.

## Context

- `vitest.config.ts:10-20` — `test` block; no `mockReset`/`clearMocks`. Vitest is 4.1.11: `mockReset()` restores a `vi.fn(impl)` to `impl` (`@vitest/spy` `dist/index.d.ts:186`), so factory defaults like `artifact-detail.unit.test.tsx:16-22` survive a config-level reset. A stub set with `.mockResolvedValue` outside a test is wiped: the only one is `src/lib/mcp/auth.unit.test.ts:43`.
- Ad-hoc resets to delete: `src/components/account/settings-view.unit.test.tsx:31-33`, `src/components/artifacts/artifact-detail.unit.test.tsx:93-94`, `src/components/artifacts/edit-artifact-dialog.unit.test.tsx:37`, `src/components/artifacts/home.unit.test.tsx:43`. The per-file `vi.restoreAllMocks()` calls stay: they restore `spyOn` descriptors, which `mockReset` does not.
- `src/lib/auth.int.test.ts:141-183` — the change-password case (`:142`) leaves the owner on `NEW_PASSWORD`. `:173` depends on that state. The change-email case signs in with `NEW_PASSWORD` at `:215`. The sign-in rate limit is 3 per 10 s per (IP, path) (`:79-85`), so every sign-in keeps a distinct `203.0.113.x` address.
- `src/lib/seed.unit.test.ts:3-5` — `seedOwner` uses the module-level `db` from `src/database/index.ts:22`, so `createTestDb()` cannot be injected. The case at `:16` expects `created: true` and holds only when it runs first. It fails under shuffle, not in isolation. `user` deletes cascade to `account`/`session` (`src/database/schemas/auth.ts:43,58`).
- `src/lib/env.ts:39-46` — the two pairing refines. `:55-56` — the boot-time `Invalid environment` throw. `:49-51` — `''` counts as unset. `src/lib/env.unit.test.ts:3-30` covers `TRUSTED_PROXIES` only, using the `vi.resetModules()` + dynamic `import('./env')` pattern.
- `src/routes/_authed/index.tsx:18-36` — `validateSearch`. `src/routes/_authed/index.unit.test.ts:12-19` — the `validate` helper, typed to `archived`/`deleted` only.
- `src/lib/artifact-metadata.ts:15-19` — `titleField` (1-200), `descriptionField` (≤2000), `tagField` (≤50), `tagsField` (≤20). Shared by `src/lib/mcp/server.ts:158-160,208-210,258-260,322-324` and `src/lib/artifacts.ts:151-153`. The only bound case today is `src/lib/mcp/server.int.test.ts:684-699` (rename target). `update_artifact` cases start at `:223`.
- `src/components/markdown/catalog-dispatch.tsx:105` — the error `<div className="text-danger text-sm">`. Both messages start with `This exhibit block` (`:143`, `:159`). Tests select `.text-danger` at `src/components/markdown/catalog-dispatch.unit.test.tsx:132,140,164,171`.
- `src/lib/auth-mailerless.int.test.ts:101-107` — reads `user.email` from the DB after `/change-email`. `src/lib/auth.int.test.ts:96-101` `getSessionUserEmail` is the public-seam pattern to copy.
- `src/database/repository.unit.test.ts:759-762` — `tagsOf` reads `artifacts.tags` with raw drizzle. Used at `:786-788,802,822-823,846-847,879`. `getArtifact` (`src/database/repository.ts:358-366`) returns `{ artifact, version }` and excludes soft-deleted rows.
- `scripts/examples/*.ts` — four spec examples export `{ title, description, tags, spec }`: `decisionMemoExample`, `researchSummaryExample`, `roadTripExample` (`road-trip.ts:266`), `statusReportExample`. `markdownNotesExample` has no spec. `src/catalog/validate.unit.test.ts:12-22` holds the valid-fixture `it.each` table. `vitest.config.ts:12` includes only `src/**` tests, but a test there can import from `scripts/` (tsconfig includes `**/*.ts`, `allowImportingTsExtensions`).
- Plain-node chains: `scripts/seed.ts:13-14` (→ `env`, `seed`, `auth`, `mailer`, `database/*`) and `scripts/dev-publish.ts:14-25` (→ catalog fixtures, `testing/oauth-client.ts`, examples). With an empty env, `seed.ts` throws `Invalid environment` from `env.ts:56`, and `dev-publish.ts:30-31` prints `BASE_URL environment variable is required` and exits 1. ESM resolves the whole graph before evaluation, so an unresolvable `@/` import fails first with `ERR_MODULE_NOT_FOUND`. Alias rule: `src/lib/auth.ts:7-10`, `src/database/index.ts:4-7`, `src/lib/seed.ts:1-4`.
- `src/database/migrations.int.test.ts:24-89` — builds a base folder holding only journal entry 0, seeds artifact rows through raw SQL (`:55-69`), then migrates to head. `0002_silly_firebrand.sql:38-39` adds `account.issuer` (default `'local:credential'`) plus a unique index. `:52-53` backfills `oauth_client.application_type` from `type`. `0003_pale_nehzno.sql:1-2` drops `public`/`type`. Base DDL: `0000_rare_quasar.sql:33` (`account`), `:59` (`oauth_access_token`), `:81` (`oauth_client`), `:117` (`oauth_consent`), `:131` (`oauth_refresh_token`), `:152` (`session`), `:166` (`user`). `openDatabase` already throws on `foreign_key_check` violations (`src/database/open.ts:33-37`).

Deviations from the brief, locked here:

- The ExhibitError gets no `role="alert"`. The house Alert keeps static messages out of live regions (`src/components/ui/alert.tsx:38-41`), and this error renders on page load. Tests query the product copy instead. No product change.
- Not acted on: TESTS-07 (recomputed expectations). `spacing`/`cluster`/`canvas-transform` assert definitional formulas in named constants beside literal cases. A literal `RelativeTime` title needs process-wide locale and TZ pinning. Also not acted on: the `purgeArtifact` cascade reads (`repository.unit.test.ts:692-697`, where the schema is the subject), the `emailVerified` read at `auth-mailerless.int.test.ts:77-83`, and the "applies nothing" read at `auth.int.test.ts:231-237`. These reads check the source of truth on purpose.
- `updateArtifactMetadataFn` gets no bound cases: it uses the same shared fields, and the MCP cases pin the constants.

Cross-phase rules (from `CLAUDE.md`): kebab-case filenames; no barrels; tests colocated as `.unit.test.ts(x)` / `.int.test.ts`, shared helpers from `@testing/*`; env only via `src/lib/env.ts` in app code (tests may set `process.env`); the seed chain uses relative imports, never `@/*`; migrations are forward-only and are never edited here. Test names state behavior; comments state why.

Domain skills the executor must follow:

- `/Users/henry/.claude/skills/tdd/SKILL.md` and `/Users/henry/.claude/skills/tdd/references/tests.md` — test at the seams named in Acceptance; no side-channel or tautological assertions; each new negative case gets a red check (break the guarded code, watch it fail, revert).
- `/Users/henry/.claude/skills/code-comments/SKILL.md` — delete comments that the change makes stale (e.g. `settings-view.unit.test.tsx:31-32`, `seed.unit.test.ts:26-28`); no journal comments.

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before you proceed. Report material drift. Do not replan silently.

## Gate

`pnpm gate` (typecheck, lint with fix, fmt, test) closes every phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If `node -v` is not 26, prefix with `mise exec --`.

## How to execute

- One phase per fresh session; the user commits between phases.
- The orchestrator dispatches ONE subagent per phase (`Task`, `subagent_type: general-purpose`) with this plan's Context, the phase's Decisions/Scope/Acceptance, and the intent. It verifies with the gate and re-prompts the SAME subagent on failure. It does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for user review.

## Phases

1. Config-level mock reset and order-independent auth/seed suites.
2. Negative cases at the env, search-param and metadata boundaries.
3. Public-seam selectors and reads.
4. Scripts in the suite: example specs and plain-node import chains.
5. Auth and OAuth rows in the migration upgrade test.

---

## Phase 1 — Mock reset and order independence

**Goal**: No test depends on an earlier test's mock history or DB state. Every case in `auth.int` and `seed.unit` passes alone and under shuffle.

**Decisions**:

- `vitest.config.ts`: add `mockReset: true` to `test`. Do not add `clearMocks`: `mockReset` includes it and keeps `vi.fn(impl)` defaults. Delete the four ad-hoc resets listed in Context, with their comments. `artifact-detail`'s re-stub at `:94` goes as well: `mockReset` restores its `() => Promise.resolve()` factory.
- `src/lib/mcp/auth.unit.test.ts:43`: move `getJwks.mockResolvedValue(...)` into a `beforeEach`. If the full run shows any other stub set outside a test, apply the same fix: move it into `beforeEach` or into `vi.fn(impl)`.
- `auth.int.test.ts`: merge `:142` and `:173` into one case: revoke the other sessions, keep the caller signed in, accept only the new password. Then change the password back to `OWNER_PASSWORD` (`revokeOtherSessions: false`, expect 200). File invariant: the owner's password is `OWNER_PASSWORD` between cases. State this invariant once in the doc comment on the password constants. The change-email case signs in with `OWNER_PASSWORD`. Add no extra sign-ins, and keep one distinct IP per sign-in.
- `seed.unit.test.ts`: add `beforeEach(() => db.delete(user).run())` on the module `db`. `:16` then holds in any order. The `vi.resetModules()` case keeps its own fresh DB.

**Scope**: in — `vitest.config.ts`, the four files named in Context for ad-hoc resets, `src/lib/mcp/auth.unit.test.ts`, `src/lib/auth.int.test.ts`, `src/lib/seed.unit.test.ts`. Out — `restoreAllMocks` calls (see Open questions).

**Acceptance**:

- `pnpm gate` exits 0.
- `grep -rn "clearAllMocks\|tagListRenders.mockClear\|mocked(.*).mockReset()" src` → no matches.
- `pnpm vitest run src/lib/auth.int.test.ts -t 'change-email'` → passes alone. At `ffee99b` it fails at the sign-in status.
- `pnpm vitest run src/lib/auth.int.test.ts src/lib/seed.unit.test.ts --sequence.shuffle --sequence.seed=<s>` → passes for `s` = 1, 2, 3, 4, 5.

---

## Phase 2 — Negative boundary cases

**Goal**: Removing any env refine, any `validateSearch` guard or any metadata bound fails `pnpm test`.

**Decisions**:

- `src/lib/env.unit.test.ts`: add a `describe('env validation')` that uses `vi.stubEnv` and an `afterEach` with `vi.unstubAllEnvs(); vi.resetModules()`. Use `it.each` over: `RESEND_API_KEY` without `EMAIL_FROM`, and the reverse; `OWNER_EMAIL` without `OWNER_PASSWORD`, and the reverse. Each expects `import('./env')` to reject with the refine's `must be set together` message. A non-URL `BASE_URL` and an unset `BETTER_AUTH_SECRET` each reject with `Invalid environment`. One positive case: `RESEND_API_KEY=''` with no `EMAIL_FROM` imports cleanly, because `''` counts as unset.
- `src/routes/_authed/index.unit.test.ts`: widen the `validate` cast to return `Record<string, unknown>`. Add `it.each` rows `[input, field, expected]`: `{query:''}` and `{query:42}` → `undefined`; `{tags:'solo'}` → `undefined`; `{tags:['a',1,null,'b']}` → `['a','b']`; `{type:'pdf'}`, `{sort:'random'}`, `{archived:'true'}`, `{deleted:'true'}` → `undefined`. Add one positive case in which valid `query`/`tags`/`type`/`sort` survive, so the negative rows cannot pass vacuously.
- `src/lib/mcp/server.int.test.ts`: add a new `describe('metadata bounds')` with one `BOUND_VIOLATIONS` table: empty title, 201-char title, 2001-char description, 21 tags, a 51-char tag. `publish_spec` with each row → `isError` true, and `list_artifacts` returns no items. `update_artifact` on a published `'Doc'` with each row → `isError` true, and `get_artifact` still shows title `'Doc'`. Add one positive `publish_spec` at the exact limits (200/2000/20 tags/50-char tag) → not `isError`.

**Scope**: in — the three test files above. Out — `env.ts`, `index.tsx`, `artifact-metadata.ts`: the bounds are correct, and this phase pins them.

**Acceptance**:

- `pnpm gate` exits 0.
- Red checks (run each, then revert, and report the output): delete the `OWNER_EMAIL` refine at `env.ts:43-46` → the new env cases fail. Change `index.tsx`'s `type` guard to pass `search.type` through → the `pdf` row fails. Change `titleField` to `.max(201)` → the 201-char rows fail. After the reverts, `git diff --stat -- src/lib src/routes` lists only the three test files.

---

## Phase 3 — Public-seam selectors and reads

**Goal**: A restyle of the fence error, or a schema change with no behavior change, breaks no test.

**Decisions**:

- `catalog-dispatch.unit.test.tsx:132,140,164`: find the error with `screen.getByText(/^This exhibit block/)`. `:171` uses `screen.queryByText(/^This exhibit block/)` → `null`. `:140` reads the reason from that element's `textContent`. No change to `catalog-dispatch.tsx`.
- `auth-mailerless.int.test.ts:101-107`: replace the DB read with a local `getSessionUserEmail(cookie)` copied from `auth.int.test.ts:96-101`. Use the sign-in cookie and expect `MOVED_EMAIL`. Keep the `:77-83` `emailVerified` read and the `user` import.
- `repository.unit.test.ts:759`: `tagsOf(id)` returns `getArtifact(db, id)?.artifact.tags`. In the soft-deleted case, move the `tagsOf(deleted.id)` assertion after `restoreArtifact(db, deleted.id)` (`:849`). This is the case's stated property, "a restore cannot resurrect the old tag". Drop imports this leaves unused.

**Scope**: in — `src/components/markdown/catalog-dispatch.unit.test.tsx`, `src/lib/auth-mailerless.int.test.ts`, `src/database/repository.unit.test.ts`. Out — the reads listed as not acted on in Context.

**Acceptance**:

- `pnpm gate` exits 0.
- `grep -n "text-danger" src/components/markdown/catalog-dispatch.unit.test.tsx` → no matches.
- `grep -c "\.from(user)" src/lib/auth-mailerless.int.test.ts` → `1` (the `emailVerified` read; `2` at `ffee99b`).
- Red check (then revert): change the `:159` message prefix in `catalog-dispatch.tsx` → the validation-reason case fails.

---

## Phase 4 — Scripts in the suite

**Goal**: A catalog change that invalidates an example spec, or an `@/` import in either plain-node chain, fails `pnpm test`.

**Decisions**:

- `src/catalog/validate.unit.test.ts`: add four rows to the valid-fixture table, `['decision-memo example', decisionMemoExample.spec]` and so on. Import through relative paths from `../../scripts/examples/<name>`. Skip `markdownNotesExample`, which has no spec.
- New `src/lib/script-module-resolution.unit.test.ts`. Use `spawnSync(process.execPath, [script], { cwd: <repo root>, env: {}, encoding: 'utf8' })` for `scripts/seed.ts` and `scripts/dev-publish.ts`. Each case expects a non-zero status, stderr without `ERR_MODULE_NOT_FOUND`, and the script's own env error: `Invalid environment` for seed, `BASE_URL environment variable is required` for dev-publish. The env error proves the whole graph resolved, and the empty env keeps both scripts off the DB and the network. File doc comment (2-3 lines): why this guard exists, citing the `CLAUDE.md` seed-chain rule.

**Scope**: in — the two test files. Out — the scripts and `CLAUDE.md`; replacing the alias rule with `package.json` `imports` is a separate L-sized change.

**Acceptance**:

- `pnpm gate` exits 0; `pnpm vitest run src/lib/script-module-resolution.unit.test.ts` → 2 pass.
- Red check (then revert): in `src/lib/mailer.ts:3`, change `'./env.ts'` to `'@/lib/env'` → the seed case fails and names the missing module.

---

## Phase 5 — Auth and OAuth rows across migrations

**Goal**: A future auth-schema migration that loses the owner, a registered MCP client or its grants, or that skips a backfill, fails `pnpm test`.

**Decisions**:

- `src/database/migrations.int.test.ts`: extract the base-folder builder (`:28-50`) into a local helper and reuse it. Add a second case. At migration 0000, seed these rows through raw SQL: `user`, a `credential` `account`, `session`, `oauth_client` with `type='web'`, `oauth_consent`, `oauth_refresh_token`, and `oauth_access_token` with `refresh_id` set. Use raw SQL because the current drizzle schema does not match 0000. Migrate to head, then assert: each table still holds 1 row; `oauth_client.application_type = 'web'`; `account.issuer = 'local:credential'`. `openDatabase` succeeding already proves `foreign_key_check` is clean.
- One base snapshot only. Do not add a per-journal-entry loop.

**Scope**: in — `src/database/migrations.int.test.ts`. Out — migration SQL and `open.ts`.

**Acceptance**:

- `pnpm gate` exits 0.
- Red check (then revert): delete `0002_silly_firebrand.sql:53` → the `application_type` assertion fails. `git diff --stat -- src/database/migrations` is then empty.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note the deviation in the final summary. Stop and report instead of improvising in these cases: a locked decision turns out to be wrong or impossible; the work requires touching out-of-scope files; or acceptance cannot be met after a couple of honest attempts. Stop and report in particular when a new negative case passes against broken code or fails against current code: that is a real boundary gap, not a test to adjust.

## Done criteria

Machine-checkable; ALL must hold:

- [ ] `pnpm gate` exits 0
- [ ] `grep -n "mockReset: true" vitest.config.ts` → 1 match
- [ ] The shuffle command from Phase 1 passes for seeds 1-5
- [ ] `src/lib/script-module-resolution.unit.test.ts` exists with 2 passing cases
- [ ] Every red check was run and reverted, and its output is in the phase summary
- [ ] `docs/plans/README.md` status row for 19 updated

## Open questions

- Phase 1: add `restoreMocks: true` as well and delete the 17 per-file `vi.restoreAllMocks()` calls? Default: no. `restoreMocks` runs before each test, so a file's last spy stays installed after the file ends. Whether that leaks under `pool: 'threads'` has not been verified.
- Phase 1: enable `sequence.shuffle` in `vitest.config.ts` permanently? Default: no. Other suites have not been audited for order dependence; the acceptance runs shuffle only on the two fixed files.
