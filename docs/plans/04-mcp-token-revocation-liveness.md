# Plan 04 — Honor revoked opaque tokens and session liveness in /mcp auth

Make `verifyMcpBearer` reject access tokens that Better Auth has already killed: opaque tokens with `oauth_access_token.revoked` set, and JWTs whose `sid` session row no longer exists. This plan does not add a disabled-client check to the opaque path, does not change refresh-token policy, and does not touch the OAuth provider config.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: S
- **Risk**: LOW (the existence-only session check locked below confines the sign-out UX change to deliberate session deletion)
- **Depends on**: docs/plans/01-\*.md — it may bump `better-auth` / `@better-auth/oauth-provider` (1.7.1 at planning time). Re-verify every upstream fact in Context against the installed version before writing code.

## Why this matters

Sign-out and password reset delete the owner's session so that access ends. Better Auth then stamps `revoked` on the opaque access tokens bound to that session, and treats JWTs whose `sid` session is gone as inactive. `/mcp` does its own verification and reads neither signal. So an access token minted under the old session keeps full publish/update/delete access for up to an hour (default `accessTokenExpiresIn` 3600 s). When this lands, deleting a session cuts off the access tokens minted under it on their next request.

## Context

- `src/lib/mcp/auth.ts:39` `verifyOpaqueToken` selects only `userId` and `expiresAt` (`:42`) and accepts any unexpired row (`:47`). The expiry check has no test.
- `src/lib/mcp/auth.ts:83` `verifyMcpBearer`. JWT path: `jwtVerify` at `:97`, `azp` client check at `:102`, success at `:106`. Opaque fallback at `:117-123`. The doc comment at `:71-82` says the client lookup is the one required DB lookup; that sentence becomes stale.
- `src/lib/mcp/auth.ts:61` `clientIsActive` — the pattern for a synchronous single-row Drizzle lookup to follow.
- `src/database/schemas/auth.ts:192` `oauthAccessToken`: `revoked` timestamp at `:213`; `sessionId` FK at `:200-202` is `ON DELETE SET NULL`; `clientId` at `:197-199` is `ON DELETE CASCADE`. `session` table at `:27` (`expiresAt` `:31`).
- Upstream semantics to mirror, in `node_modules/@better-auth/oauth-provider/dist/introspect-6ew7sakf.mjs`: `validateJwtAccessToken` `:2237`, session check on `sid` `:2272-2282`; `validateOpaqueAccessToken` `:2293`, `revoked` check `:2312`, session check `:2324-2334`. JWTs carry `sid: overrides?.sid` (`:1366`), set from the grant's session id (`:1852-1863`). The refresh grant passes `refreshToken.sessionId` as the new token's session (`:2179`).
- `node_modules/@better-auth/oauth-provider/dist/authorize-Crqw4_bR.mjs:208-229` explains the session-delete plan: bound access tokens are stamped `revoked` (`:288-307`), non-`offline_access` refresh tokens are revoked, and `offline_access` refresh tokens survive (`:260`).
- Session deletions in the app: sign-out (`src/components/account/avatar-menu.tsx:39`), password change with `revokeOtherSessions` (`src/components/account/settings-view.tsx:143`), password reset (`src/lib/auth.ts:48`). Better Auth's default session lifetime is 7 days; an expired session row stays in the table until its cookie is next presented (`node_modules/better-auth/dist/api/routes/session.mjs:148-155`).
- Client revocation already works on both paths: `revokeMcpConnectionFn` deletes the client row (`src/lib/account.ts:201`), `foreign_keys = ON` (`src/database/open.ts:43`), and the cascade removes its opaque token rows. Nothing in the app sets `oauth_client.disabled`.
- Tests: `src/lib/mcp/auth.unit.test.ts` (opaque happy path `:98`, JWT client-revocation cases `:210-248`, `mintJwt` helper `:56`). `src/lib/mcp/oauth-flow.int.test.ts` drives the real flow over a loopback server; opaque issuance at `:447`, client-revocation model at `:533`. The suite shares one owner session (`:41-55`); Better Auth caps `/sign-in*` at 3 requests per 10 s.

Rejected alternatives, locked: no disabled-client check on the opaque path, and no session check on the opaque path. The opaque disabled-client check is unneeded: client revocation deletes the row and the cascade already kills the tokens. The opaque session check is useless: `ON DELETE SET NULL` clears `session_id` when the session is deleted, so the check can never fire after a sign-out; the `revoked` stamp is what carries that signal. The JWT session check tests existence only, not `expiresAt` (see Decisions).

Domain skills the executor must follow: `/Users/henry/.claude/skills/tdd/SKILL.md` (red before green, one slice per cycle; the seams are the test cases in Acceptance) and `/Users/henry/.claude/skills/code-comments/SKILL.md` (applies to every comment touched, including the stale doc comment above).

If the code has drifted from this section since `Planned at`, re-check the decision it supports before proceeding; report material drift rather than silently replanning.

## Gate

`pnpm gate` (typecheck, lint --fix, fmt, test) closes the phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If the shell's `node -v` is not 26, prefix with `mise exec --`.

## How to execute

- Single phase, one fresh session; the user commits.
- The orchestrator dispatches ONE subagent (`Task`, `subagent_type: general-purpose`) with this plan's Context, the Decisions/Scope/Acceptance below, and the intent. It verifies with the gate and re-prompts the same subagent on failure; it does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for user review.

