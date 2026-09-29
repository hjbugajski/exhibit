# Plan 16 — Correct docs and comments that contradict the code

Make every README line and code comment listed in this plan match the code it describes: the README's third-party fetch and rate-limit claims, the `TRUSTED_PROXIES` doc, stale line and version pins, dangling references to plans and decision IDs, and the diagram engine's entry-point contract. Out of scope: style-only rewrites (plan 18), cruft deletion such as banners and journal tense elsewhere (plan 17), and any behavior change. Every edit is prose; no runtime code changes.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none

## Why this matters

The README "Security model" section is where an operator decides what leaves their network, and it denies calls the app makes when `PROTOMAPS_API_KEY` is set. The README and `env.ts` both describe the unset-`TRUSTED_PROXIES` case as "trust the header", but the code ignores the header and uses one shared bucket, so an operator reasoning about lockout gets the opposite answer. Elsewhere, comments point at line numbers, versions, and documents that no longer exist, and the one doc that states when a diagram parse returns null lists the wrong causes.

## Context

Operator docs (Phase 1):

- `README.md:7` — "28-component catalog". `src/catalog/catalog.ts:95-685` defines 29 (Section through Stop), and plans 34 and 35 add more.
- `README.md:133` — HTML bullet, already correct: scripts and styles limited to inline or cdnjs, `connect-src 'none'`.
- `README.md:137` — "External fetches": names only `https:` images and CARTO tiles, then "No other third-party calls are made". Actual hosts:
  - `src/components/ui/map/map.tsx:34-35` — Carto styles on `basemaps.cartocdn.com` (no key).
  - `src/components/ui/map/protomaps-style.ts:232-233,237` — with a key: glyphs and sprites from `protomaps.github.io`, tiles from `api.protomaps.com`.
  - `src/routes/render.$id.$n.ts:17` — `RENDER_CSP`: `img-src https: data:`, `font-src https: data:`, cdnjs for script and style.
  - `src/lib/mailer.ts:29` — the server calls Resend when `RESEND_API_KEY` is set. `git grep "fetch("` in non-test `src` finds no other outbound call. App fonts are self-hosted (`src/styles.css:16-29`).
- `README.md:106` — "without it, the header is client-controlled and rate limiting is best-effort". `src/lib/env.ts:28` — "unset trusts single-value X-Forwarded-For verbatim". Both are wrong: `src/lib/auth.ts:113-117` sets `ipAddressHeaders: []` when `TRUSTED_PROXIES` is unset. The rationale is at `auth.ts:106-112`, and `src/lib/auth.unit.test.ts:80-85` pins the behavior. Every caller then shares one rate-limit bucket.

Stale comment references (Phase 2):

- `src/lib/mcp/limits.ts:1` — "cap on spec/html body payloads". `src/lib/mcp/server.ts:171,219,266,362` apply it to spec, html, markdown, and every `update_artifact` body.
- `src/components/ui/map/map.tsx:460` — "children render only when map is loaded on client". The gate at `:461` is `mapInstance && children`. `setMapInstance` runs at construction (`:376`), before the `load` event sets `isLoaded` (`:363`). The "SSR-safe" half is still true.
- `testing/diagram/invariants.ts:2-3` — "run over synthetic models now and over parsed family fixtures later". The family layout tests import the invariants already (for example `src/lib/diagram/families/class/layout.unit.test.ts:11`).
- `src/lib/artifacts.int.test.ts:3` — cites `artifacts.ts:22-32`. `saveArtifactStateFn` is at `src/lib/artifacts.ts:188`. `:33` says "see test-server.ts". The file is `testing/server.ts`.
- `src/lib/auth-mailerless.int.test.ts:6` and `src/lib/auth.int.test.ts:204` — both pin "better-auth 1.6.25, dist/api/routes/update-user.mjs:449-455". Installed is 1.7.1 (`canUpdateWithoutVerification` at `:455`), and plan 01 moves it to 1.7.6.
- `src/database/schemas/artifact.ts:19-20` — "the lower(title) sort runs unindexed by decision (docs/plans/README.md, ...)". That README was never committed, and the new index does not carry this decision. The #8 diff (`b1a5430`) shows the earlier comment claimed drizzle-kit cannot express `lower()`. Installed drizzle-orm 0.45.2 accepts `SQL` in `index().on()` (`node_modules/drizzle-orm/sqlite-core/indexes.d.ts:11`), so that reason is false.
- `scripts/examples/markdown-notes.ts:4-7` — "Doubles as the live verification fixture for plan 07". That was a pre-#8 plan; the current plan 07 is unrelated. `scripts/dev-publish.ts:22,211-214` publishes it. Lines 5-6 also wrap mid-sentence.

