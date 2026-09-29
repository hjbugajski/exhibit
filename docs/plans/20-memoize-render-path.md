# Plan 20 — Memoize markdown parsing and syntax highlighting on the block render path

Memoize the three render-time hot spots, so that a re-render with unchanged input no longer re-parses markdown or re-tokenizes code. The three sites are `HighlightedCode`, `MarkdownBody` and `MarkdownView`. Each site gets a spy test that fails without the memo. This plan does not memoize catalog components, does not change the json-render store or its context, and does not touch the chart definition memo.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none

## Why this matters

On a spec artifact, each store write (Checklist tick, Rating click, Choice select, every NoteBox keystroke) re-renders every element, which re-parses every `markdown` prop and re-tokenizes every code block. In the Source tab, a Copy click and its reset each re-tokenize the whole body, up to 100k characters (about 18 ms per 100 KB). Opening the edit or delete dialog on a markdown artifact re-parses the whole body and re-validates every exhibit fence. Impact is modest; after this lands, cost scales with content changes, not interactions.

## Context

- Domain skills. The executor must read and follow them:
  - `/Users/henry/.claude/skills/react-best-practices/SKILL.md`
  - `/Users/henry/.claude/skills/react-best-practices/references/rerender.md`. See "Extract to Memoized Components" at `:38` and "Do not wrap a simple expression with a primitive result type in useMemo" at `:323`. The note at `:74` does not apply: `vite.config.ts` has no React Compiler plugin, so manual memoization is needed.
  - `/Users/henry/.claude/skills/code-comments/SKILL.md`
- `src/components/blocks/highlighted-code.tsx:25-26`: `lang` is resolved and `highlight(code, lang)` runs on every render, with no memo. `HIGHLIGHT_MAX_CHARS` is at `:9`. Callers:
  - `CodeBlock` (`src/components/catalog/code-block.tsx:42`), which also renders every markdown fence through `highlightFence` (`src/components/markdown/markdown-policy.tsx:51-53`)
  - `ExhibitError` (`src/components/markdown/catalog-dispatch.tsx:106`)
  - the house-diagram fallback (`src/components/diagram/house-diagram.tsx:57`)
  - the Source tab (`src/components/artifacts/artifact-detail.tsx:413`)
- `src/lib/highlight.ts:79`: `export function highlight(code, language)` is pure and returns a fresh array on each call.
- `src/components/catalog/markdown-body.tsx:42-47`: renders `<Markdown components={components} {...markdownParseOptions}>{markdown}</Markdown>`. `components` is a module constant (`:19`), and so is `markdownParseOptions`. All catalog markdown props (Prose, Callout, Quote, Steps, Timeline, Details, Stop) pass through here. For an example caller, see `src/components/catalog/prose.tsx:8`.
- `src/components/markdown/markdown-view.tsx:66-73`: the artifact body renderer. `components` (`:35-40`) and `options` (`:42-45`) are module constants. `<Markdown>` at `:69` sits inside `JSONUIProvider`. The parent `ArtifactDetailView` re-renders it on copy status (`artifact-detail.tsx:85`), on dialog state (`:86-87`) and on form status. The render site is `:384`.
- `@tanstack/markdown` has no internal memo. In `node_modules/.pnpm/@tanstack+markdown@0.0.13_react@19.2.8/node_modules/@tanstack/markdown/dist/react.js:3-7`, `Markdown` calls `parseMarkdown(input, options)` on every invocation.
- json-render behavior, in `node_modules/.pnpm/@json-render+react@0.20.0_react@19.2.8_zod@4.4.3/node_modules/@json-render/react/dist/index.mjs`:
  - The store context value (`:112-115`) changes on every write.
  - Every `ElementRenderer` reads that context (`:851`), so every element re-renders on every write.
  - `defineRegistry` calls each catalog component as a plain function (`:1195`). For this reason, `memo()` on a catalog component (Prose, Callout, and the others) has no effect. The memo must live inside `MarkdownBody`, `HighlightedCode` and `MarkdownView`, which are real components.
- Interactive state inside a memoized markdown element still works. Catalog components embedded via directives and exhibit fences read the store through context, and a context change reaches them past a memoized parent element. `src/components/markdown/catalog-dispatch.unit.test.tsx:185-214` (the `embedded component state` suite, a checklist round-trip through `MarkdownView`) proves this and must stay green.
- Mock exemplar: `vi.mock` with a factory at `src/catalog/registry.unit.test.tsx:19`. `testing/setup.ts` does not enable React StrictMode for Testing Library.
- Existing suites to extend:
  - `src/components/blocks/highlighted-code.unit.test.tsx`
  - `src/components/catalog/markdown-body.unit.test.tsx`
  - `src/components/markdown/markdown-view.unit.test.tsx`

Cross-phase rules (from CLAUDE.md):

- Kebab-case filenames, no barrels.
- Tests are colocated as `.unit.test.tsx` and use happy-dom.
- Direct `react` imports; never `import * as React`.
- No `dangerouslySetInnerHTML` outside the vetted markdown renderer.
- Never silence a lint rule with a disable comment.

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before you continue. Report material drift. Do not replan silently.

## Gate

`pnpm gate` (typecheck, `lint --fix`, `fmt`, test) exits 0. Node is pinned to 26 in `.node-version`; if `node -v` disagrees, prefix commands with `mise exec --`.

## How to execute

Single phase, one session. The orchestrator dispatches one subagent with this plan's Context, Decisions, Scope and Acceptance, runs the gate, re-prompts the same subagent on failure, then writes a short "what changed, what to test" summary and stops. Henry commits.

