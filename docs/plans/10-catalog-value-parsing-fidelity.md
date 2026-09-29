# Plan 10 — Reject or warn on silently truncated values: pie numbers, chart duplicate labels, gantt id collisions

Makes three input paths stop dropping or merging author data without notice: pie slice values with trailing text (`1,250`, `1e3`, `45%`), Chart points that share a label, and gantt fallback task ids that collide with declared ids. It does not change the shared `NUMBER` token, the Chart schema, or any other diagram family.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none. Plans 03 (`durationOf`) and 24 (parser loops) also edit `pie/parse.ts` or `gantt/parse.ts` in other regions; line numbers can drift if they land first.

## Why this matters

`"Revenue" : 1,250` and `"Costs" : 1e3` both parse as 1 with zero diagnostics, so a plausible-looking pie hides wrong proportions. A Chart with `Q1..Q4` over two years plots the second `Q1` on the first one's slot, so bars overlap and the sr-only table disagrees with the picture. A gantt task declared `task-0` next to an undeclared task gets the same id, so `after task-0` resolves to the wrong row.

## Context

- `src/lib/diagram/families/pie/parse.ts:105-141` — `slice()`. `readNumber` at :122, push at :140 with no check of the remaining text. `header()` at :37-61 is the exemplar for leftover text: it calls `readRestOfLine` and `draft.report.warn('unknown-statement', \`Ignored '${rest}' after the pie header.\`, …)` (:53-60).
- `src/lib/diagram/core/lex/tokens.ts:9` — `NUMBER` has no exponent and no digit grouping. It is shared by every family; this plan does not change it (Mermaid rejects these inputs too). `readRestOfLine` (:98-104) returns trimmed text. `%%` comments are stripped before parse (`stripComment`, `core/lex/lines.ts:73`), so a trailing comment is not leftover text.
- `src/components/catalog/chart-inner.tsx:70-111` — cartesian marks use `x: 'label'` with `scaleBand<string>()` (:82) or `scalePoint<string>()` (:72). The scale domain comes from `uniqueDomain` in `@tanstack/charts-scales` (`node_modules/@tanstack/charts-scales/dist/intern.js:4-12`), which drops repeated values. The tooltip title already reads `point.datum.label` (:59). Donut `color`/`key` are `slice.data.label` (:135-136).
- `@tanstack/charts` 0.14 types (`node_modules/@tanstack/charts/dist/types.d.ts`): a channel may be an accessor `(datum, { index, data }) => value` (:48-56); `ChannelAccessorContext` is exported from the package root. Axis tick text is `axis: { ticks: { format } }` (`ChartAxisTickOptions.format` :175, `ChartAxisOptions.axis` :241). `radialArc` `color`/`key` accept a `ChartKey` (string or number).
- `src/catalog/catalog.ts:462-486` — Chart props; the `data` array is :469-480. No schema change: repeated labels such as `Q1` across two years are legitimate (advisor decision, locked).
- `src/lib/diagram/families/gantt/parse.ts:278-299` — `idFor`. The fallback `task-${draft.tasks.length}` (:280) is returned for a missing id (:282-284) and for a duplicate id (:286-293) and is never checked against or added to `draft.ids` (declared at :82, initialized at :500). Only declared ids enter the set (:296). Caller at :412.
- Collision consumers: `gantt/layout.ts:163` (`byId.set(task.id, entry)` overwrites, so `after` resolves to the last registrant); `src/components/diagram/gantt-parts.tsx:149,220` (`key={task.id}`).
- Test exemplars: `pie/parse.unit.test.ts:32` (`codes()` helper) and :109-114 (severity match); `gantt/parse.unit.test.ts:220-225` (duplicate id renamed to `task-1`) and :149 (`['task-0', 'b']`); `chart-inner.unit.test.tsx:31-52` (happy-dom render, SVG primitive counts, console spy).

Cross-phase rules (from `CLAUDE.md`):

- Kebab-case filenames, no barrels. Tests are colocated as `*.unit.test.ts(x)`; component tests use happy-dom via the `// @vitest-environment happy-dom` pragma.
- `src/lib/diagram` is a standalone core: parse and build never throw to the caller; failures are diagnostic values. Diagnostic messages state facts, never imperatives.

Skills the executor must follow: `/Users/henry/.claude/skills/tdd/SKILL.md` (red before green, one vertical slice per case; the seams are the Acceptance tests below), `/Users/henry/.claude/skills/code-comments/SKILL.md` (every comment touched, including the `idFor` doc comment at `gantt/parse.ts:278`, which must state the new uniqueness contract).

## Gate

`pnpm gate` (typecheck && lint --fix && fmt && test) closes every phase. CI runs the `:check` variants (`pnpm typecheck`, `pnpm lint:check`, `pnpm fmt:check`, `pnpm test`). If `node -v` is not 26, prefix with `mise exec --`.

## How to execute

- One phase per fresh session. The user commits between phases.
- The orchestrator dispatches ONE subagent per phase (`Task`, `subagent_type: general-purpose`) with this plan's Context plus the phase block. It verifies with the gate and re-prompts the same subagent on failure. It does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for review.

## Phases

1. Diagram engine: pie leftover-text warning; unique gantt fallback ids in both collision directions.
2. Catalog Chart: index-keyed x domain with label ticks; index-keyed donut color and key.

---

## Phase 1 — Pie leftover text and gantt id uniqueness

**Goal**: A pie slice with text after its number keeps the parsed value and emits one warning naming the ignored text. Every gantt task id in the IR is unique, whatever ids the author declares.

**Decisions**:

