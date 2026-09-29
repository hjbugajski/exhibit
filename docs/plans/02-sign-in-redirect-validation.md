# Plan 02 — Close the backslash open redirect on /sign-in

Replace the prefix check on the `/sign-in` `redirect` search param with a URL-parsing same-origin check, and apply it at both consumers: the SSR `beforeLoad` redirect and the post-sign-in client `navigate`. Out of scope: the OAuth `redirect_uri` handling (Better Auth owns it), other routes' guards, and any test-coverage work unrelated to this redirect.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none

## Why this matters

`validateSearch` accepts any value that starts with `/` and not `//`, so `/\evil.com` (sent as `?redirect=%2F%5Cevil.com`) passes. For a signed-in owner, `beforeLoad` then throws `redirect({ to: '/\evil.com' })` during SSR, router-core emits `Location: /\evil.com` with a 307, and browsers treat `\` as `/` for http(s), so the owner lands on `evil.com`. That page can present a fake "session expired" form and harvest the owner password, which authorizes MCP clients for the whole gallery. Impact is phishing by redirect only; no token or session leaks.

## Context

- `src/routes/sign-in.tsx:8-14` — the comment and `validateSearch`: `startsWith('/') && !startsWith('//')`. This is the only open-redirect defense.
- `src/routes/sign-in.tsx:19` — `throw redirect({ to: search.redirect ?? '/' })` for a signed-in owner (the exploitable SSR path).
- `src/routes/sign-in.tsx:28-31` — `Route.useSearch()` feeds `redirect` into `SignInView`, the only renderer of that component with a `redirect` prop.
- `src/components/account/sign-in-view.tsx:76` — `await navigate({ to: redirect ?? '/' })` after a successful sign-in. Not exploitable today, because `pushState` to a cross-origin URL throws, but it consumes the same string.
- Producers: `src/routes/_authed.tsx:12` and `src/routes/consent.tsx:14` set `search: { redirect: location.href }`. In router-core 1.171.26, `ParsedLocation.href` is path + search + hash with no origin (`node_modules/.pnpm/@tanstack+router-core@1.171.26/node_modules/@tanstack/router-core/dist/esm/location.d.ts:4-9`). Every legitimate value is therefore a root-relative path, such as `/consent?client_id=…&redirect_uri=https%3A%2F%2F…`. The encoded `redirect_uri` stays inside the query and resolves same-origin.
- Tests: `src/routes/sign-in.unit.test.tsx:14-61` drives `beforeLoad` with pre-validated search objects only. No test calls `validateSearch`. Pure-helper test exemplar: `src/lib/parse-version-param.unit.test.ts`.
- Verified at planning time with Node's WHATWG `URL` and base `http://exhibit.invalid`: `/\evil.com`, `/<TAB>/evil.com`, `//evil.com`, and `https://evil.com` all resolve to a foreign origin. `/a/xyz?x=1#h` and the consent path above resolve to the base origin. Browsers use the same parser, so an origin comparison matches browser behavior exactly.

Cross-phase rules (from `CLAUDE.md`): kebab-case filenames; no barrel files; tests colocated as `.unit.test.ts(x)`; routes folder holds routes only, so support code goes in `src/lib/`; constants and helpers imported by client code live in client-safe modules (the new helper must import nothing server-only); env vars only via `src/lib/env.ts` (not needed here).

Domain skills the executor must follow:

- `/Users/henry/.claude/skills/tdd/SKILL.md` — red before green, one vertical slice at a time, test only at the seams named in Acceptance.
- `/Users/henry/.claude/skills/code-comments/SKILL.md` — comments state why, not what; replace the stale comment at `sign-in.tsx:8`, do not add a second one.

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before you proceed. Report material drift. Do not replan silently.

## Gate

`pnpm gate` (typecheck, lint with fix, fmt, test) closes the phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If the shell's `node -v` is not 26, prefix with `mise exec --`.

## How to execute

- Single phase, one fresh session; the user commits.
- The orchestrator dispatches ONE subagent (`Task` tool, `subagent_type: general-purpose`) with this plan's Context, the Decisions/Scope/Acceptance below, and the intent. It verifies with the gate and re-prompts the SAME subagent on failure. It does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for user review.

---

## Phase 1 — Same-origin validation for the sign-in redirect

**Goal**: `/sign-in?redirect=%2F%5Cevil.com` for a signed-in owner redirects to `/`, not off-origin. Every root-relative path that `_authed.tsx` and `consent.tsx` produce still round-trips unchanged.

