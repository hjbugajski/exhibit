# Plans

Execute in the order below unless dependencies say otherwise. Executors: read your plan fully before starting and update your row when done.

Produced by a deep audit at commit `ffee99b` (2026-09-26): 15 opus auditors (9 playbook categories + 6 domain-skill sweeps), dedup, two-lens adversarial refutation, then advisor vetting against the code. Plans 34–36 are owner-requested features.

## Execution order & status

| Plan | Title                                                                                                | Effort                | Depends on | Status                                                   |
| ---- | ---------------------------------------------------------------------------------------------------- | --------------------- | ---------- | -------------------------------------------------------- |
| 01   | Drop account.issuer and upgrade Better Auth to 1.7.6                                                 | S                     | —          | DONE (phase 2 folded into the dependency update)         |
| 02   | Close the backslash open redirect on /sign-in                                                        | S                     | —          | DONE                                                     |
| 03   | Bound flowchart edge fan-out and gantt duration work before layout                                   | S                     | —          | DONE                                                     |
| 04   | Honor revoked opaque tokens and session liveness in /mcp auth                                        | S                     | 01         | DONE                                                     |
| 05   | Keep password-reset tokens out of the evlog request log                                              | S                     | —          | DONE                                                     |
| 06   | Interaction-state integrity (stale reseed, save-error reset, uncounted fences, statePath collisions) | M                     | 08         | DONE                                                     |
| 07   | Structural test pinning sessionMiddleware on every server fn                                         | S                     | —          | DONE                                                     |
| 08   | One per-type body validator table for MCP publish/update                                             | S                     | —          | DONE                                                     |
| 09   | Toolchain guardrails (deny warnings, remove db:push, check script, drift gate, process.env lint)     | S                     | —          | DONE                                                     |
| 10   | Catalog value parsing fidelity (pie numbers, chart duplicate labels, gantt ids)                      | S                     | —          | DONE                                                     |
| 11   | Stop paying a session RPC on every client navigation                                                 | M                     | 06, 07     | DONE                                                     |
| 12   | Accessibility pass                                                                                   | M                     | —          | TODO                                                     |
| 13   | Re-resolve map route colours when the theme changes                                                  | S                     | —          | DONE                                                     |
| 14   | Shift artifact content headings one rank below the page title                                        | M                     | —          | TODO                                                     |
| 15   | Sandbox CSP on /download responses                                                                   | S                     | —          | DONE                                                     |
| 16   | Correct docs and comments that contradict the code                                                   | S                     | —          | TODO                                                     |
| 17   | Comment cruft sweep (banners, journal tense, misplaced docs)                                         | S                     | 24         | TODO                                                     |
| 18   | Writing sweep (MCP tool descriptions, catalog copy, errors, README)                                  | M                     | 36         | TODO                                                     |
| 19   | Test hygiene                                                                                         | M                     | —          | TODO                                                     |
| 20   | Memoize markdown parsing and syntax highlighting                                                     | S                     | —          | DONE                                                     |
| 21   | Precompressed assets, lighter detail-route graph, parallel PR CI                                     | S                     | 28         | DONE                                                     |
| 22   | Server-only import protection                                                                        | M                     | 11         | TODO                                                     |
| 23   | Repository liveness and atomic update_artifact                                                       | M                     | 07, 08     | DONE                                                     |
| 24   | Diagram engine debt (vestigial extension points, ALLOWED_FAMILIES, parser statement loop)            | M                     | —          | DONE                                                     |
| 25   | House component API consistency                                                                      | M                     | 12         | TODO                                                     |
| 26   | Make pnpm seed read .env; fix dev-publish run line                                                   | S                     | —          | DONE                                                     |
| 27   | Replace latest-value refs with useEffectEvent                                                        | M                     | 13         | DONE                                                     |
| 28   | Replace the nitro-nightly alias with the canonical nitro beta                                        | S                     | —          | DONE                                                     |
| 29   | Minor UX polish (whitespace titles, RelativeTime hydration, reset confirmation)                      | S                     | 02         | DONE                                                     |
| 30   | Investigate: layout golden value; sign-in navigate after OAuth resume                                | S                     | —          | IN PROGRESS (phase 1 done; phase 2 awaits browser check) |
| 31   | Direction: owner-response inbox for Claude (stateUpdatedAt sort/filter)                              | S                     | —          | DONE                                                     |
| 32   | Direction spike: search beyond titles                                                                | M                     | —          | TODO                                                     |
| 33   | Direction spike: opt-in revocable share links                                                        | M (spike; L if built) | —          | DONE (spike; verdict BUILD, owner decisions pending)     |
| 34   | Weather catalog component (static and live)                                                          | M                     | —          | DONE                                                     |
| 35   | Trail catalog component for hikes                                                                    | M                     | —          | DONE                                                     |
| 36   | Itinerary improvements                                                                               | M                     | 34, 35     | TODO                                                     |

