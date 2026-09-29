# Plan 33 — Direction spike: opt-in revocable share links

Decide whether Exhibit gets opt-in, revocable, read-only share links for single artifacts, and write that decision as a memo appended to this plan. The memo validates or overturns the strawman design below against the code, lists every security-invariant change for Henry to accept or reject, and ends with a verdict. This plan changes no source, test, schema, or CLAUDE.md line. Build phases come later, through `blueprint update 33`, and only if Henry accepts the memo.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: L for the feature if built; the spike phase itself is M (read-only analysis and one memo).
- **Risk**: HIGH for the feature (first unauthenticated route that serves owner content). The spike is LOW: it writes only this file.
- **Depends on**: none. Interacts with plan 07: if its server-fn allowlist test has landed, a public share server fn needs an entry there.

## Why this matters

Every publish tool tells Claude that the returned URL "is not a link to share" (`src/lib/mcp/server.ts:156`, `:206`, `:256`; `src/lib/mcp/url.ts:3`). So a publish to Exhibit ends at "take a screenshot" whenever the owner wants someone else to see the result. A share link fixes that, but it changes the project's core stance: one owner, and no artifact content without a session. "Not worth doing" is a valid verdict. The spike exists so Henry decides on evidence, before anyone writes code.

## Context

- Public-route invariant: `CLAUDE.md:38` lists the only public routes. `CLAUDE.md:39` fixes `/render/:id/:n` as the only page that shows HTML artifacts. A share route amends both lines.
- Route allowlist test: `src/routes/route-protection.unit.test.ts:6-10` explains that protection is allowlist-shaped. `PUBLIC` is at `:15-24` and `SELF_GUARDED` at `:27-32`. A share route is a new, reviewed entry here.
- HTML serving: `src/routes/render.$id.$n.ts:16-17` holds `RENDER_CSP` (sandbox, opaque origin). `:40-51` builds the response, with `Referrer-Policy: no-referrer` at `:49`. The session check runs inside `resolveArtifactVersion` (`src/lib/resolve-artifact-version.ts:21-25`), before the version lookup.
- Spec and markdown render inside the authed shell: `src/routes/_authed.tsx:8-16` guards the layout, and `src/routes/_authed/a.$id/index.tsx:6-20` loads through `getArtifactDetailFn` (`src/lib/artifacts.ts:127-146`). That fn returns the owner's saved `state`, the `versions` list, and `answers`. A share view must not reuse it.
- Renderers accept an optional store: `SpecView` (`src/catalog/registry.tsx:90-98`) and `MarkdownView` (`src/components/markdown/markdown-view.tsx:57-67`). The owner view seeds a store from saved state and debounce-saves every change through `saveArtifactStateFn` (`src/components/artifacts/artifact-detail.tsx:98-158`, save fn at `src/lib/artifacts.ts:188-202`).
- Stateful components that write the store: `src/components/catalog/checklist.tsx`, `choice.tsx`, `rating.tsx`, `note-box.tsx`. NoteBox holds free text, so saved state can be private even when the body is not.
- Map key: `getProtomapsApiKeyFn` is session-guarded (`src/lib/map-config.ts:11-13`). On failure, the map falls back to the Carto basemaps (`src/components/ui/map/map.tsx:32-49`). So a public map degrades, but it does not break.
- Soft delete: `getArtifact` filters `deletedAt` (`src/database/repository.ts:358-387`, filter at `:366`). `softDeleteArtifact` (`:622-624`) and `restoreArtifact` (`:631-640`) are the single choke points: the UI calls them at `src/lib/artifacts.ts:250`, `:262`, MCP at `src/lib/mcp/server.ts:666`. `purgeArtifact` (`:646-648`) relies on `onDelete: cascade`.
- Schemas: `src/database/schemas/artifact.ts:4-24`, `artifact-version.ts:5-17`, `artifact-state.ts:10-16`. Migrations are forward-only and come from `pnpm db:generate`.
- Rate limiting exists only in Better Auth (`src/lib/auth.ts:103-117`), so it covers `/api/auth/*` alone. The global headers plugin (`src/lib/security-headers-plugin.ts:12-24`) sets the fallback headers only when a route sets none.

Cross-phase rules (from CLAUDE.md), for the memo's build proposal:

- Kebab-case files, no barrels. Routes folder is pure routes; support code lives in `src/lib/` or `src/components/<domain>/`. Tests are colocated as `.unit.test.ts(x)` or `.int.test.ts`.
- Env only through `src/lib/env.ts`. Server fns get auth from `sessionMiddleware` (`src/lib/session-middleware.ts:29-33`); any fn without it must be a reviewed public exception.
- HTML artifacts are hostile: own top-level page, `sandbox allow-scripts`, never an iframe or srcdoc, never same-origin with the app.
- UI: house Base UI components, semantic tokens only, 32px controls, `Form` + `Field` with `useFormAction`.
- Don't start dev servers, run installs, or any `db:*` script during the spike.

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before you proceed. Report material drift. Don't silently replan.

## Gate

`pnpm gate` (typecheck, lint --fix, fmt, test) closes the phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If the shell's `node -v` differs from `mise current`, prefix commands with `mise exec --`.

## How to execute

- Single phase, one fresh session. The user commits.
- The orchestrator dispatches one subagent (`Task`, `subagent_type: general-purpose`) with this plan. It checks the acceptance commands and re-prompts the same subagent on failure.
- On success, the subagent returns the verdict line and the invariant-change list, then stops for Henry's review.

---

## Phase 1 — Decision memo

**Goal**: this file gains a `## Decision memo` section that holds a one-line verdict, a threat model, the invariant changes for Henry to accept, the feasibility evidence, and a phased build proposal. Nothing else in the repo changes.

