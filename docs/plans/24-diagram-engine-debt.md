# Plan 24 — Delete vestigial diagram extension points, derive ALLOWED_FAMILIES, hoist the shared parser statement loop

Removes three unused diagram extension points (`HouseDiagram` `fallback`, `Diagram.Svg` `views`, `familyViews`), derives the advertised Mermaid family list from `builtinFamilies`, and replaces the seven copies of the parser statement loop and the one-line `accTitle`/`accDescr` readers with one shared driver. It does not add families, change layout, change any rendered output, or change any golden snapshot. The one intended behavior change: flowchart one-line `accTitle`/`accDescr` values now collapse internal whitespace like every other family.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none. Plans 03 (flowchart and gantt `parse.ts`), 10 (pie and gantt `parse.ts`) and 16 (`diagram.tsx` header) edit nearby lines, so line numbers can drift. Plan 17 runs after this one.

## Why this matters

The extension points have no caller and no test. `fallback` is left over from the dual-engine Mermaid path retired in dcdaf87, and its prose misleads readers about how a failed diagram degrades. `familyViews` duplicates the scene-kind lookup entry for entry, and its documented registration (`familyViews.myFamily = MyView`) does not typecheck on a `Readonly` map. `ALLOWED_FAMILIES` is a hand-typed string that must track `builtinFamilies`, retyped in two demos and one doc comment. The parser loop is about 20 lines copied into seven families, and the one-line acc readers have drifted into two whitespace rules. Each new family (detect.ts defers ten) copies the loop again.

## Context

- `src/components/diagram/house-diagram.tsx` — the app binding. `fallback` prop at :73-74, destructured at :89, early return at :96-100, header prose at :8-11. The `Fallback` component (:48-60) is the source-on-screen degrade and stays.
- `src/components/diagram/diagram.tsx` — `DiagramSvgProps.views` at :306-309, `Svg` at :315, view resolution at :344-346, imports at :46-47.
- `src/components/diagram/family-views.ts` — `familyViews` (:19-25) equals `BY_KIND` (:27-32) for every family; class and ER already resolve by kind. Only importer: `diagram.tsx`.
- `src/components/diagram/extraction-seam.unit.test.ts` — every non-test file in the folder except `house-diagram.tsx` must not import `@/components/*`; requires more than 5 library files (14 remain after deleting `family-views.ts`). It enforces import direction only; it does not reference `views` or `familyViews`.
- `src/components/catalog/mermaid.tsx:4-14` — doc comment enumerates the families (:5-6) and relies on "no `fallback` passed" (:11-12). Sole production caller of `HouseDiagram` (:16).
- `src/components/catalog/mermaid-schema.ts` — `MERMAID_MAX_CHARS` (:8), `ALLOWED_FAMILIES` (:15). Importers: `src/catalog/catalog.ts:21` (used :490, :492), `src/lib/mcp/server.ts:6` (used :255). `server.ts` already imports `@/catalog/validate` (:5).
- `src/lib/diagram/family.ts:16-24` — `builtinFamilies`. Ids (each `families/*/family.ts`): `flowchart`, `sequence`, `state`, `class`, `er`, `pie`, `gantt`.
- Retyped family lists: `src/components/library/demos/catalog-mermaid.tsx:62`, `src/components/library/demos/diagram.tsx:776`.
- Parser loop copies (block check, `readDescriptionBlock`, `continue`, try/`statement`/catch `reportStatementError`): class/parse.ts:547-565, er/parse.ts:376-394, state/parse.ts:499-517 (block skipped while `draft.pendingNote` is open, :501), pie/parse.ts:158-176, sequence/parse.ts:495-523 and gantt/parse.ts:509-537 (both end the parse on a node limit checked after every statement, thrown or not), flowchart/parse.ts:299-312 (no try; its `statement` catches internally at :415-424 and counts `this.failures`, read at :324). All paths under `src/lib/diagram/families/`.
- One-line acc readers. `accStatement` (skipSpace, eat `:`, `readRestOfLine`, collapse whitespace): class :299-310, er :269-280, state :297-308, sequence :317-328, gantt :203-214. Pie inline at :86-100. Local `text()` (trim plus collapse): sequence :90-92, gantt :93-95, pie :32-34, each also used for titles and labels. Flowchart regexes `ACC_TITLE`/`ACC_DESCR_LINE` (:243-244) apply `.trim()` only (:480, :488).
- `readRestOfLine` already trims (`src/lib/diagram/core/lex/tokens.ts:98-104`), so the class/er/state rule equals `text()`. Only flowchart differs. Sequence and gantt lowercase the keyword because their keyword regexes are case-insensitive (sequence :32, gantt :44). That casing is family grammar and stays.
- `src/lib/diagram/core/lex/acc.ts` — `ACC_DESCR_BLOCK` (:13), `readDescriptionBlock` (:25-63); header (:4-7) says the outer loop must consume the block. `src/lib/diagram/core/diagnostics.ts:74-85` — `reportStatementError`.
- `src/lib/diagram/extraction-seam.unit.test.ts` — the core uses relative `.ts` imports only; no `@/`, no React, no runtime dependency.
- Goldens: `src/lib/diagram/families/*/__snapshots__/`. Fuzz: `src/lib/diagram/fuzz.unit.test.ts`.

