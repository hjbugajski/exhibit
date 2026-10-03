# Plan 03 — Bound flowchart edge fan-out and gantt duration work before layout

Stops two parser paths in the in-house diagram engine from doing unbounded work on short sources: flowchart `&` groups that fan out into millions of edges before any limit is checked, and gantt durations that are non-finite or that walk the calendar one day at a time. It does not change any limit value, the layout engine, other families, or the Mermaid schema caps.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none

## Why this matters

`DiagramLimits.edges` (800) is first checked in `layoutGraph`, after the parser has already materialized the IR. A 9,816-char `a&a&…&a --> b&b&…&b` (2,450 per side) is inside the Mermaid block's 10k cap (`MERMAID_MAX_CHARS`, `src/components/catalog/mermaid-schema.ts:8`) and builds 6.0M edges (about 2.2 GB heap, 1.9 s) before it is rejected. A markdown ` ```mermaid ` fence has only the 20k-char engine cap, so the fan-out is larger. In gantt, `A : 2024-01-01, 1000000000000d` under `excludes weekends` loops once per day for hours, and a 310-digit duration makes `ms` Infinity, which draws a NaN scene. The pipeline runs in `useMemo` during render, so any of these freezes the owner's tab. After this plan, each case returns a named error diagnostic in bounded time.

## Context

- `src/lib/diagram/build.ts:28-34` — `defaultLimits` (`edges: 800`). `parseDiagram` merges limits at :55 and passes `{ report, limits }` to `family.parse` at :92. `src/components/diagram/use-diagram.ts:91-92` calls `parseDiagram` with the same overrides as layout (:99-108). Limits already reach every parser through `ParseContext.limits` (`src/lib/diagram/types.ts:423-427`). Nothing new has to be threaded: `FlowchartParser` receives `ctx` and ignores `ctx.limits` (`src/lib/diagram/families/flowchart/parse.ts:283-286`).
- `src/lib/diagram/types.ts:51` — `DiagramLimits` contract: "Exceeding one is an `error` diagnostic plus a null scene, never a partial draw."
- Parse-time limit exemplar: `src/lib/diagram/families/gantt/parse.ts:528-535` (and sequence `parse.ts:514-521`). It calls `report.error('too-many-nodes', …, line.span)` and returns `{ ir: null, diagnostics }` at once.
- Layout-time checks that stay: `src/lib/diagram/core/graph/layout-graph.ts:166` (`too-many-nodes`), `:175` (`too-many-edges`), `:198` (`cluster-depth-exceeded`, recursive mode only).
- `src/lib/diagram/core/diagnostics.ts:58-85` — `StatementError` abandons one line and the driver reports it and continues. `reportStatementError` uses `cause.span ?? line.span`, so a thrower with no span gets the line's span.
- Flowchart fan-out: `flowStatement` at `parse.ts:583-626`. The cartesian loop at :616-620 pushes one `PendingEdge` per pair. `commit` at :753-797 materializes them. `statement` at :386-425 catches every throw from `flowStatement` and continues, so `StatementError` cannot stop the parse.
- `src/lib/diagram/families/flowchart/to-graph.ts:19-37` — `membersOf` re-spreads the ancestor's array per member (:31), which is quadratic in members times nesting depth.
- Gantt: `durationOf` at `src/lib/diagram/families/gantt/parse.ts:216-230` accepts any digit run (`DURATION` :52). Its only caller is `endOf` at :266-276, which is reached from `taskStatement` (:305-420) inside the driver try/catch at :522-526. `addDuration` at `src/lib/diagram/families/gantt/time.ts:382-400` loops once per day. `skipExcluded` (:362-374) moves a weekend instant to the next day's 00:00. Callers: `layout.ts:155,157`. The NaN arises at `layout.ts:253-256` (`stepFor` :171-181, `alignDown` :183-185).
- Test exemplars: `flowchart/parse.unit.test.ts:15-23` (`parse` helper with `defaultLimits`), `gantt/parse.unit.test.ts:18-22`, `gantt/layout.unit.test.ts:90-103` (weekend cases). No test covers `time.ts` directly.