Diagram engine and components (Phase 3):

- Dangling decision IDs: `src/components/diagram/diagram.tsx:5` (C14), `:10` (C31); `src/components/diagram/diagram-context.ts:16` (C29); `src/components/library/demos/diagram.tsx:253` (C29); `src/components/diagram/use-diagram.unit.test.tsx:3` (C27). No C-ID is defined anywhere, and the surrounding prose already states each constraint.
- `src/lib/diagram/build.ts:1-8` — header says "The three public entry points" and "`buildDiagram` also owns option resolution". The module exports `defaultLimits`, `parseDiagram` (`:52`), `layoutDiagram` (`:102`), `resolveLayoutOptions` (`:127`), and `buildDiagram` (`:139`). The app calls `parseDiagram`, `resolveLayoutOptions`, and `layoutDiagram` directly (`src/components/diagram/use-diagram.ts:14,92,101,122`). `buildDiagram` has no non-test caller.
- `src/lib/diagram/types.ts:438` — `ParseResult.ir`: "Null only when no header matched or every statement failed". Also null for: source over `limits.chars` (`build.ts:57-63`); a parser that throws (`build.ts:95-98`); gantt over the task limit (`families/gantt/parse.ts:528-535`); gantt or sequence with zero tasks or participants and any error (`gantt/parse.ts:539-544`, `sequence/parse.ts:537-542`).
- `src/lib/diagram/types.ts:443` — `LayoutOptions`: "`buildDiagram` fills every field". The production path fills it through `resolveLayoutOptions`.
- `src/lib/diagram/core/diagnostics.ts:2` — lists `buildDiagram` with parse and layout. The never-throws claim is true for all three.
- `LayoutResult.scene` (`types.ts:455`) and `DiagramLimits` (`types.ts:51`) already document their contracts. Model new docs on them.

Locked scope notes:

- The count at `README.md:7` is removed, not changed to 29. Plans 34 and 35 add components, and a number drifts.
- No doc comments on `detectFamily`, `describeScene`, `findFamily`, or `defaultLimits`. Their names, return types, and the module headers or `DiagramLimits` docs carry the contract. Only the four `build.ts` functions get docs, because the never-throws and null-signal contract is invisible on hover.

Cross-phase rules (from `CLAUDE.md`): comments only; no identifier, string literal, or test assertion changes. Env vars only via `src/lib/env.ts`. The security invariants (HTML artifacts sandboxed at `/render/:id/:n`, `/mcp` Bearer-only) are unchanged; the README must describe them as they are. Do not start dev servers.

Domain skills the executor must follow:

- `/Users/henry/.claude/skills/code-comments/SKILL.md` — every comment edit gets the "fix" verdict: state the constraint, not history. No line numbers or versions of third-party files in comments. Name the symbol instead.
- `/Users/henry/.claude/skills/writing-style/SKILL.md` — README prose: present tense, 25 words or fewer per sentence, code font for hosts and env vars, no em dashes, no "now" or "currently".

Coordination: plan 05 adds a bullet to the same README "Auth and proxy notes" list, and plan 18 restyles README prose. Plans 03 and 24 edit `build.ts` code. If one of them landed first, rebase the prose onto it. If a symbol named here was removed, drop its doc and report it.

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before you proceed. Report material drift. Do not replan silently.

## Gate

`pnpm gate` (typecheck, lint with fix, fmt, test) closes every phase. CI runs the `:check` variants. If the shell's `node -v` is not 26 (`.node-version`), prefix with `mise exec --`. No test is added or removed, so the test count equals the count from a gate run before the phase.

## How to execute

