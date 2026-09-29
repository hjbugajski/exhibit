# Plan 11 — Stop paying a session RPC on every client navigation

Keep the `_authed` session check on SSR and on entry into the authed tree, but reuse the already-fetched session on client navigations that stay inside it. Before that, make an expired session that surfaces as a server-fn `'Unauthorized'` error land on `/sign-in` instead of the generic error page. The server-side auth boundary (`sessionMiddleware` on every server fn) does not change, and neither do the `sign-in`, `consent` and `reset-password` guards.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: M
- **Risk**: MED
- **Depends on**: docs/plans/06-\*.md (both touch loader and route caching), docs/plans/07-\*.md (its structural test pins the server-fn session boundary this plan relies on)

## Why this matters

`_authed.beforeLoad` awaits `getServerSession()`, a GET server fn, on every navigation under `_authed`. The router awaits each `beforeLoad` before it schedules any loader, so every gallery search batch, filter toggle, detail click and hover preload pays two serial round trips: session, then data. The check is UX-only because every data server fn re-checks the session. Dropping it on in-tree navigations removes one RTT per interaction with no change to the security posture.

## Context

- `src/routes/_authed.tsx:8-16` — the guard: `await getServerSession()`, redirect to `/sign-in` with `search.redirect = location.href`, return `{ session }`. `:24-31` and `src/routes/_authed/settings.tsx:23` read `session.user.email`/`image` from route context.
- `src/lib/auth-session.ts:14` — `getServerSession`, a `createServerFn({ method: 'GET' })`; its doc (`:10-12`) states that route guards are UX-only.
- `src/lib/session-middleware.ts:21-27` — `requireSession` throws a plain `new Error('Unauthorized')`; `:29-33` wires it as `sessionMiddleware`. Nothing maps that error to a redirect today, so any loader that hits it renders `RouteError` with the text "Unauthorized".
- `src/router.tsx:12-24` — `getRouter()` builds a fresh router per SSR request and once on the client; no router `context` today. `:19` sets `defaultErrorComponent: RouteError`, so every route, including each `_authed` child, gets its own error boundary rendering `RouteError`.
- `src/routes/__root.tsx:12` — `createRootRoute(...)`, no typed router context.
- `src/components/blocks/route-fallbacks.tsx:40-55` — `RouteError`.
- Router internals at `@tanstack/router-core@1.171.26` (`node_modules/.pnpm/@tanstack+router-core@1.171.26/node_modules/@tanstack/router-core/dist/esm/`):
  - `load-client.js:102-183` — `contextualize` awaits each `beforeLoad` serially (`:163`), and loaders are planned only after the loop (`:182`).
  - `load-client.js:119` — the `cause` argument passed to `beforeLoad` is `'preload'` for every preload, whatever the match's own cause.
  - `router.js:664-668,725-734` — a match whose route sits at the same index in the committed matches gets `cause: 'stay'` and is spread from the existing match, so it carries `invalid`.
  - `router.js:510-549` — `router.invalidate()` marks committed matches `invalid: true` before it reloads. `Matches.d.ts:60-63` — `cause` and `invalid` are public `RouteMatch` fields; `route.d.ts:273-274` — `cause` and `matches` are public `beforeLoad` args.
  - `load-client.js:88-96` — a route's `onError` runs only for that route's own failures, and it receives no location.
- Callers that navigate without leaving `_authed`: `src/components/artifacts/home.tsx:85` (debounced search), `:90,:100,:110,:123,:137` (type/sort/tags/archived/deleted), all `replace: true`.
- Callers of `router.invalidate()` whose result must show fresh session fields: `src/components/account/settings-view.tsx:36` (avatar re-roll writes `user.image`) and `:85` (email change). Other callers: `home.tsx:157,161`, `artifact-detail.tsx:173,181,189`, `edit-artifact-dialog.tsx:82`, `settings-view.tsx:210,298,305`.
- Test exemplars: `src/routes/_authed.unit.test.tsx:1-35` (mocks `@/lib/auth-session`, calls `Route.options.beforeLoad` directly); `src/components/artifacts/home.unit.test.tsx:57-62,94-97` (real memory router with a pathless `id: '_authed'` route); `src/components/blocks/route-fallbacks.unit.test.tsx:20-38,50-72` (router wired like `src/router.tsx`, console capture for the expected loader error).

Rejected alternatives, locked:

- `_authed` `onError` for the `'Unauthorized'` mapping: it sees only its own route's failures and has no location (`load-client.js:88-96`), and each child renders its own `RouteError` boundary. The mapping goes in `RouteError`, the one error path every `_authed` route shares.
- Reuse keyed on the `beforeLoad` `cause` argument: it reads `'preload'` on every hover (`load-client.js:119`), and `router.invalidate()` reports `'stay'` although the avatar and email changes need a fresh session. The rule reads the `_authed` match's own `cause` and `invalid` from `matches`.

Cross-phase rules (from `CLAUDE.md`): kebab-case filenames; no barrel files; tests colocated as `.unit.test.ts(x)`, shared helpers from `@testing/*`; constants that client code imports as runtime values live in client-safe modules, never in server-only files; server fns get auth via `sessionMiddleware`; env only via `src/lib/env.ts`; security invariant: everything except `/sign-in`, `/reset-password`, `/api/auth/*`, `/.well-known/*`, `/healthz` needs a session.

Domain skills the executor must follow:

- `/Users/henry/.claude/skills/react-best-practices/SKILL.md` and `/Users/henry/.claude/skills/react-best-practices/references/async.md` — `async-defer-await`: await the session only in the branch that needs it.
- `/Users/henry/.claude/skills/code-comments/SKILL.md` — one "why" comment on the reuse rule (server fns re-check; invalidate refreshes); no narration.

If the code has drifted from this section since `ffee99b`, especially the router-core version, re-check the decision it supports before you proceed. Report material drift. Do not replan silently.

## Gate

`pnpm gate` (typecheck, lint with fix, fmt, test) closes every phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If the shell's `node -v` is not 26, prefix with `mise exec --`.

## How to execute

- One phase per fresh session; the user commits between phases. Phase 1 must land first: without it, Phase 2 turns session expiry into an error page.
- The orchestrator dispatches ONE subagent per phase (`Task` tool, `subagent_type: general-purpose`) with this plan's Context, the phase's Decisions/Scope/Acceptance, and the intent. It verifies with the gate and re-prompts the SAME subagent on failure. It does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for user review.

## Phases

1. Route an `'Unauthorized'` route error to `/sign-in` with the current location.
2. Reuse the session from router context on in-tree client navigations.

---

## Phase 1 — Expired session lands on sign-in

**Goal**: A loader or `beforeLoad` anywhere that rejects with the session guard's error navigates to `/sign-in?redirect=<current href>` (history replace) instead of rendering "Something went wrong". Other errors render as today.

**Decisions**:

- New client-safe module `src/lib/unauthorized.ts`: `export const UNAUTHORIZED_MESSAGE = 'Unauthorized'` and `export function isUnauthorizedError(error: unknown): boolean` (`error instanceof Error && error.message === UNAUTHORIZED_MESSAGE`). Match on the message: the error crosses the RPC boundary serialized, so a subclass would not survive. Keep the value `'Unauthorized'`, because plan 07's RPC tests assert that literal.
- `src/lib/session-middleware.ts:25` throws `new Error(UNAUTHORIZED_MESSAGE)`. No other change there.
- `RouteError` reads the href with `useLocation` (call it unconditionally, before any early return) and, when `isUnauthorizedError(error)`, returns `<Navigate to="/sign-in" search={{ redirect: href }} replace />`. `replace` keeps Back from returning to the dead page. The href starts with `/`, so it passes `sign-in.tsx:9-14` validation.
- Mutations called from event handlers keep showing the error through `FormStatus`; see Open questions.

**Scope**: in — `src/lib/unauthorized.ts` (new), `src/lib/session-middleware.ts`, `src/components/blocks/route-fallbacks.tsx`, `src/components/blocks/route-fallbacks.unit.test.tsx`. Out — `_authed.tsx`, router context (Phase 2); server-fn guards (plan 07 pins them).

**Acceptance**:

- `pnpm gate` exits 0.
- `route-fallbacks.unit.test.tsx` gains a case: a route at initial entry `/?query=a` whose loader throws `new Error('Unauthorized')`, with a `/sign-in` route in the tree. The router settles at pathname `/sign-in` with `search.redirect === '/?query=a'`, and "Something went wrong" never renders. The existing "renders the error page" case still passes unchanged. Capture the expected console output as `:50-72` does.
- `grep -rn "'Unauthorized'" src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'` → only `src/lib/unauthorized.ts`.

---

## Phase 2 — Session reuse on in-tree navigations

**Goal**: After the first session fetch on the client, search changes, filter toggles, clicks and hover preloads inside `_authed` make zero `getServerSession` calls. Entering `_authed`, an SSR request, and `router.invalidate()` still fetch.