- Pie: in `slice()`, after `readNumber` succeeds, read the rest of the line with `readRestOfLine`. If non-empty, `draft.report.warn('trailing-text', \`Ignored '${rest}' after the value of slice '${text(label)}'.\`, line.span)`. Warn, never throw: a throw drops the slice, and `45%` already has the right value. The slice is still pushed (or dropped by the negative check, which keeps priority; the warning is emitted before that check so both diagnostics appear).
- Gantt: every id `idFor` returns enters `draft.ids`. Fallbacks come from one private helper that starts at `task-${draft.tasks.length}` and increments the suffix until `draft.ids` does not contain it. Both return paths (missing id, duplicate id) use it. This keeps every generated id identical to today for charts without a collision.
- Direction A (declared id equals an earlier fallback): the declared id hits the existing duplicate path and gets a fresh fallback with the existing `duplicate-task-id` warning. Direction B (earlier declared id equals the next fallback): the fallback skips to the next free suffix silently, because the author did nothing wrong.
- `layout.ts` and `gantt-parts.tsx` need no change once ids are unique.

**Scope**: in — `src/lib/diagram/families/pie/parse.ts`, `pie/parse.unit.test.ts`, `src/lib/diagram/families/gantt/parse.ts`, `gantt/parse.unit.test.ts`. Out — `core/lex/tokens.ts` (shared by all families; exponent support is a separate decision), gantt layout and rendering.

**Acceptance**:

- `pnpm test src/lib/diagram/families/pie src/lib/diagram/families/gantt` → green, including:
- `pie/parse.unit.test.ts`:
  - `"Revenue" : 1,250` → slice value 1, one `warning` with code `trailing-text` whose message contains `,250`.
  - `"Costs" : 1e3` → value 1, one `trailing-text` warning containing `e3`.
  - `"Tax" : 45%` → value 45, one `trailing-text` warning.
  - `"A" : 42   ` (trailing spaces) and `"A" : 42 %% note` → no diagnostics.
- `gantt/parse.unit.test.ts`:
  - `First : 2024-01-01, 2d` then `Second : task-0, 2024-01-05, 1d` → ids unique (`['task-0', 'task-1']`), one `duplicate-task-id` warning.
  - `First : task-1, 2024-01-01, 2d` then `Second : 2024-01-05, 1d` → ids `['task-1', 'task-2']`, no diagnostics.
  - `A : task-1, 2024-01-01, 1d` then `B : task-1, 2024-01-02, 1d` → ids `['task-1', 'task-2']`, one `duplicate-task-id` warning (the duplicate-path fallback skips the taken suffix).
- Existing cases `gantt/parse.unit.test.ts:149` and :220-225 and the pie/gantt snapshot tests stay green unchanged.

---

## Phase 2 — Chart points keyed by index

**Goal**: Every Chart point draws in its own x slot and every donut slice gets its own key and color, even when labels repeat. Charts with unique labels render exactly as today.

**Decisions**:

- Cartesian marks: replace `x: 'label'` with an accessor returning the datum's index (`(_, { index }) => index`, typed with `ChannelAccessorContext<Point>`). Scales become `scaleBand<number>()` and `scalePoint<number>()`.
- Both x configs set `axis: { ticks: { format: (index) => data[index]?.label ?? '' } }` so the axis still shows labels.
- Donut: `color` and `key` return `slice.index` (d3 `PieArcDatum.index`). The ordinal color domain follows first appearance, which equals index order for unique labels, so colors do not change for existing charts.
- No duplicate-label warning and no schema rejection. The sr-only table (:190-206) already keys rows by label plus index; leave it.
- Update the comment at :71 ("Categories sit on a point scale…") to state why x is the index: repeated labels must not share a slot.

**Scope**: in — `src/components/catalog/chart-inner.tsx`, `chart-inner.unit.test.tsx`. Out — `src/catalog/catalog.ts` (no schema change), `chart.tsx`, styles.

**Acceptance**:

- `pnpm test src/components/catalog/chart-inner` → green, including new cases in `chart-inner.unit.test.tsx` with data `Q1,Q2,Q1,Q2` (values 1-4):
  - `bar` → four `svg rect` bars with four distinct `x` positions (red today: two slots).
  - `line` → renders without console errors; the axis text contains `Q1` twice.
  - `donut` → four arc paths with four distinct `fill` values (red today: two colors).
- The existing cases at :14-72 stay green unchanged.
- Manual smoke (user): open `/dev/library`, confirm the Chart demos render with the same labels and colors as before.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note the deviation in the final summary. Stop and report instead of improvising when a locked decision turns out to be wrong or impossible, when the work needs files outside scope, or when acceptance cannot be met after a couple of honest attempts. If `@tanstack/charts` 0.14 does not render `ticks.format` output for a band or point scale, stop and report; do not fall back to schema rejection.

## Done criteria

- [ ] `pnpm gate` exits 0.
- [ ] `grep -n "trailing-text" src/lib/diagram/families/pie/parse.ts` → one match.
- [ ] `grep -n "x: 'label'" src/components/catalog/chart-inner.tsx` → no matches.
- [ ] `grep -n "slice.data.label" src/components/catalog/chart-inner.tsx` → no matches.
- [ ] `docs/plans/README.md` status row updated.

## Open questions

- Phase 1: `1,250` keeps value 1 with a warning, so the pie still draws the wrong proportion. Recommended default: keep it (advisor decision; matches `header()` and Mermaid rejects the input anyway). Alternative: drop the slice when the leftover starts with `,` or `e`, which trades a visible wrong slice for a missing one.