- One phase per fresh session; the user commits between phases.
- The orchestrator dispatches ONE subagent per phase (`Task` tool, `subagent_type: general-purpose`) with this plan's Context, the phase's Decisions/Scope/Acceptance, and the intent. It verifies with the gate and re-prompts the SAME subagent on failure. It does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for user review.

## Phases

1. Operator docs: README external fetches, rate limiting, component count; `env.ts` `TRUSTED_PROXIES` doc.
2. Stale comment references outside the diagram engine.
3. Diagram engine contract docs and dangling C-IDs.

---

## Phase 1 — Operator docs

**Goal**: the README and `env.ts` state what the app contacts and how rate limiting keys, with no claim the code contradicts.

**Decisions**:

- `README.md:7`: "rendered natively by the component catalog". Keep the parenthetical examples.
- `README.md:137` "External fetches", rewritten as a complete list. Browser-side: `https:` images in any artifact. HTML artifacts can also load fonts from any `https:` host, and scripts and styles from `cdnjs.cloudflare.com` (consistent with `:133`). Map blocks load Carto basemaps from `cartocdn.com` hosts, or with `PROTOMAPS_API_KEY` set, tiles from `api.protomaps.com` and glyphs and sprites from `protomaps.github.io`. Each exposes the viewer's IP and referrer to that host. Server-side: the app calls Resend only when `RESEND_API_KEY` is set. Close with one sentence that no other third-party call is made. This is true once the list is complete.
- `README.md:106`: keep the first two sentences. Replace the "without it" clause: without `TRUSTED_PROXIES`, the app ignores `X-Forwarded-For` and all clients share one rate-limit bucket. One client's failed attempts can then block everyone's sign-in until the window resets.
- `src/lib/env.ts:28`: `/** Comma-separated IPs/CIDRs. Unset ignores X-Forwarded-For: every client shares one rate-limit bucket (see auth.ts). */`. Wrap to the print width.

**Scope**: in: `README.md`, `src/lib/env.ts`. Out: the `README.md:76` table row, which is accurate; the rest of README prose (plan 18).

**Acceptance**:

- `pnpm gate` → exits 0.
- `grep -nE "28-component|best-effort|CARTO basemap tiles" README.md` → no match.
- `grep "External fetches" README.md | grep -o "cartocdn.com\|api.protomaps.com\|protomaps.github.io\|RESEND_API_KEY" | sort -u | wc -l` → `4`.
- `grep -n "verbatim" src/lib/env.ts` → no match.
- `git diff --stat` → only `README.md` and `src/lib/env.ts`.

---

## Phase 2 — Stale comment references

**Goal**: no comment outside the diagram engine points at a wrong line, version, file, or missing document, or misstates when its code runs.

**Decisions**:

- `limits.ts:1`: `/** Shared 1 MB cap on every artifact body (spec, HTML, markdown) submitted through MCP tools. */`.
- `map.tsx:460`: children mount once the MapLibre instance exists, before its style loads. Children that touch sources or layers must gate on `isLoaded` from `useMap`. Keep "SSR-safe". The instance exists only on the client.
- `invariants.ts:2-3`: drop the "now ... later" clause. State that they run over synthetic models and over parsed family fixtures.
- `artifacts.int.test.ts:3`: replace `artifacts.ts:22-32` with "in src/lib/artifacts.ts". `:33`: `test-server.ts` → `testing/server.ts`.
- `auth-mailerless.int.test.ts:6` and `auth.int.test.ts:204`: replace each version and line pin with "(`canUpdateWithoutVerification` in better-auth's `dist/api/routes/update-user.mjs`)".
- `artifact.ts:19-20`: inline the reason: a single-owner gallery holds few enough rows that sorting by `lower(title)` without an index scans a trivial table. If that changes, add the expression index through `pnpm db:generate`. Drop the `docs/plans` pointer. See Open questions.
- `markdown-notes.ts:1-8`: remove the plan 07 sentence. Say that `scripts/dev-publish.ts` publishes it as the end-to-end markdown fixture, and re-wrap lines 5-6.