**Decisions**:

- New type-only module `src/lib/router-context.ts`: `export type Session = NonNullable<Awaited<ReturnType<typeof getServerSession>>>` (type import) and `export interface RouterContext { sessionCache: { session?: Session } }`, with a doc comment: one mutable cache per router instance. It is per request on the server and per page load on the client, so it never crosses users.
- `src/routes/__root.tsx:12` becomes `createRootRouteWithContext<RouterContext>()({...})`. `src/router.tsx` passes `context: { sessionCache: {} }` to `createTanStackRouter`. Router context is used rather than a module-level variable, because the router is structurally per request on the server.
- `_authed.beforeLoad({ context, location, matches })`: find the own match (`matches.find((match) => match.routeId === '/_authed')`). Reuse `context.sessionCache.session` only when that match has `cause === 'stay'`, `!invalid`, and the cache holds a session. Otherwise await `getServerSession()`. Every fetch overwrites the cache (`session ?? undefined`) before the redirect check. The redirect and the `{ session }` return stay as they are.
- Leaving `_authed` (sign-out, expiry redirect) and coming back is an `'enter'`, so sign-out needs no explicit cache clear. `settings-view.tsx` needs no change: its `router.invalidate()` marks the match invalid, which forces the refetch.
- The first client navigation after SSR fetches once, because the cache starts empty on the client. Do not seed it from dehydrated state.

**Scope**: in — `src/lib/router-context.ts` (new), `src/router.tsx`, `src/routes/__root.tsx`, `src/routes/_authed.tsx`, `src/routes/_authed.unit.test.tsx`. Out — `sign-in.tsx`, `consent.tsx`, `reset-password.tsx` (each is an `'enter'` page, rarely hit); `settings-view.tsx`, `home.tsx` (no change needed); `auth-session.ts` (no change).

**Acceptance**:

- `pnpm gate` exits 0.
- `_authed.unit.test.tsx`, direct `beforeLoad` cases with explicit `context`/`matches` args: `'enter'` fetches and fills the cache; `'stay'` with a cached session and `invalid: false` does not call `getServerSession`; `'stay'` with `invalid: true` fetches; `'stay'` with an empty cache fetches; a preload call (arg `cause: 'preload'`, own match `cause: 'stay'`) reuses; no session → redirect with `location.href`, and the cache is emptied. Update the two existing cases to pass the new args.
- Same file, one real-router regression case, modelled on `home.unit.test.tsx:57-62,94-97`: a memory router with `context: { sessionCache: {} }`, a pathless `id: '_authed'` route whose `beforeLoad` is the real `Route.options.beforeLoad`, an index child with a search param, and an `/outside` sibling. Assert `getServerSession` call counts: initial load 1; search-only `navigate` 1; `router.invalidate()` 2; navigate to `/outside` and back 3. This pins the router semantics that the reuse rule depends on.
- Red check (run, report, revert): make `beforeLoad` always fetch. The search-only count assertion fails.
- Manual smoke for the user: in the network panel, gallery typing and filter toggles show only `listArtifactsFn` requests; re-roll the avatar and the header identicon updates; sign out in a second tab, then toggle a filter, and the page lands on `/sign-in?redirect=...`.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note the deviation in the final summary. Stop and report instead of improvising in these cases: a locked decision turns out to be wrong or impossible; the work requires touching out-of-scope files; or acceptance cannot be met after a couple of honest attempts. Stop in particular if the real-router case shows that `router.invalidate()` does not surface `invalid: true` on the `_authed` match in `beforeLoad`. The avatar and email refresh depend on it, and the fallback (an explicit cache clear in `settings-view.tsx`) changes scope.

## Done criteria

Machine-checkable; ALL must hold:

- [ ] `pnpm gate` exits 0 after each phase
- [ ] `src/lib/unauthorized.ts` and `src/lib/router-context.ts` exist; `grep -c "createRootRouteWithContext" src/routes/__root.tsx` → 1
- [ ] `grep -c "getServerSession()" src/routes/_authed.tsx` → 1
- [ ] The red check was run and reverted, and its output is in the Phase 2 summary
- [ ] `docs/plans/README.md` status row for 11 updated

## Open questions

- Should `useFormAction` also route `'Unauthorized'` from mutations to `/sign-in`? Resolves outside this plan. Default: no. The next navigation or `router.invalidate()` already lands there through Phase 1, and the form shows the error meanwhile.