Cross-phase rules (from `CLAUDE.md`):

- Kebab-case filenames, no barrels. Tests are colocated as `*.unit.test.ts`.
- `src/lib/diagram` is a standalone core. It has no runtime dependency and never reads a clock (`time.ts:1-17`). Parse and build never throw to the caller. Failures are diagnostic values.
- Diagnostic messages state facts ("Flowchart has more than 800 edges."). They are never imperatives.

Skills the executor must follow: `/Users/henry/.claude/skills/tdd/SKILL.md` (red before green, one vertical slice per case, seams = the Acceptance tests below), `/Users/henry/.claude/skills/code-comments/SKILL.md` (applies to every comment touched, including the `addDuration` doc comment at `time.ts:376-381`, which becomes stale).

## Gate

`pnpm gate` (typecheck && lint --fix && fmt && test) closes every phase. CI runs the `:check` variants (`pnpm typecheck`, `pnpm lint:check`, `pnpm fmt:check`, `pnpm test`). If `node -v` is not 26, prefix with `mise exec --`.

## How to execute

- One phase per fresh session. The user commits between phases.
- The orchestrator dispatches ONE subagent per phase (`Task`, `subagent_type: general-purpose`) with this plan's Context plus the phase block. It verifies with the gate and re-prompts the same subagent on failure. It does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for review.

## Phases

1. Flowchart: stop the parse at the edge limit; make `membersOf` linear.
2. Gantt: cap duration magnitude; make weekend-skipping `addDuration` O(1) in days with exact parity.

---

## Phase 1 — Flowchart edge bound at parse time

**Goal**: A flowchart whose edges would exceed `limits.edges` stops parsing on that line with one `too-many-edges` error and a null IR. It never allocates more than `limits.edges` pending edges.

**Decisions**:

- `FlowchartParser` stores `ctx.limits` (constructor, `parse.ts:283`).
- In `flowStatement`, before the cartesian loop at :616, check `this.edges.length + pending.edges.length + group.length * next.length > this.limits.edges`. It covers chains and accumulation across lines.
- On overflow, call `this.report.error('too-many-edges', \`Flowchart has more than ${limits.edges} edges.\`, line.span)`and abort the whole parse.`run()`stops reading statements and returns`null`at once, with no unclosed-subgraph warnings after it. This mirrors`gantt/parse.ts:528-535`. Do not use `StatementError`: `statement`(:415-424) catches it and continues, which gives a partial draw and breaks the`DiagramLimits`contract. Default abort mechanism: a private flag the`run` loop checks after each statement.
- `to-graph.ts:31`: append in place (`get` and push, or `set` a new `[node.id]`). Declaration order stays the same. Do not add a parse-time `clusterDepth` check: flat cluster mode (`layout-graph.ts:196`) accepts any depth today, so the check would reject diagrams that render now.
- The layout-time checks in `layout-graph.ts` stay as defense in depth.

**Scope**: in — `src/lib/diagram/families/flowchart/parse.ts`, `parse.unit.test.ts`, `to-graph.ts`. Out — the node cap at parse time (node count is linear in source length), other families, limit values.

**Acceptance**:

- `pnpm test src/lib/diagram/families/flowchart` → green, including the new cases below.
- Tests to add in `flowchart/parse.unit.test.ts`, which call `parseFlowchart` directly with custom limits and never build a large graph:
  - `a & b & c --> d & e` with `edges: 5` → exactly one `too-many-edges` error on that line; `ir === null`.
  - Two lines of 3 edges each with `edges: 5` → the error carries the second line's span; `ir === null`.
  - Exactly `edges` edges (5 with `edges: 5`) → parses with no error.
  - 100 `&`-joined ids per side at `defaultLimits` → the error code is `too-many-edges` (fails red today because the parser returns an IR).
- `grep -n "\[\.\.\.(members.get" src/lib/diagram/families/flowchart/to-graph.ts` → no matches. The existing `to-graph.unit.test.ts` subgraph cases (:81-157) stay green unchanged.