Deviations from the audit brief: there are two normalization rules, not three. The shared driver does not recognize one-line `accTitle`/`accDescr` keywords, because keyword casing differs by family grammar and state's open note must see those lines as note text. The driver owns the loop; one shared `readAccText` owns the one-line value rule.

Cross-phase rules (from `CLAUDE.md`):

- Kebab-case filenames, no barrels, tests colocated as `*.unit.test.ts(x)`.
- `src/lib/diagram` is a standalone core: relative imports with `.ts` extensions, never `@/`. Parse never throws to its caller; failures are diagnostic values.
- `src/components/diagram` except `house-diagram.tsx` imports nothing under `@/components`.

Skill the executor must follow: `/Users/henry/.claude/skills/code-comments/SKILL.md`. It applies to every comment touched: the headers of `house-diagram.tsx`, `mermaid.tsx`, `mermaid-schema.ts` and `acc.ts`, the `Svg` doc and the view-resolution comment in `diagram.tsx`, and each new export's doc comment (contract, not implementation).

## Gate

`pnpm gate` (typecheck && lint --fix && fmt && test) closes every phase. CI runs the `:check` variants (`pnpm typecheck`, `pnpm lint:check`, `pnpm fmt:check`, `pnpm test`). If `node -v` does not match `.node-version` (26), prefix with `mise exec --`.

## How to execute

- One phase per fresh session. The user commits between phases.
- The orchestrator dispatches ONE subagent per phase (`Task`, `subagent_type: general-purpose`) with this plan's Context plus the phase block. It verifies with the gate and re-prompts the same subagent on failure. It does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for review.

## Phases

1. Delete `fallback`, `views` and `familyViews`; inline the kind-to-view map.
2. Derive `ALLOWED_FAMILIES` from `builtinFamilies`; move the module to `src/catalog`.
3. Add the shared statement driver and value normalizers; migrate class, er, state.
4. Migrate sequence, gantt, pie, flowchart; flowchart acc values collapse whitespace.

---

## Phase 1 — Delete the vestigial extension points

**Goal**: No `fallback` prop, no `views` prop, no `family-views.ts`. Every diagram renders the same view it renders today.

**Decisions**:

- `HouseDiagram`: delete the `fallback` field, its destructure and the early return. Rewrite the header (:6-11) to keep the degrade rationale and the `@layer diagram.house` note and drop the "caller with another engine" sentence.
- `diagram.tsx`: `export type DiagramSvgProps = ComponentProps<'svg'>`. Replace `resolveFamilyView` with a module constant `VIEW_BY_KIND: Readonly<Record<Scene['kind'], ComponentType<{ scene: Scene }>>>` holding the four views. `createElement(VIEW_BY_KIND[scene.kind], { scene })`. Keep the `children` override. Keep the no-remount comment (:344-345), reworded to say the entry is a module constant per scene kind.
- Delete `family-views.ts` and the `DiagramFamilyView` type. No re-export, no alias.
- `mermaid.tsx` doc comment: drop the "no `fallback` passed" clause and replace the enumerated family list with a reference to `builtinFamilies`. Phase 2 does not touch this file.

**Scope**: in — `house-diagram.tsx`, `diagram.tsx`, `family-views.ts` (deleted), `src/components/catalog/mermaid.tsx`. Out — `Fallback` component and `fallbackClassName` (the live source degrade), demos (they use neither prop).