---

## Phase 1 — Memoize the three render sites, with spy tests

**Goal**: A re-render with identical `code`/`language` or identical `markdown` does not call `highlight` or `Markdown` again. A changed input still does.

**Decisions**:

- Work test-first. Add each spy test, confirm that it fails against the current code, then add the memo.
- `HighlightedCode`: keep the `lang` computation outside the memo. It is a cheap expression with a primitive result (see the rerender.md `:323` rule). Memoize only the tokenization with `const lines = useMemo(() => (lang ? highlight(code, lang) : null), [code, lang]);`. `lang` is a string or `null`, so the dependency check compares values and survives `router.invalidate` refetches.
- `MarkdownBody`: memoize the `<Markdown>` element on `[markdown]`, and leave the wrapper `<div>` outside the memo. A change to `className` or `size` then updates without a re-parse. Keep `export function MarkdownBody`. Do not wrap the export in `memo()`: the element memo has the same effect, keeps the export shape, and matches `MarkdownView`.
- `MarkdownView`: memoize the `<Markdown>` element on `[markdown]`. `JSONUIProvider` and the wrapper `<div>` stay outside the memo, so store updates still flow through context.
- `components`, `options` and `markdownParseOptions` are module constants. `markdown` is therefore the complete dependency list. Do not add the constants to the dependency arrays.
- Test spies wrap the real implementation, so existing assertions still see real output:
  - For `highlight`: `vi.mock('@/lib/highlight', async (importOriginal) => { const actual = await importOriginal<typeof import('@/lib/highlight')>(); return { ...actual, highlight: vi.fn(actual.highlight) }; })`.
  - For `Markdown`: the same pattern on `@tanstack/markdown/react`. Counting `Markdown` invocations counts parses, because `Markdown` parses on each call (`react.js:3-7`).
  - Clear each spy in `afterEach`.
  - Assert that the call count after `rerender(...)` equals the count after the first render. Do not assert an absolute `1`: a StrictMode double-invoke must not make the tests brittle.
- Comments: add at most one short line per site, and only if it states a non-obvious constraint (for example, "options are module constants, so markdown is the only input"). Follow code-comments. Do not add history and do not restate the code.

**Scope**:

In scope:

- `src/components/blocks/highlighted-code.tsx`
- `src/components/catalog/markdown-body.tsx`
- `src/components/markdown/markdown-view.tsx`
- the three colocated `.unit.test.tsx` files

Out of scope:

- `src/components/catalog/chart-inner.tsx:45,118`: its `definition` memos are keyed on the identity of `data`, which json-render re-creates on every render. The fix needs value-keying, which is a separate design.
- `ExhibitBlock`: its re-validation (`catalog-dispatch.tsx:136`) is already skipped when `MarkdownView` does not re-render the memoized element.
- Splitting state out of `ArtifactDetailView`.
- Upstream json-render context granularity.
- `memo()` on any catalog component, which has no effect for the reason given in Context.

**Acceptance**:

- `pnpm vitest run src/components/blocks/highlighted-code.unit.test.tsx src/components/catalog/markdown-body.unit.test.tsx src/components/markdown` passes. This run includes the `embedded component state` suite in `catalog-dispatch.unit.test.tsx`.
- New tests:
  - `highlighted-code.unit.test.tsx`:
    - Re-rendering with identical `code`/`language` does not call `highlight` again.
    - Re-rendering with only `className` changed does not call it again.
    - Re-rendering with changed `code` calls it once more.
  - `markdown-body.unit.test.tsx`:
    - Re-rendering with an identical `markdown` does not invoke `Markdown` again.
    - A `className` or `size` change does not invoke it again, and the new class is present on the wrapper.
    - A changed `markdown` invokes it once more and renders the new text.
  - `markdown-view.unit.test.tsx`:
    - Re-rendering with an identical `markdown` and the same `store` does not invoke `Markdown` again.
    - A changed `markdown` invokes it once more.
- Red-first check: with the memo reverted at each site, that site's "identical props" test fails. Record the check in the summary.
- `git diff --name-only` lists exactly the six in-scope files.
- `git diff src/components/catalog/ | grep -E '^\+.*\bmemo\('` → no matches.
- `pnpm gate` exits 0.
- Manual smoke tests for Henry. The agent does not run these.
  - On a spec that has a NoteBox and a large CodeBlock, typing stays responsive.
  - In the Source tab of a large artifact, Copy still toggles its icon.
  - Checklists embedded in a markdown artifact still persist their ticks.

---

## When reality disagrees with the plan

Adapt and continue when the change still serves the intent, respects the locked decisions and stays in scope. Note each deviation in the final summary.

Stop and report instead of improvising when any of these happens:

- A locked decision is wrong or impossible. For example, `vi.mock` cannot intercept `@tanstack/markdown/react` from a `src` import. In that case, report it; do not switch the spy target to `parseMarkdown` inside `node_modules`.
- The work requires a change to an out-of-scope file.
- An existing test fails in a way that suggests the memo blocks a store-driven update.

## Done criteria

- [ ] `pnpm gate` exits 0.
- [ ] Each of the three sites memoizes on value-typed inputs only: `[code, lang]` or `[markdown]`.
- [ ] The spy tests exist in all three suites, and each site's identical-props test fails when its memo is removed.
- [ ] The `catalog-dispatch.unit.test.tsx` state round-trip tests pass without changes.
- [ ] The `docs/plans/README.md` status row is updated.