---

## Phase 2 — Gantt duration ceiling and O(1) weekend skipping

**Goal**: An absurd or non-finite duration is a `duration-too-large` statement error. `addDuration` with `excludeWeekends` does bounded work for any `days` and returns results identical to today's loop.

**Decisions**:

- `gantt/parse.ts`: add a module constant `MAX_DURATION_MS = 10_000 * 366 * MS_PER_DAY` (at least 10,000 years in every unit, generous enough never to reject a real chart). In `durationOf`, when `ms > MAX_DURATION_MS` (this also catches `Infinity`), throw `new StatementError('duration-too-large', \`Duration '${field}' is longer than 10,000 years.\`)`with no span, so the driver uses the line's span. The task line is dropped and other lines still render, which follows the family's one-diagnostic-per-bad-line contract. This is not a`DiagramLimits` field.
- `time.ts` `addDuration`: keep the signature and the sub-day / no-exclusion fast path (:387-389). For whole days with exclusions, the result must be bit-identical to the current loop for every input. Trap: the loop keeps the start's time of day until its first weekend snap, and 5 counted days equal exactly 7 calendar days only from a 00:00 Tuesday–Saturday instant (a Monday or Sunday 00:00 start is aperiodic for the first week). Walk day by day until such a state is reached or `remaining` runs out (at most about 7 iterations). Then jump `Math.floor(remaining / 5)` weeks as `7 * MS_PER_DAY` each and walk the remainder of at most 4 days. Rewrite the doc comment (:376-381) to state the contract (weekend days are stepped over, cost is independent of length) and not the old per-day walk.
- The layout NaN path needs no change: with the ceiling, 400 chained tasks stay finite.

**Scope**: in — `src/lib/diagram/families/gantt/parse.ts`, `parse.unit.test.ts`, `time.ts`, new `time.unit.test.ts`. Out — `layout.ts`, date parsing, the `until` construct.

**Acceptance**:

- `pnpm test src/lib/diagram/families/gantt` → green.
- `gantt/parse.unit.test.ts`:
  - `A : 2024-01-01, 1` followed by 400 zeros and `d` → `error:duration-too-large`; the task is absent.
  - `3660001d` → the same error.
  - `3650000d` → parses with no error.
- New `gantt/time.unit.test.ts`:
  - Parity with a reference copy of today's loop, kept in the test as the oracle. Cover start days Monday–Sunday of the week of 2024-03-04, at 00:00 and 13:30, for `days` 0–40, with `excludeWeekends` true.
  - Worked example: `addDuration(Mon 2024-03-04 00:00, 5_000_000 days)` → start + 6,999,998 days (checked against the current implementation at planning time). The case must finish in milliseconds.
- The existing weekend cases (`layout.unit.test.ts:90-103`, `parse.unit.test.ts:123`) stay green unchanged.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note the deviation in the final summary. Stop and report instead of improvising when a locked decision turns out to be wrong or impossible, when the work needs files outside scope, or when acceptance cannot be met after a couple of honest attempts. If the O(1) `addDuration` cannot match the oracle for every covered input, stop and report the failing input. Do not change the oracle or weaken parity.

## Done criteria

- [ ] `pnpm gate` exits 0.
- [ ] `grep -n "limits" src/lib/diagram/families/flowchart/parse.ts` → at least one match.
- [ ] `grep -n "duration-too-large" src/lib/diagram/families/gantt/parse.ts` → one match.
- [ ] `pnpm test src/lib/diagram/families/gantt/time.unit.test.ts` → the 5,000,000-day case passes, and the file reports under 1 s.
- [ ] `docs/plans/README.md` status row updated.

## Open questions

- Phase 1: the parse check counts IR edges. `toGraphModel` can later drop edges into empty subgraphs, so a source with more than 800 IR edges but at most 800 drawable edges now fails when it passed before. Recommended default: accept this. Such a diagram is at the limit already, and the error names the cap.