**Acceptance**:

- `grep -rn "familyViews\|resolveFamilyView\|DiagramFamilyView\|family-views" src` → no matches.
- `grep -n "fallback?:\|fallback &&\|views?:" src/components/diagram/house-diagram.tsx src/components/diagram/diagram.tsx` → no matches.
- `pnpm test src/components/diagram src/components/catalog` → green unchanged, including `extraction-seam.unit.test.ts`. No test is added: the deletion changes no behavior.

---

## Phase 2 — Derive ALLOWED_FAMILIES

**Goal**: The family list Claude sees in the Mermaid catalog entry and the `publish_markdown` tool description comes from `builtinFamilies`. Today's output is byte-identical: `flowchart, sequence, state, class, ER, pie and gantt`.

**Decisions**:

- `git mv src/components/catalog/mermaid-schema.ts src/catalog/mermaid-schema.ts`. Update both importers to `@/catalog/mermaid-schema`. This removes the `src/lib/mcp` → `src/components` import.
- Display names are a local `FAMILY_LABELS: Readonly<Record<string, string>> = { er: 'ER' }`; other ids print as-is. Do not add `label` to `DiagramFamily`: display copy is app vocabulary, and the core contract stays untouched.
- Format: labels in `builtinFamilies` order, joined with `, ` and `and` before the last (no serial comma). This keeps today's string; `Intl.ListFormat('en')` would add a comma and is rejected for that reason.
- The demos at `catalog-mermaid.tsx:62` and `library/demos/diagram.tsx:776` interpolate `ALLOWED_FAMILIES`.
- Rewrite the module header (:1-5) and the `ALLOWED_FAMILIES` doc (:10-14) to state that the list derives from `builtinFamilies`.

**Scope**: in — `src/catalog/mermaid-schema.ts` (moved), new `src/catalog/mermaid-schema.unit.test.ts`, `src/catalog/catalog.ts`, `src/lib/mcp/server.ts`, the two demo files. Out — `MERMAID_MAX_CHARS` value, catalog wording other than the interpolation.

**Acceptance**:

- `grep -rn "components/catalog/mermaid-schema" src` → no matches.
- `grep -rn "flowchart, sequence, state" src --exclude='*.test.ts'` → no matches.
- New `mermaid-schema.unit.test.ts`: `ALLOWED_FAMILIES` equals `'flowchart, sequence, state, class, ER, pie and gantt'`; every `builtinFamilies` id appears through its label. Model after `src/lib/mcp/catalog-summary.unit.test.ts`.
- `pnpm test src/catalog src/lib/mcp src/components/library` → green.

---

## Phase 3 — Shared statement driver; migrate class, er, state

**Goal**: One driver owns the `accDescr { … }` block, per-line error recovery and early stop. Class, er and state call it and share one one-line acc reader. Goldens are byte-identical.

**Decisions**:

- New `src/lib/diagram/core/lex/statements.ts`:

  ```ts
  export interface StatementHandlers {
    statement(line: LogicalLine): void;
    description(text: string): void;
    blockAllowed?(): boolean;
    stop?(line: LogicalLine): boolean;
  }
  export function readStatements(
    lines: readonly LogicalLine[],
    report: DiagnosticSink,
    handlers: StatementHandlers,
  ): { failures: number; stopped: boolean };
  ```

  Semantics match today's loops exactly. A line matching `ACC_DESCR_BLOCK` while `blockAllowed` is absent or true goes to `readDescriptionBlock`, then `description`, and is not followed by `stop`. Any other line goes to `statement`; a throw goes to `reportStatementError(report, cause, line.span)` and increments `failures`. `stop` runs after every statement, thrown or not; `true` ends the loop at once with `stopped: true`. `description` fires in source order, so the last `accDescr` wins as today.

- `tokens.ts`: export `normalizeSpace(raw: string): string` (trim, collapse each whitespace run to one space).
- `acc.ts`: export `readAccText(scanner: Scanner): string` (skipSpace, optional `:`, `normalizeSpace(readRestOfLine(scanner))`). Update the header (:4-7): the block is consumed by `readStatements`.
- class, er: delete `accStatement`; each switch arm assigns `draft.accTitle`/`draft.accDescr` from `readAccText(scanner)`. Replace the loop with `readStatements`. State does the same and passes `blockAllowed: () => draft.pendingNote === null`.

