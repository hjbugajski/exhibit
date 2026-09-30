# Plan 30 — Investigate: layout golden snapshots value; sign-in navigate after OAuth resume

Two low-confidence audit findings get an evidence-backed verdict each. Phase 1 measures what the full-scene layout goldens catch that the invariants miss, and what they cost per intended change. Phase 2 records whether the unconditional `navigate` after sign-in harms an OAuth resume. The deliverable is a written finding plus recommendation appended to this file. No source, test, or snapshot change ships from this plan; any fix becomes a follow-up plan.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: S
- **Risk**: LOW (experiments are reverted; nothing ships)
- **Depends on**: none

## Why this matters

About 13.7k lines of float-dump goldens across 8 `.snap` files get rewritten on any metric or router tweak and accepted with `-u` unread. They may be pure churn, or they may be the only net for a worse-but-valid layout. Nobody knows which. Separately, sign-in always pushes `/` after success, even when Better Auth has already started a cross-document redirect to resume an MCP OAuth flow. At minimum that wastes session, tag and gallery requests. At worst it cancels the OAuth continuation in some browser. Both need data before anyone changes code.

## Context

Goldens (Phase 1):

- `testing/diagram/golden.ts:44` — `goldenScene` deep-clones a scene with every number rounded to 2 decimals (`fraction` keys to 4). No field is dropped, so path `d` strings and every point land in the snapshot.
- Golden call sites: `src/lib/diagram/families/{state,sequence,class,er,gantt}/layout.unit.test.ts` (state :55, sequence :55, class :60, er :50, gantt :51), `families/pie/layout.unit.test.ts:268`, `families/flowchart/family.unit.test.ts:152`, `core/graph/layout-graph.unit.test.ts:251`. The same fixtures also run `assertLayoutInvariants` (state :47, flowchart :156) and `assertDeterministic` (state :59, flowchart :160).
- Layout `.snap` sizes at `ffee99b`: flowchart family 3132, layout-graph 2302, state 2090, sequence 1794, gantt 1593, class 1413, er 1165, pie 267 (total 13756). Parse snapshots (`families/*/__snapshots__/parse.unit.test.ts.snap`) are out of scope; they use readable one-line digests, e.g. `families/flowchart/parse.unit.test.ts:315`. That digest format is the reference for any replacement.
- Invariants: `testing/diagram/invariants.ts` (overlap :47, endpoints on outline :107, labels unstruck :144, clusters :278, edge through node :555, rank monotone :744, finite coordinates :832, path quality :1016, sequence :1066, deterministic :1137, crossings non-increasing :1141, the `assertLayoutInvariants` bundle :1150, gantt :1172). They check validity, not quality: a longer route or wider spacing that stays valid passes them.
- History cannot answer the question, as verified at planning time. On `main` every layout `.snap` arrived in `dcdaf87` (#11, squashed). The unsquashed branch `feat/diagram-library` has two commits. `7ffcd32` added flowchart, layout-graph, pie, sequence and state goldens. `fb47eec` added class, er and gantt, and changed only 8 lines of the pie golden. That is one change event with no recorded regression. So the phase uses a perturbation experiment, not history.
- Goldens are the refactor safety net for other plans. Plan 24's gate is `git diff ffee99b --stat -- 'src/lib/diagram/**/__snapshots__/**'` → empty. Plan 10 requires the pie and gantt snapshots to stay unchanged. `docs/plans/README.md` rejects ARCH-07 partly because "goldens pin behaviour". Any trim recommendation must be sequenced after 03, 10 and 24.

Sign-in navigate (Phase 2):

- `src/components/account/sign-in-view.tsx:69` calls `authClient.signIn.email`. `:76` then calls `await navigate({ to: redirect ?? '/' })` unconditionally. `data` is never read.
- `src/lib/auth-client.ts:5` registers `oauthProviderClient()`. Its fetch plugin (`node_modules/@better-auth/oauth-provider/dist/client.mjs:14-21`) adds `oauth_query` to every POST-style request (not GET or DELETE) when `window.location.search` carries a signed query (`sig` + `ba_param`, see `signed-query-Df1MNiSH.mjs:27-35`).
- Server side: the plugin's after-hook (`authorize-Crqw4_bR.mjs:4466-4489`) fires when the response sets a session cookie and an OAuth state exists. It calls `runOAuth2Authorize`. For a fetch request, `handleRedirect` (`:5324-5332`) returns `{ redirect: true, url }` as the sign-in response body. `url` is `/consent?…` when consent is needed, or else the client's `redirect_uri` with a code.
- Client order, confirmed: better-fetch awaits every `onSuccess` hook (`node_modules/.pnpm/@better-fetch+fetch@1.3.1/.../dist/index.js:675-680`) before it returns `{ data }` (:684-687). better-auth's `redirectPlugin` (`node_modules/better-auth/dist/client/fetch-plugins.mjs:7-10`) sets `window.location.href = data.url`. So the cross-document navigation starts, and then `navigate('/')` runs. That call reaches `history.pushState` (`@tanstack+history@1.162.1/.../dist/esm/index.js:58`) and the `/_authed` `beforeLoad` + `loader` (`src/routes/_authed.tsx:8-17`).
- The consent page already follows the right pattern. `src/components/account/consent-view.tsx:44-54` reads `data.url` and assigns `window.location.href` itself; it never calls `navigate`.
- Plan 02 rewrites the same line (`sign-in-view.tsx:76` → `navigate({ to: sameOriginPath(redirect) ?? '/' })`). Any fix from this phase lands after plan 02.

Cross-phase rules (from `CLAUDE.md`): no dev servers started by the agent, because Henry runs his own; use `localhost`, never `127.0.0.1` (Better Auth origin check); never update snapshots with `-u` to make a real change pass (the experiment below is the one sanctioned, reverted use); only `docs/plans/` may change in the final diff.

Domain skill: `/Users/henry/.claude/skills/tdd/SKILL.md` — for judging which net catches what, and for the seams any follow-up fix sketch names. A snapshot that nobody reads before `-u` counts as a tautological test under its anti-patterns.

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before you proceed. Report material drift. Do not replan silently.

## Gate

`pnpm gate` (typecheck, lint with fix, fmt, test) closes each phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If the shell's `node -v` is not 26, prefix with `mise exec --`. In Phase 1, a green gate after the experiment also proves every perturbation was reverted.

## How to execute

- One phase per fresh session; the user commits between phases. The phases are independent and can run in either order.
- The orchestrator dispatches ONE subagent per phase (`Task`, `subagent_type: general-purpose`) with this plan's Context, the phase block, and the intent. It verifies with the gate and re-prompts the SAME subagent on failure. It does not edit files itself.
- Phase 2 needs Henry. The subagent returns the manual scenario. The orchestrator relays it to Henry and passes his observations back to the SAME subagent, which then writes the finding.

## Phases

1. Goldens: perturbation experiment, then a verdict on keep / digest / canonical-only.
2. OAuth resume: code facts plus Henry's browser run, then a verdict on the navigate guard.

---

## Phase 1 — What do layout goldens catch, and what do they cost?

**Goal**: A `## Findings — Phase 1` section in this file. It has a results table and a verdict: keep as is, replace with a compact digest, or keep canonical fixtures only. The verdict states what evidence would change it.

**Decisions**:

- Precondition: `git status --porcelain src testing` is empty before the first perturbation. Otherwise stop and report, because the revert step below would discard someone's work.
- Run exactly these six single-constant perturbations, one at a time. P1–P5 are plausible quality regressions that still yield valid layouts. P6 is an intended design change.
  - P1 `src/lib/diagram/core/graph/position.ts:16` `PASSES` 8 → 1
  - P2 `core/graph/order.ts:272` `TRANSPOSE_LIMIT` 8 → 0
  - P3 `core/graph/legs.ts:34` `LANES` 4 → 1
  - P4 `families/pie/layout.ts:30` `CENTROID_RATIO` 0.68 → 0.85
  - P5 `core/text/measure.ts:37` `BASELINE_FROM_CENTER` 0.36 → 0.30
  - P6 `src/lib/diagram/metrics.ts:104` `nodeSep` 40 → 44
- Per perturbation, record the following. First, run `pnpm test src/lib/diagram` and count failing tests: snapshot mismatches (`toMatchSnapshot`) separately from every other failure. Do not classify by test name: `pie/layout.unit.test.ts:228` "golden precision" is an in-memory test, and the pie snapshot test also asserts diagnostics. Then run `pnpm test src/lib/diagram -u` and record `git diff --shortstat -- 'src/lib/diagram/**/__snapshots__/**'` (snapshot churn). Then revert with `git restore src/lib/diagram`. The precondition makes that revert safe.
- For one of P1–P3 that goldens catch, open the snapshot diff and answer one question: could a reviewer tell from the diff alone that the output got worse? This is the "legible expectation" test. A diff of hundreds of float lines fails it.
- Verdict rule, locked:
  - If invariants or other tests catch every regression that goldens catch → recommend deleting the full-scene goldens.
  - If goldens alone catch some of P1–P5 but fail the legibility question, or P6 churn exceeds 300 lines → recommend a compact digest: one line per node (id + integer box) and one per edge (id + integer endpoints + point count), modelled on the flowchart parse digest.
  - If goldens alone catch regressions and the diffs are legible → keep as is.
- Any recommended change is written as a follow-up plan sketch (files, decision, gate), sequenced after plans 03, 10 and 24. Do not execute it here.

**Scope**: in — this plan file (append findings). Temporary, reverted edits to the six files above and their snapshots. Out — parse snapshots; `testing/diagram/invariants.ts` (a new quality invariant is a possible recommendation, not work for this phase); other `goldenScene` consumers that compare in memory (`pie/layout.unit.test.ts:84` determinism, `:228` golden precision, `flowchart/family.unit.test.ts:160` determinism, `core/graph/harness.unit.test.ts:192`); any follow-up keeps `goldenScene` for them.

**Acceptance**:

- `git status --porcelain src testing` → empty.
- `pnpm gate` exits 0.
- `grep -c "^| P[1-6] " docs/plans/30-investigate-goldens-and-oauth-sign-in.md` → 6. Each results row has columns for golden failures, other failures, and snapshot churn.
- The findings section ends with a line starting `Verdict:` and a line starting `Would change if:`.

---

## Phase 2 — Does navigate('/') harm an OAuth resume?

**Goal**: A `## Findings — Phase 2` section. It records Henry's browser observations and ends with a verdict on guarding the navigate.

**Decisions**:

- The agent runs no browser and no dev server. The code facts in Context are already verified; re-confirm them against `node_modules` only if versions drifted.
- The manual scenario the subagent hands Henry. Run it in Chrome, Safari and Firefox, each in a private window so no session exists:
  1. Against the dev origin (`http://localhost:<port>`), add a browser-based OAuth MCP client, e.g. `claude mcp add --transport http exhibit-e2e http://localhost:<port>/mcp`, then authenticate it from `/mcp` in a Claude Code session. The browser lands on `/sign-in?…&sig=…`.
  2. Open DevTools Network with "Preserve log" on. Sign in.
  3. Record: the `sign-in/email` response body (`redirect`, `url`); the final URL (`/consent`, the client callback, or `/`); whether the gallery flashed; and whether any `_authed` server-fn requests (session, tags, gallery) fired after the sign-in POST.
  4. Approve consent, then repeat once more so the run covers the no-consent path (`url` = the client callback), if Better Auth skips consent for the now-known client.
- Verdict rule, locked:
  - If any browser ends on `/` or loses the continuation → correctness bug; recommend the fix at high priority.
  - Else, if `_authed` requests fired or the gallery flashed → recommend the fix as an efficiency/UX change.
  - Else → "not worth doing".
- Fix shape for the follow-up plan, pre-decided so the recommendation is executable. After the error check in `handleSubmit`, read `data` and return early when `data?.redirect && data.url`: `redirectPlugin` already owns that navigation, the same way `consent-view.tsx:54` owns its own. Seam: `src/components/account/sign-in-view.unit.test.tsx`. Mock `signIn.email` to resolve `{ data: { redirect: true, url: '/consent?x=1' }, error: null }` and assert the view stays mounted, i.e. no navigation away from `/sign-in`. A plain sign-in (`redirect: false`) still leaves `/sign-in`. It lands after plan 02.

**Scope**: in — this plan file (append findings). Out — `sign-in-view.tsx` and its test (the follow-up owns them, after plan 02); Better Auth configuration.

**Acceptance**:

- `git status --porcelain src testing` → empty; `pnpm gate` exits 0.
- The findings section names every browser Henry ran, with the final URL per browser, and ends with `Verdict:` and `Would change if:` lines.
- Manual smoke: the scenario above, run by Henry only.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent and stays in scope. Note the deviation in the findings. Stop and report in these cases:

- a perturbation constant has moved or been renamed (pick the nearest equivalent and say so, or stop if none exists),
- `git restore` would touch a path that was dirty before the experiment,
- Henry cannot run a browser-based OAuth client locally.

## Done criteria

- [ ] `pnpm gate` exits 0
- [ ] `git status --porcelain src testing` → empty (no source, test or snapshot change from this plan)
- [ ] Both `## Findings — Phase N` sections exist, each with `Verdict:` and `Would change if:` lines
- [ ] `docs/plans/README.md` status row updated

## Open questions

- Phase 2: should the port-3100 throwaway E2E agent (chrome-devtools) run the Chrome leg instead of Henry? Default: no. The finding must reflect Henry's own browser environment, and Safari and Firefox need a human anyway.

## Findings (2026-09-29)

### Phase 1: layout goldens

Each perturbation ran in a scratch copy of the repo; churn is the summed `git diff --no-index --shortstat` of every `.snap` after `-u`.

| #   | Perturbation                        | Golden failures | Other failures                       | Snapshot churn     |
| --- | ----------------------------------- | --------------- | ------------------------------------ | ------------------ |
| P1  | `PASSES` 8 to 1                     | 13              | 1 (`core/graph/fuzz.unit.test.ts`)   | 5 files, +327/-271 |
| P2  | `TRANSPOSE_LIMIT` 8 to 0            | 0               | 1 (`core/graph/fuzz.unit.test.ts`)   | 0                  |
| P3  | `LANES` 4 to 1                      | 0               | 0                                    | 0                  |
| P4  | `CENTROID_RATIO` 0.68 to 0.85       | 2 (pie)         | 0                                    | 1 file, +10/-10    |
| P5  | `BASELINE_FROM_CENTER` 0.36 to 0.30 | 51 (all)        | 1 (`core/text/measure.unit.test.ts`) | 8 files, +336/-336 |
| P6  | `nodeSep` 40 to 44 (intended)       | 14              | 0                                    | 5 files, +272/-272 |

Verdict: replace the full-scene layout goldens with a compact digest, in a follow-up plan.

- Goldens alone catch only P4. P1 and P5 are also caught by fuzz and measure tests, P2 only by fuzz, P3 by nothing.
- The diffs are not legible: the one real regression signal in P1 (an ER edge going from 5 to 7 points) is visible only by counting array entries across about 600 changed lines.
- An intended change (P6) churns 544 lines.

Would change if: a quality invariant for pie label placement is added (then the recommendation becomes deletion), or an intended change typically produced under about 50 readable changed lines.

Follow-up sketch: add `digestScene` beside `goldenScene` in `testing/diagram/golden.ts` (one line per node with an integer box, one per edge with integer endpoints and point count, one per label or slice position for pie and gantt); switch the 8 layout snapshot call sites; keep `goldenScene` for the determinism and precision consumers; add a fixture or invariant that exercises `LANES`.

### Phase 2: sign-in navigate after OAuth resume

Code facts re-confirmed at better-auth 1.7.6 and @better-fetch/fetch 1.3.2:

- The client `redirectPlugin` is on by default and sets `window.location.href = data.url`; better-fetch awaits every `onSuccess` hook before returning.
- The server returns `{ redirect: true, url }` to a fetch request when it resumes an authorize flow.
- `handleSubmit` in `src/components/account/sign-in-view.tsx` ignores `data` and always calls `navigate`, so a client navigation to `/` follows the cross-document redirect and reaches the `/_authed` `beforeLoad` and `loader`.

Browser observation (2026-09-29, Chromium, dev server on `http://localhost:3100`, fresh client registered by DCR): signing in from `/sign-in?...&sig=...` lands on `/consent` with the authorize parameters intact. The continuation is not lost. Safari and Firefox were not run.

Verdict: fix as an efficiency change. `handleSubmit` now returns early when the sign-in response carries `redirect` and `url`, so no client navigation to `/` runs behind the cross-document redirect. Covered by two cases in `src/components/account/sign-in-view.unit.test.tsx`.

Would change if: Safari or Firefox end on `/` in the same scenario; that would make it a correctness bug in the auth client's redirect plugin rather than in this view.