---

## Phase 1 — Reject revoked opaque tokens and JWTs from deleted sessions

**Goal**: A token minted under a session that was later deleted gets 401 `invalid_token` at `/mcp` on its next request, for both token kinds. All currently accepted tokens without a session binding still authenticate.

**Decisions**:

- `verifyOpaqueToken` also selects `oauthAccessToken.revoked` and returns `undefined` when it is non-null. Order: missing row, expired, revoked. No client or session lookup is added on this path.
- JWT path, after the `azp` check at `auth.ts:102`: when `payload.sid` is a string, require a `session` row with that `id` to exist; otherwise 401 `invalid_token`. When `sid` is absent, skip the check (upstream does the same, and `offline_access` refreshes after a session deletion mint tokens without `sid` because the FK nulls the refresh token's `session_id`).
- Existence only, no `expiresAt` comparison. Why: the refresh grant copies the refresh token's session id into every new access token (`introspect-6ew7sakf.mjs:2179`). An expired session row persists until its cookie is presented again, so an expiry check would 401 every token a 30-day `offline_access` refresh token mints once the 7-day gallery session lapses. That would disconnect Claude whenever the owner has not opened the gallery for a week. Sign-out, password change, and password reset all delete the row, so existence covers the security intent. Note this deviation from upstream in a short why-comment at the check.
- Add one small helper beside `clientIsActive`, `sessionExists(sessionId: string): boolean`, using the same synchronous `.get()` pattern. Import `session` from `@/database/schemas/auth`.
- Rewrite the `verifyMcpBearer` doc comment (`auth.ts:71-82`) so it names both required lookups (client registration, and session when `sid` is present) and the opaque `revoked` check. Keep it a contract, not a narration.

**Scope**: in: `src/lib/mcp/auth.ts`, `src/lib/mcp/auth.unit.test.ts`, `src/lib/mcp/oauth-flow.int.test.ts`, `testing/oauth-client.ts` (add a `signOut` helper beside the existing `signIn` at `:62`). Out: `src/lib/auth.ts` provider options, refresh-token revocation policy (`offline_access` tokens surviving sign-out is upstream OIDC Back-Channel Logout behavior; the settings "Revoke" button is the remedy), `src/lib/account.ts`, schema and migrations.

**Acceptance**:

- `pnpm gate` exits 0.
- `grep -n "revoked" src/lib/mcp/auth.ts` shows the column in the opaque select and a check on it.
- `grep -n "sid" src/lib/mcp/auth.ts` shows the JWT session check.
- Unit tests in `src/lib/mcp/auth.unit.test.ts`, modeled on `:98` (opaque) and `:210` (JWT). Extend `mintJwt` with an optional `sid`. Session rows need a `user` row, a unique `token`, and `updatedAt`:
  - opaque row with `revoked` set and future `expiresAt` → 401 `invalid_token`;
  - opaque row with past `expiresAt` → 401 `invalid_token` (covers the untested check at `auth.ts:47`);
  - JWT with `sid` of an existing session → `{ ok: true, subject }`; after deleting that session row, the same token → 401 `invalid_token`;
  - JWT with `sid` of a session whose `expiresAt` is in the past but whose row exists → `{ ok: true, subject }` (pins the existence-only decision);
  - JWT with `sid` that matches no row → 401 `invalid_token`.
- Integration test in `src/lib/mcp/oauth-flow.int.test.ts`, modeled on `:533`: sign in a second, dedicated session (one extra `signIn`, within the 3-per-10 s cap); never sign out the shared `ownerCookie`. Under that session, mint one JWT (token request with `resource`) and one opaque token (no `resource`); both return 200 at `/mcp`. Sign out that session through `/api/auth/sign-out`. Both tokens then return 401. This proves end to end that upstream really emits `sid` and stamps `revoked` on the installed version.
- Every existing test in both files still passes unchanged.
- Manual smoke (user only): connect Claude to `/mcp`, sign out of the gallery, and confirm the next tool call fails or triggers a refresh or re-auth; sign back in and reconnect.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope; note the deviation in the final summary. Stop and report instead of improvising when:

- after plan 01, the installed provider no longer emits `sid` on access-token JWTs, no longer stamps `revoked` on session deletion, or renames either field;
- the integration test shows sign-out does not revoke the opaque token (the fix would then need a session check that the `SET NULL` FK defeats, which is a design change);
- acceptance needs files outside Scope.

## Done criteria

- [ ] `pnpm gate` exits 0
- [ ] `grep -n "revoked" src/lib/mcp/auth.ts` and `grep -n "sid" src/lib/mcp/auth.ts` both match
- [ ] The five unit cases and the sign-out integration case above exist and pass
- [ ] `docs/plans/README.md` status row updated

## Open questions

- Phase 1: enforce session `expiresAt` too, to match upstream exactly? Default: no. The expiry check disconnects long-lived `offline_access` MCP clients about a week after the owner's last gallery visit. Revisit only if the owner wants MCP access tied to active gallery use.
- Phase 1: revoke `offline_access` refresh tokens on password reset, so a reset after a suspected compromise also ends refreshable MCP access? Default: out of scope. It changes upstream provider policy, and the settings "Revoke" button already covers it. Candidate for a separate plan.