**Scope**: in: `src/lib/mcp/limits.ts`, `src/components/ui/map/map.tsx`, `testing/diagram/invariants.ts`, `src/lib/artifacts.int.test.ts`, `src/lib/auth-mailerless.int.test.ts`, `src/lib/auth.int.test.ts`, `src/database/schemas/artifact.ts`, `scripts/examples/markdown-notes.ts`. Out: `limits.ts` code and `server.ts` (plan 08). No schema or migration change. Eight files, all comment-only edits.

**Acceptance**:

- `pnpm gate` → exits 0, test count unchanged.
- `git grep -nE "spec/html body|docs/plans|plan 07|test-server\.ts|artifacts\.ts:[0-9]|1\.6\.25|update-user\.mjs:[0-9]" -- src testing scripts` → no match.
- `grep -n "loaded on client" src/components/ui/map/map.tsx` → no match.
- `pnpm db:generate` is not run. `git diff --stat src/database` → only `schemas/artifact.ts`, comment lines only.

---

## Phase 3 — Diagram engine contract docs

**Goal**: the engine's entry points state their never-throws and null-signal contract on hover, and no comment cites an undefined decision ID.

**Decisions**:

- C-IDs: delete `(C14)`, `(C31)`, `(C29)` (twice), and `(C27)`. Keep the surrounding sentences, and fix grammar where the tag removal leaves a gap. Do not touch the `// ---- composability` banner. Plan 17 owns banners.
- `build.ts:1-8` header: drop the count. The module never throws: a family that throws becomes an `internal-error` diagnostic plus a null result. `resolveLayoutOptions` owns option resolution, and `buildDiagram` composes parse, resolve, and layout in one call.
- One-line `/** */` docs, contract only:
  - `parseDiagram`: returns the IR, or null with at least one `error` diagnostic giving the reason.
  - `layoutDiagram`: returns a scene, or null for an unregistered kind or a failed layout.
  - `resolveLayoutOptions`: fills every `LayoutOptions` field from defaults.
  - `buildDiagram`: parse, resolve, and layout in one call, plus the detected family id.
- `types.ts:438`: state the rule, not a list. Null is the fatal signal, and at least one `error` diagnostic carries the reason.
- `types.ts:443`: name `resolveLayoutOptions` as the filler.
- `diagnostics.ts:2`: keep the never-throws sentence and name all four functions.

**Scope**: in: `src/lib/diagram/build.ts`, `src/lib/diagram/types.ts`, `src/lib/diagram/core/diagnostics.ts`, `src/components/diagram/diagram.tsx`, `src/components/diagram/diagram-context.ts`, `src/components/diagram/use-diagram.unit.test.tsx`, `src/components/library/demos/diagram.tsx`. Out: docs on `detectFamily`, `describeScene`, `findFamily`, and `defaultLimits`; engine code (plans 03, 24).

**Acceptance**:

- `pnpm gate` → exits 0, test count unchanged.
- `git grep -nE "\(C[0-9]+\)" -- src testing` → no match.
- `grep -nE "three public entry points|buildDiagram. (also owns|fills)|every statement failed" src/lib/diagram/build.ts src/lib/diagram/types.ts` → no match.
- `grep -B1 -nE "^export (function|const) (parseDiagram|layoutDiagram|resolveLayoutOptions|buildDiagram)" src/lib/diagram/build.ts` → each preceded by a `*/` line.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note the deviation in the final summary. Stop and report instead of improvising when a locked decision turns out to be wrong or impossible, when the work requires touching out-of-scope files, or when acceptance can't be met after a couple of honest attempts. A comment fix that would need a code change to become true is out of scope: report it.

## Done criteria

Machine-checkable; ALL must hold:

- [ ] `pnpm gate` exits 0 after each phase, test count unchanged
- [ ] Every Acceptance grep in Phases 1-3 returns its expected result
- [ ] This plan's diffs touch only the 17 in-scope files named in the phase Scopes (plus `docs/plans/README.md`)
- [ ] `docs/plans/README.md` status row updated

## Open questions

- `artifact.ts:19-20` rationale (Phase 2): the original reason sat in an uncommitted document, and the #8-era reason is false. Recommended default: the small-table reason in Phase 2. Henry confirms at review, or the phase adds the `lower(title)` expression index as a separate plan.