**Scope**: in — `core/lex/tokens.ts`, `core/lex/acc.ts`, new `core/lex/statements.ts`, new `core/lex/statements.unit.test.ts`, `families/{class,er,state}/parse.ts`. Out — sequence, gantt, pie, flowchart (Phase 4); keyword recognition and casing.

**Acceptance**:

- New `statements.unit.test.ts` (model after `core/lex/lines.unit.test.ts`): block consumed and `description` called with its text; two descriptions arrive in order; `blockAllowed` false sends the block line to `statement`; a throwing line is reported with its span, counted in `failures`, and the next line still runs; `stop` returning true ends at that line (`stopped: true`, later lines unseen); `stop` is not called for a block; an unclosed block warns `unclosed-block`.
- `grep -n "function accStatement\|ACC_DESCR_BLOCK\|reportStatementError" src/lib/diagram/families/{class,er,state}/parse.ts` → no matches.
- `pnpm test src/lib/diagram` → green with no `-u`. `git status --porcelain src/lib/diagram | grep __snapshots__` → no output.

---

## Phase 4 — Migrate sequence, gantt, pie, flowchart

**Goal**: No family keeps its own statement loop, `accStatement` or `text()`. Flowchart acc values collapse whitespace. Goldens are byte-identical.

**Decisions**:

- sequence, gantt: delete `accStatement` and `text()`; use `readAccText` in the `acctitle`/`accdescr` arms and `normalizeSpace` at every former `text()` call. Move each node-limit check into `stop` (report the same `too-many-nodes` error on `line.span`, return true); after the driver, `stopped` returns `{ ir: null, diagnostics }`.
- pie: delete `text()`; the inline acc branches (:86-100) use `readAccText`; loop via `readStatements`.
- flowchart: loop via `readStatements`. Delete the inner try/catch (:415-424) and the `failures` field; `run()` uses the driver's `failures`. The `unsupported-construct` early returns (:389-413) stay in `statement`, still outside any try. `ACC_TITLE`/`ACC_DESCR_LINE` values pass through `normalizeSpace`. If plan 03 has landed, route its edge-limit abort through `stop` and keep its tests green.

**Scope**: in — `families/{sequence,gantt,pie,flowchart}/parse.ts`, `families/flowchart/parse.unit.test.ts`. Out — the shared helpers (Phase 3), limit values, flowchart keyword regexes other than their value normalization.

**Acceptance**:

- `grep -rn "function accStatement\|function text(\|ACC_DESCR_BLOCK\|reportStatementError" src/lib/diagram/families` → no matches.
- `flowchart/parse.unit.test.ts`: `accTitle:  Publish   flow ` and `accDescr: How   it ships` → `ir.accTitle === 'Publish flow'`, `ir.accDescr === 'How it ships'` (fails red today).
- `pnpm test src/lib/diagram` → green with no `-u`, including the sequence and gantt limit cases and `fuzz.unit.test.ts`. `git status --porcelain src/lib/diagram | grep __snapshots__` → no output.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note the deviation in the final summary. Stop and report instead of improvising when a locked decision turns out to be wrong or impossible, when the work needs files outside scope, or when acceptance cannot be met after a couple of honest attempts. If a golden snapshot changes in Phase 3 or 4, stop and report the diff. Never update snapshots with `-u` to pass.

## Done criteria

- [ ] `pnpm gate` exits 0.
- [ ] `test -e src/components/diagram/family-views.ts` → exit 1.
- [ ] `grep -rn "components/catalog/mermaid-schema" src` → no matches.
- [ ] `grep -rn "function accStatement\|function text(\|reportStatementError(" src/lib/diagram/families` → no matches.
- [ ] `git diff ffee99b --stat -- 'src/lib/diagram/**/__snapshots__/**'` → empty.
- [ ] `docs/plans/README.md` status row updated.

## Open questions

- Phase 2: the derivation pulls `builtinFamilies` (all parsers and layouts) into the `src/catalog/catalog.ts` module graph and so into the MCP server path. Recommended default: accept. The engine already ships eagerly on the client and in SSR via `HouseDiagram`.