**Decisions**:

- New module `src/lib/same-origin-path.ts` exports `sameOriginPath(value: unknown): string | undefined`. It returns `value` unchanged when all of these hold: it is a string, it starts with `/`, and `new URL(value, BASE).origin === BASE_ORIGIN`. Otherwise it returns `undefined`. `BASE` is a module-local constant `'http://exhibit.invalid'`: the `.invalid` TLD can never collide with a real host. The function returns the original string, not the normalized URL, because the router must emit what the app produced, and normalization is not needed for safety once the origin matches.
- No separate backslash or control-character checks: the origin comparison already rejects both, because WHATWG parsing maps `\` to `/` and strips tab and newline before resolving. The tab case stays as a test.
- Keep the `startsWith('/')` requirement. Bare relative values such as `evil.com` resolve same-origin, but they are never produced by the app and would make the router resolve relative to `/sign-in`.
- One short doc comment stating the why: prefix checks are unsound under WHATWG parsing; only a post-parse origin comparison is.
- `src/routes/sign-in.tsx`: `validateSearch` delegates to `sameOriginPath(search.redirect)`. Keep the return type `{ redirect?: string }`, because consumers depend on the key being absent rather than `undefined`. Replace the stale comment at line 8, or delete it if the helper's name and doc comment make it redundant.
- `src/components/account/sign-in-view.tsx:76`: `navigate({ to: sameOriginPath(redirect) ?? '/' })`. `SignInView` is an exported component with a plain `string` prop, so it defends itself instead of relying on its caller.

**Scope**: in — `src/lib/same-origin-path.ts` (new), `src/lib/same-origin-path.unit.test.ts` (new), `src/routes/sign-in.tsx`, `src/routes/sign-in.unit.test.tsx`, `src/components/account/sign-in-view.tsx`. Out — `_authed.tsx` and `consent.tsx` producers (their values are already root-relative, per Context); Better Auth `redirect_uri` validation (a separate system); `sign-in-view.unit.test.tsx` (the helper test covers the logic, and a navigate test would need an authClient success mock for a one-line call).

**Acceptance**:

- `pnpm gate` exits 0.
- `grep -n "startsWith('//')" src/routes/sign-in.tsx` returns no matches.
- `grep -n "sameOriginPath" src/routes/sign-in.tsx src/components/account/sign-in-view.tsx` returns one call site in each file.
- Tests to add in `src/lib/same-origin-path.unit.test.ts`, modelled on `parse-version-param.unit.test.ts`:
  - Accepts `/`, `/a/xyz`, and `/a/xyz?x=1#h`.
  - Accepts the consent-shaped path `/consent?client_id=c&redirect_uri=https%3A%2F%2Fexample.com%2Fcb` and returns it unchanged.
  - Rejects `/\evil.com`. This is the regression, so write it first and watch it fail against a prefix-only implementation.
  - Rejects `//evil.com`, `https://evil.com`, `javascript:alert(1)`, and `evil.com`.
  - Rejects `'/\t/evil.com'` (tab hardening).
  - Rejects non-strings: `undefined`, `42`, and `['/a']`.
- Tests to add in `src/routes/sign-in.unit.test.tsx`, a new `describe('/sign-in validateSearch')` that calls `Route.options.validateSearch` directly:
  - `{ redirect: '/\\evil.com' }` returns `{}`.
  - `{ redirect: '/a/xyz' }` returns `{ redirect: '/a/xyz' }`.
  - `{}` returns `{}`.
- Manual smoke for the user (the agent never runs it): while signed in, open `/sign-in?redirect=%2F%5Cevil.com`. You land on the gallery root. Then sign out, open a gallery artifact URL, and sign in. You land back on that artifact.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note the deviation in the final summary. Stop and report instead of improvising in these cases:

- a locked decision turns out to be wrong or impossible,
- the work requires touching out-of-scope files,
- acceptance can't be met after a couple of honest attempts.

A specific stop condition: if `Route.options.validateSearch` is not callable in the unit test as typed (for example, the router wraps it), test the helper only and report. Do not reach into router internals.

## Done criteria

- [ ] `pnpm gate` exits 0
- [ ] `grep -rn "startsWith('//')" src/` returns no matches
- [ ] `src/lib/same-origin-path.unit.test.ts` contains a case for `/\evil.com`, and it passes
- [ ] `sign-in.tsx` and `sign-in-view.tsx` each call `sameOriginPath`
- [ ] `docs/plans/README.md` status row updated
