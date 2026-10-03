# Plan 01 — Drop account.issuer and upgrade Better Auth to 1.7.6

Removes the `account.issuer` column and its unique index through a generated migration, and moves `better-auth`, `@better-auth/drizzle-adapter`, and `@better-auth/oauth-provider` to 1.7.6 in the same change. A second phase refreshes the lockfile in range to clear the open production advisories. It does not touch the MCP auth code, the OAuth provider config, or the Dependabot config.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: S
- **Risk**: MED (forward-only column drop on the owner's live DB)
- **Depends on**: none

## Why this matters

Better Auth 1.7.3 reverted the 1.7.0–1.7.2 `account.issuer` shape and turned on a schema check that runs before every auth endpoint (on in every environment unless `advanced.database.validateSchema: false`). A `notNull` column that Better Auth never writes and that has no Drizzle default fails that check, so on 1.7.3+ this schema rejects every sign-in, session read, and `/mcp` token issuance. `package.json` ranges already admit 1.7.6, so any in-range update or Dependabot PR breaks auth today. Dropping the column unblocks the upgrade and the lockfile refresh that clears fast-uri, js-yaml, hono, and qs advisories.

## Context

- `src/database/schemas/auth.ts:52-53` — the `issuer` comment and `text('issuer').notNull()` (no Drizzle default). `:79` — `uniqueIndex('account_issuer_accountId_idx')` on `(issuer, accountId)`. Nothing else in `src/`, `testing/`, or `scripts/` reads or writes `issuer` on `account` (the other `issuer` hits are JWT/discovery issuers, unrelated).
- `src/database/migrations/0002_silly_firebrand.sql:38-39` — adds the column with a hand-edited `DEFAULT 'local:credential'` and the unique index. `meta/0003_snapshot.json` records the column as `notNull` with no default, so SQL and snapshot diverge today; dropping the column ends the divergence.
- `package.json:29,30,42` — `@better-auth/drizzle-adapter`, `@better-auth/oauth-provider`, `better-auth`, all `^1.7.1`; installed 1.7.1 (`pnpm-lock.yaml:2285`). npm `latest` is 1.7.6 for all three; 1.7.6 drops the `better-sqlite3 ^12` peer that `better-sqlite3@13.0.3` (`package.json:43`) fails today.
- `src/database/open.ts:31-43` — migrations run with foreign keys off, then `foreign_key_check`; a table recreate is safe.
- `src/database/migrations.int.test.ts:25-89` — boots only 0000, inserts rows, then migrates to head and asserts rows survive. The model for the new account-row case. `account` and `user` exist from 0000 (`0000_rare_quasar.sql:33-48,166-174`).
- `src/lib/mcp/auth.ts:39-52` — opaque tokens: hashes the raw token as SHA-256 base64url unpadded and looks it up in `oauth_access_token.token`, mirroring `defaultHasher` in `@better-auth/oauth-provider` (1.7.1: `dist/utils-*.mjs`). `:102` — rejects JWTs whose `azp` client is missing or disabled; 1.7.1 stamps `azp: client.clientId` in `dist/introspect-*.mjs`.
- `src/lib/mcp/oauth-flow.int.test.ts:447` (opaque token authenticates at /mcp) and `:533` (revoked client's JWT gets 401 via `azp`) are the behavioural proof that both assumptions still hold after the bump.
- `README.md:100,108-110` — migrations are forward-only; the backup is the rollback path, not an older image tag.

Cross-phase rules (beyond `CLAUDE.md`): never `pnpm db:push`; never hand-edit generated SQL. Stage only; Henry commits. If shell `node -v` is not 26 (`.node-version`), prefix commands with `mise exec --`.

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before proceeding; report material drift rather than silently replanning.

## Gate

`pnpm gate` (typecheck, lint --fix, fmt, test) closes every phase; CI runs the `:check` variants after `pnpm install --frozen-lockfile`. Baseline at `ffee99b`: 132 files / 2373 tests green.

## How to execute

- One phase per fresh session; Henry commits between phases.
- The orchestrator dispatches ONE subagent per phase with this plan's Context plus the phase's Decisions/Scope/Acceptance. It verifies with the gate and re-prompts the same subagent on failure; it does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for review.

## Phases

1. Drop `account.issuer` via generated migration and bump the Better Auth trio to 1.7.6.
2. Refresh transitive dependencies in range to clear production advisories.

---

## Phase 1 — Drop account.issuer and upgrade to 1.7.6

**Goal**: A fresh or existing DB migrates to a schema with no `account.issuer` column or `account_issuer_accountId_idx` index, and the whole suite passes on Better Auth 1.7.6 with its schema check live.

**Decisions**:

- Remove `issuer` (and its comment at `:52`) and the `account_issuer_accountId_idx` entry from `src/database/schemas/auth.ts`; keep `account_userId_idx`. Leave the file header comment (`:1-8`) as is; it still holds.
- Run `pnpm db:generate` once. Expected output: `0004_*.sql` with `DROP INDEX account_issuer_accountId_idx` before `ALTER TABLE account DROP COLUMN issuer`, plus `meta/0004_snapshot.json` and a journal entry. A drizzle-kit table recreate instead is acceptable (`open.ts` makes it FK-safe); note it as a deviation. Do not edit the generated SQL.
- Set all three specifiers to `^1.7.6` and install. The floor matters: 1.7.1–1.7.2 write `issuer`, so they must not resolve against the new schema.
- Do not set `advanced.database.validateSchema: false`. The schema check stays on; a green suite on 1.7.6 is the proof the schema matches.
- Add a second case to `src/database/migrations.int.test.ts`: at the 0000 base insert one `user` and one credential `account` (`provider_id 'credential'`, non-null `password`), migrate to head, then assert the account row survives with its password unchanged, `pragma table_info(account)` has no `issuer`, and no `account_issuer_accountId_idx` index exists. Extracting the base-folder setup into a local helper shared by both cases is the executor's call.
- `src/lib/mcp/auth.ts` stays unchanged unless 1.7.6 changed the hasher or the `azp` claim. If it did, stop and report; do not adapt silently.

**Scope**: in — `package.json`, `pnpm-lock.yaml`, `src/database/schemas/auth.ts`, the generated `src/database/migrations/0004_*.sql` + `meta/0004_snapshot.json` + `meta/_journal.json`, `src/database/migrations.int.test.ts`. Out — other dependency bumps (Phase 2); `src/lib/auth.ts` options (no config change needed); `.github/dependabot.yml`.

**Acceptance**:

- `grep -rn "issuer" src/database/schemas/auth.ts` → no matches.
- `ls src/database/migrations/*.sql | wc -l` → 5; `git diff --stat src/database/migrations/0002_silly_firebrand.sql src/database/migrations/meta/0003_snapshot.json` → empty (no edits to shipped migrations).
- `pnpm ls better-auth @better-auth/oauth-provider @better-auth/drizzle-adapter --depth 0` → all three at 1.7.6.
- `grep -Rl "validateSchema" node_modules/better-auth/dist node_modules/.pnpm/@better-auth+core@1.7.6*/node_modules/@better-auth/core/dist` → at least one match (`@better-auth/core` is not hoisted to `node_modules/@better-auth/`) (the check the suite now exercises exists); `grep -rn "validateSchema" src` → no matches.
- `grep -A3 "const defaultHasher" node_modules/@better-auth/oauth-provider/dist/*.mjs` → contains `"SHA-256"` and `padding: false` (as in 1.7.1); `grep -rn "azp: client.clientId" node_modules/@better-auth/oauth-provider/dist/*.mjs` → a match.
- `pnpm vitest run src/database/migrations.int.test.ts src/lib/mcp/oauth-flow.int.test.ts src/lib/auth.int.test.ts` → all pass, including `:447` and `:533` unchanged.
- `pnpm peers check | grep better-sqlite3` → no matches (the command itself exits non-zero on the known nitro issues, out of scope).
- Gate exits 0.

---

## Phase 2 — In-range advisory refresh

**Goal**: The production dependency graph carries no advisory whose fix is inside an existing semver range.

**Decisions**:

- Targeted update, not a blanket `pnpm update`: `pnpm update fast-uri js-yaml hono qs` (pnpm updates transitive deps by name). Why: Henry bumps deliberately; a blanket refresh drags unrelated TanStack/Vite churn into a security change. Targets: fast-uri ≥3.1.6 (via ajv, bundled through `@modelcontextprotocol/sdk`), js-yaml ≥4.3.2, hono ≥4.13.5 (via the SDK and evlog), qs ≥6.16.0.
- If `pnpm audit --prod` still lists an advisory with an in-range fix, add that package name to the same targeted update. An advisory whose fix is out of range is reported, not forced via `overrides`.
- No `package.json` change.

**Scope**: in — `pnpm-lock.yaml` only. Out — Dependabot config and repo settings (Open questions); nitro peer warnings (pinned nightly, separate work).

**Acceptance**:

- `pnpm why fast-uri js-yaml hono qs` → only the fixed versions above.
- `pnpm audit --prod` → no advisory except the known esbuild one; list any other survivor with its fix version in the summary.
- `git diff --name-only` → `pnpm-lock.yaml` only.
- Gate exits 0.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope; note the deviation in the final summary. Stop and report instead of improvising when:

- 1.7.6's schema check flags any column other than `issuer` (do not silence it with `validateSchema: false`),
- `pnpm db:generate` prompts for a rename or emits statements beyond the `account` index/column,
- `oauth-flow.int.test.ts` fails at `:447` or `:533`, or the hasher/`azp` greps come back different,
- acceptance can't be met after a couple of honest attempts.

Rollback: 0004 is forward-only and the 1.7.1 image writes `issuer`, so an older image cannot run against a migrated DB. Before deploying the release that carries Phase 1, take the backup in `README.md` "Backups" (`sqlite3 data/app.db ".backup backup.db"`). Rollback is restore that backup plus the previous image tag. Henry does this; the executor never touches `data/`.

## Done criteria

- [ ] Gate exits 0 after each phase
- [ ] `grep -rn "issuer" src/database/schemas/auth.ts` → no matches; exactly one new migration (`0004_*`) with its snapshot and journal entry
- [ ] `pnpm ls` shows 1.7.6 for all three Better Auth packages
- [ ] `pnpm audit --prod` shows no in-range-fixable advisory
- [ ] Manual smoke (Henry, after backup): sign in, open /settings, reconnect an MCP client and publish an artifact
- [ ] `docs/plans/README.md` status row updated

## Open questions

- Dependabot security PRs for alerts #20–#29 never opened. `.github/dependabot.yml:7,16` sets `open-pull-requests-limit: 0` on both ecosystems; whether that suppresses security updates, and whether the repo-level security-updates setting is on, can't be verified from the code. Resolved outside this plan; recommended default: Henry checks the repo's Dependabot settings and job logs after Phase 2 and files a separate change if the config is the cause.