Status values: TODO | IN PROGRESS (phase N/M) | DONE | BLOCKED (one-line reason) | REJECTED (one-line rationale).

## Dependency notes

- 01 before any Better Auth bump anywhere: 1.7.3+ validates the schema at boot and rejects every auth call while `account.issuer` exists.
- 04 requires 01: token claim names are re-verified against the installed 1.7.6.
- 06 requires 08: 08 builds the per-type body validator table; 06 Phase 4 plugs the markdown statePath collision check into it rather than adding a second markdown branch.
- 18 requires 36: 36 rewrites the Itinerary, Day and Stop descriptions; the writing sweep runs over the final copy.
- 29 requires 02: both edit `validateSearch` in `src/routes/sign-in.tsx` and `sign-in-view.tsx`; 29 merges onto 02's helper.
- 11 requires 06 and 07: both touch loader caching; 07 guards the server-fn boundary 11 relies on.
- 17 requires 24: both edit the diagram parser files; sweep after the hoist to avoid churn.
- 21 requires 28: the nitro package swap may change config typing.
- 22 requires 11: 11 restructures the session modules 22 marks server-only.
- 23 requires 07 and 08: 07 pins the auth boundary; 08 owns the MCP update path 23 makes atomic.
- 25 requires 12: shared files (button, spinner).
- 27 requires 13: both touch ui/map/route.tsx.
- 36 requires 34 and 35: Day accepts a Weather child; Stop gains kind "hike" alongside Trail. 36 also owns the Day-map layout-shift root fix that plan 29 hands over.

## Cross-plan notes

- `get_catalog` budget (`src/lib/mcp/catalog-summary.unit.test.ts`, `< 4000` tokens, 13 tokens of headroom at `ffee99b`): plans 34, 35 and 36 share one rule — measure after each catalog change and, if the test fails, set the ceiling to the measured `text.length / 4` rounded up to the next 100, updating the "~4k" wording in `catalog-summary.ts`. Plan 18 measures at its own start and must not grow the payload. Plan order therefore does not matter for the budget.
- Plan 24 Phase 2 pulls the diagram families into the `catalog.ts` and MCP module graph; check against plan 22's server-only markers if 22 has landed.
- Plan 15 and plan 22 both touch `src/routes/download.$id.$n.ts` on different lines; trivial merge.

## Considered and rejected

- Per-row body parse for gallery answer counts (PERF-04): deliberate, bounded by the 200 KB cap in `src/database/repository.ts`; only the gallery opts in.
- Lazy-loading the diagram engine (PERF-07): deliberately eager since #11 (`src/components/catalog/mermaid.tsx` header comment).
- Console-output assertions in tests (TESTS-05): deliberate in #14; they fail loudly when a mock swallows an unexpected log.
- Deleting "restating" comments at map.tsx:439, identicon.tsx:57, layout-graph.ts:1516 (COM-08): they carry rationale.
- Splitting `layoutSequence` (737 lines) and `assemble` (515 lines) into phase functions (ARCH-07): L effort; interfaces are fine and goldens pin behaviour. Revisit if a change lands in either.
- Extracting the autosave and URL-query-sync protocols into hooks (ARCH-08): already tested; readability only.
- Disabled-client check for opaque tokens (part of SEC-01): revocation deletes the client row and cascades to its tokens.
- Control-character redirect targets (part of SEC-02): the router percent-encodes them; same-origin.
- Verify-only defensive claims: `/download` inline rendering (SEC-04) is hardening, not an exploit; kept as plan 15 because it is cheap.
