# Plan 15 — Sandbox CSP on /download responses

Add a `sandbox` Content-Security-Policy to every `/download/:id/:n` response, so a client that renders the attachment inline runs the hostile HTML with no script and an opaque origin. Fix the two comments that the change makes stale. This plan does not change `/render`, the download formats, the filename, or the global security-headers plugin.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none

## Why this matters

`/render` contains hostile HTML with `sandbox allow-scripts`. `/download` serves the same body as `text/html` from the app origin, and only `Content-Disposition: attachment` keeps it from running same-origin with the owner session. Chrome, Firefox, and Safari honor `attachment`, and `nosniff` is set, so this is defense in depth, not a live exploit. A non-conforming webview that renders the response inline would give AI-authored script the owner's cookies. The fix is one header, and it is inert when the browser downloads the file as intended.

## Context

- `src/routes/download.$id.$n.ts:20-27` maps each artifact type to a content type; html is `text/html; charset=utf-8` (`:25`). The single 200 response is built at `:49-59`: `Content-Disposition: attachment` at `:53`, `nosniff` at `:54`, and `Referrer-Policy: no-referrer` at `:57`.
- `src/routes/download.$id.$n.ts:55-56` is the comment this plan fixes. It says `Referrer-Policy` is inert and that "the two artifact-serving routes stay header-identical". After this plan the CSPs differ, so that claim becomes false.
- `src/routes/render.$id.$n.ts:6-17` holds `RENDER_CSP` and its doc comment. `/render` must let scripts run (`sandbox allow-scripts`), and `/download` never needs to.
- `src/lib/security-headers-plugin.ts:13-15` sets the fallback CSP `frame-ancestors 'none'` only when a route sets no CSP. A route-set CSP replaces the fallback, so the download CSP must restate `frame-ancestors 'none'` or the response loses anti-framing.
- `src/lib/resolve-artifact-version.ts:21-37` returns the 401/400/404 responses. They carry no body, keep the plugin fallback CSP, and stay unchanged.
- `src/routes/download.$id.$n.unit.test.ts:74-94` is the html case to extend. Its comment at `:90-91` says the Referrer-Policy header protects "a downloaded artifact opened from disk". That is wrong: response headers do not travel with a saved file.
- Test pattern to copy: `src/routes/render.$id.$n.unit.test.ts:22-30` spells the expected CSP out as a literal instead of importing the constant, so a weakened policy fails the test. `:45-66` adds directive-level assertions.
- Rejected alternative: reusing `RENDER_CSP`. It would import across route files (CLAUDE.md: the routes folder is pure routes) and would allow scripts a download never needs.
- Comments follow `/Users/henry/.claude/skills/code-comments/SKILL.md`: state why, not what; fix or delete stale comments.

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before you proceed. Report material drift. Don't silently replan.

## Gate

`pnpm gate` (typecheck, lint --fix, fmt, test) closes the phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If the shell's `node -v` differs from `mise current`, prefix commands with `mise exec --`.

## How to execute

- Single phase, one fresh session. The user commits.
- The orchestrator dispatches one subagent (`Task`, `subagent_type: general-purpose`) with this plan. It verifies with the gate and re-prompts the same subagent on failure.
- On success, the subagent returns a short "what changed, what to test" summary, then stops for user review.

---

## Phase 1 — Sandbox every download response

**Goal**: every 200 response from `/download/:id/:n` carries `Content-Security-Policy: sandbox; default-src 'none'; frame-ancestors 'none'`. The stale comments in the route and its test state the real reason for the defense-in-depth headers.

**Decisions**:

- Add a module-private constant in `src/routes/download.$id.$n.ts`: `const DOWNLOAD_CSP = "sandbox; default-src 'none'; frame-ancestors 'none'";`. Don't export it. The test spells the literal out, as in the render test.
  - Bare `sandbox` (no `allow-scripts`): if a client renders the attachment inline, no script runs and the document gets an opaque origin. This is strictly tighter than `RENDER_CSP`.
  - `default-src 'none'`: an inline render also loads no subresources, so it sends no requests to remote hosts.
  - `frame-ancestors 'none'`: restates the plugin fallback that this route-set CSP replaces (`src/lib/security-headers-plugin.ts:13-15`).
- Set `'Content-Security-Policy': DOWNLOAD_CSP` in the one response headers object (`:51-58`) for all three types. Don't branch on `html`: the header is inert on JSON and markdown, and one headers object keeps the route simple.
- Comments, per the code-comments skill:
  - Put a short doc comment on `DOWNLOAD_CSP` that states the contract. `attachment` is the primary control. The CSP applies only when a client renders the response inline instead, and then it blocks all script and all subresource loads. Mention that `frame-ancestors` restates the plugin baseline, because a route CSP replaces it.
  - Rewrite `:55-56` so it gives the `Referrer-Policy` reason on its own terms: like the CSP, it matters only if a client renders the response inline. Delete the "header-identical" claim.
  - Rewrite the test comment at `download.$id.$n.unit.test.ts:90-91` to match. Drop the "opened from disk" claim.
- Tests, in `src/routes/download.$id.$n.unit.test.ts`:
  - Add a top-level `EXPECTED_DOWNLOAD_CSP` literal. Give it a one-line comment that points to the render test's rationale. Don't duplicate that rationale.
  - In the html case: `toBe(EXPECTED_DOWNLOAD_CSP)`, plus `not.toContain('allow-scripts')` and `not.toContain('allow-same-origin')`.
  - In the spec case (`:52-72`) and the markdown case (`:96-117`): assert the same `toBe(EXPECTED_DOWNLOAD_CSP)`. This proves that no type branch exists.

**Scope**: in: `src/routes/download.$id.$n.ts` and `src/routes/download.$id.$n.unit.test.ts`. Out:

- `src/routes/render.$id.$n.ts` and `RENDER_CSP`: `/render` is already correct.
- `src/lib/security-headers-plugin.ts`: the fallback is correct for app pages.
- `README.md:133` and CLAUDE.md security invariants: they describe `/render` as the display surface, and that stays true. The writing sweep (plan 18) owns README wording.
- Serving html as `application/octet-stream`: rejected. The CSP covers the same case, and the file keeps its real type after it is saved.

**Acceptance**:

- `pnpm gate` exits 0.
- `pnpm vitest run 'src/routes/download.$id.$n.unit.test.ts'` → all cases pass, and the html, spec, and markdown cases each assert the CSP.
- Temporarily delete the `Content-Security-Policy` header line from the route. The html, spec, and markdown cases then fail. Revert, and mention this check in the summary.
- `grep -nE "header-identical|opened from disk" 'src/routes/download.$id.$n.ts' 'src/routes/download.$id.$n.unit.test.ts'` → no match.
- `grep -nE "allow-scripts|RENDER_CSP" 'src/routes/download.$id.$n.ts'` → no match.
- Manual smoke (user): download an html artifact in the browser. The file saves and opens from disk as before. DevTools shows the new CSP on the `/download` response.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note each deviation in the final summary. Stop and report instead of improvising when:

- a locked decision is wrong or impossible,
- the work requires touching out-of-scope files,
- acceptance can't be met after a couple of honest attempts.

## Done criteria

- [ ] `pnpm gate` exits 0
- [ ] Every 200 `/download` response sets `Content-Security-Policy: sandbox; default-src 'none'; frame-ancestors 'none'`
- [ ] The download test asserts that CSP literal for the html, spec, and markdown cases
- [ ] No comment in the route or its test claims header parity with `/render` or protection for a file opened from disk
- [ ] `docs/plans/README.md` status row updated