**Decisions** — the strawman. The memo confirms each item with `file:line` evidence, or overturns it with evidence and a replacement:

- Table `share_links` in `src/database/schemas/share-link.ts`: `id` text PK, `token` text unique not null, `artifactId` text FK to `artifacts.id` with `onDelete: cascade`, `version` integer not null, `createdAt` integer not null, `revokedAt` integer nullable. At most one unrevoked link per artifact, enforced by a partial unique index on `artifact_id where revoked_at is null`.
- `version` is pinned, not nullable. A follow-latest link would silently publish every later `update_artifact` (including edits by Claude) to everyone who holds the link. The owner shares a new version by revoking and minting again.
- Token: 32 bytes from `crypto.getRandomValues`, base64url (43 chars), stored in plaintext. Hashing buys nothing here: the same database holds every artifact body, so a database leak exposes the content anyway. Plaintext also lets the owner copy the link again.
- URLs: `/s/:token` is the chrome-free viewer page for spec and markdown. `/s/:token/raw` serves html bytes with `RENDER_CSP`, and `/s/:token` redirects there for html artifacts. The memo names the exact route files. It must also confirm, against TanStack flat-route rules and `src/routeTree.gen.ts`, that the raw route does not nest under the page route's component or loader.
- Public read path: one server fn without `sessionMiddleware`, in a new `src/lib/share-links.ts`. It returns only `{ title, type, body }`. It never returns saved state, versions, answers, tags, or description. Unknown, revoked, and soft-deleted tokens all return the same 404, so a response never tells a revoked token apart from one that never existed.
- Interaction state: the share view never reads `artifact_states`. It renders with a fresh in-memory store that has no subscriber, so no save fn is reachable. A viewer can toggle controls locally, and the result is lost on reload.
- Response headers on both share routes: `Referrer-Policy: no-referrer` (the token is in the path), `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store` (revocation takes effect at once, through any proxy). The memo names the TanStack Start mechanism that sets headers on an SSR page response.
- Revocation: the owner revokes a link explicitly. `softDeleteArtifact` also revokes every link, so a restore from trash never brings a link back. Purge relies on the cascade. Archive does not revoke: it hides an artifact from the gallery list, it does not unpublish it.
- Owner UI: a "Share link" item in the detail view's `DropdownMenu` (`src/components/artifacts/artifact-detail.tsx:303-350`) opens a dialog to create, copy, and revoke the link. It uses session-guarded server fns.
- MCP: no tool mints, lists, or revokes links. An MCP client acts on text it did not write, so a minting tool gives prompt injection a way to make private artifacts public. The tool descriptions at `server.ts:156`, `:206`, `:256` stay true, because the returned URL is still owner-only.
- No new rate limiter. A 256-bit token makes guessing infeasible, and the Better Auth limiter does not reach app routes. The memo either agrees or names a concrete attack that a limiter stops.
- Map on share pages: accept the Carto fallback. Don't add a public key endpoint.

**Scope**: in: append `## Decision memo` to this file. Out: every other file, including `docs/plans/README.md` (the orchestrator owns the index), CLAUDE.md, source, tests, and migrations. No prototype branch: the evidence comes from reads of the repo and of `node_modules`.

**Memo contents** (all required):

- `Verdict: BUILD | DO NOT BUILD | DEFER`, as one line, then one sentence on what would change it.
- Invariant changes, one row each, with an unchecked accept box for Henry. Include at least: `CLAUDE.md:38` public-route list, `CLAUDE.md:39` second HTML surface, the `route-protection` allowlist entries, the first public server fn (and the plan 07 allowlist, if landed), and non-owners reaching owner-published HTML on the owner's domain (a phishing surface, even with an opaque origin).
- Threat model: a table of threat, control, and residual risk. It covers token leak (referrer, logs, history), private saved state, stale version exposure, revoke latency, a deleted-then-restored artifact, search indexing, a hostile HTML body, and MCP-driven minting.
- Feasibility evidence, with `file:line` for each strawman item it confirms or overturns.
- Build proposal: 3–5 phases, each at most ~6 files, each with a one-line goal and its acceptance commands (for example, a migration and repository phase, a public route phase, an owner UI phase, and a docs and invariants phase).

**Acceptance**:

- `pnpm gate` exits 0.
- `git status --porcelain -- . ':!docs'` → no output.
- `grep -c '^## Decision memo' docs/plans/33-share-links-spike.md` → `1`.
- `grep -nE '^Verdict: (BUILD|DO NOT BUILD|DEFER)$' docs/plans/33-share-links-spike.md` → exactly one match.
- `grep -c '^- \[ \]' docs/plans/33-share-links-spike.md` → 9 or more (4 Done-criteria boxes plus at least 5 invariant accept boxes).
- Manual (Henry): read the memo, tick or strike each invariant row, then run `blueprint update 33` to turn the build proposal into phases, or mark the plan REJECTED in the index.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note each deviation in the memo. Overturning a strawman item with evidence is the spike's purpose, not a deviation. Stop and report instead of improvising when:

- the memo can't reach a verdict without a running prototype (say which question needs one),
- the work requires touching any file other than this plan,
- acceptance can't be met after a couple of honest attempts.

## Done criteria

- [ ] `pnpm gate` exits 0
- [ ] Only `docs/plans/33-share-links-spike.md` changed
- [ ] The memo has one verdict line, the invariant accept boxes, the threat table, `file:line` feasibility evidence, and a phased build proposal
- [ ] `docs/plans/README.md` status row updated (by the orchestrator)

## Open questions

- Expiry (`expiresAt`) on links (phase 1 memo). Default: no. Explicit revoke is enough for one owner; add expiry only if the memo finds a concrete need.
