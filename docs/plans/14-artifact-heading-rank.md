# Plan 14 — Shift artifact content headings one rank below the page title

Render every heading that comes from artifact content one rank lower, so the artifact title stays the page's only `<h1>`: markdown `#`–`######` render `h2`–`h6`, and catalog `Heading` levels 1–3 render `h2`–`h4`. The visual scale must not change. Out of scope: nesting-aware ranks (a Heading inside a Section still gets the same rank), Section/Card/Day/Itinerary title tags, and publish-tool copy.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: M
- **Risk**: MED — the markdown heading scale and margins are keyed by tag in two places (house CSS and the typography plugin), so a tag shift without a CSS re-key changes sizes and rhythm.
- **Depends on**: none

## Why this matters

The artifact page already has an `<h1>` (the title). A markdown body that opens with `# Title`, or a spec with a level-1 Heading, adds a second `<h1>`, often a copy of the title. The outline that screen readers navigate is then flat at the top, and every content heading ranks one step higher than Section (`h2`) and Card (`h3`) titles next to it. HTML permits more than one `h1`, so the defect is a weak outline, not invalid markup. When this lands, the outline is title → content, and the pixels stay the same.

## Context

- `src/components/artifacts/artifact-detail.tsx:213` — the page `<h1>` (artifact title).
- `src/components/catalog/heading.tsx:11-15` — `levelClass` (visual scale per level). `:18` — `Tag = h${props.level}`, the rank bug.
- `src/catalog/catalog.ts:163-172` — the `Heading` schema. `:169` tells Claude that level 1 is the "(page title)". Claude reads this text through `get_catalog`.
- `src/components/markdown/markdown-policy.tsx:91-141` — `createMarkdownComponents`, the one components map for every markdown surface. It has no `h1`–`h6` entries today. `:129-132` — the `data-md-task` attribute precedent: a `data-md-*` marker is the styles.css hook.
- `node_modules/@tanstack/markdown/dist/react.js:12-13` renders a heading as `h${node.depth}` with props `id` and `data-framework` only when present. `:166-168` resolves the tag through `options.components`, so an `h1` key in the map receives every depth-1 heading.
- Markdown surfaces and their typography size: `MarkdownView` (`src/components/markdown/markdown-view.tsx:68`, base `.prose`, the only surface that renders exhibit fences and directives); `MarkdownBody` (`src/components/catalog/markdown-body.tsx:27-31`): Prose is `base` (`prose.tsx:8`), Quote is `lg` (`quote.tsx:18`), and Callout/Details/Stop/Steps/Timeline use the default `sm` (`markdown-body.tsx:36`).
- `src/styles.css:714-751` — the house heading scale, unlayered, keyed `.prose h1`–`.prose h4`: weight 600, tracking -0.01em, font-size 1.5/1.25/1.125/1em, line-heights to match. Margins come from `@tailwindcss/typography` 0.5.20, keyed by tag, per size: `node_modules/@tailwindcss/typography/src/styles.js` sm `:50-73`, base `:255-278`, lg `:460-483`. `'h2 + *'`/`'h3 + *'`/`'h4 + *'` zero the next sibling's top margin (`:175-183`, `:380-388`, `:585-593`). There is no rule for `h1 + *` or `h5`/`h6`. Margins are em values, so they resolve against the house font-size.
- `src/styles.css:834-839` — the precedence note: typography rules are layered at 0,1,0; house rules are unlayered and win.
- `src/styles.css:866-876` — exhibit fences and directives render inside a `[data-md-embed]` island in base `.prose`. A catalog Heading embedded there currently gets the unlayered `.prose hN` rule, which matches its own `levelClass` scale by design (the comment at `:717`).
- Rank neighbours: Section title `h2` (`section.tsx:19`), Itinerary title `h2` (`itinerary.tsx:17`), Card title `level={3}` (`card.tsx:52`), Day label `h3` (`day.tsx:40`).
- Tests that pin the current tags: `src/components/markdown/markdown-view.unit.test.tsx:130-134` queries `h1`. `src/components/catalog/markdown-body.unit.test.tsx:46` asserts `h2` is absent to prove that an exhibit-fence Heading (level 2) did not render. After the shift that assertion passes for the wrong reason. Heading-role test exemplar: `src/components/catalog/card.unit.test.tsx:19-22`.
- Stale comments to fix: `src/styles.css:714-721` and `:730-732` (they name `h1`–`h4`), and `src/components/catalog/flow.ts:8-16` (it names "h1/h2 mt" and "h3 mt" for Heading tiers).

Deviations from the audit brief, locked here:

- The brief treats font-size as the only visual risk. The typography plugin also keys margins and sibling rules by tag, per size. The re-key therefore carries margins for all three sizes in use, plus sibling zeroing. Without them, a mid-document `#` gets a 48px top margin instead of 0, and a `####` loses its tight bottom gap.
- Catalog Heading gets `not-prose`. Removing the `.prose hN` rules would leave an embedded Heading exposed to the typography rules for its new tag (for example, weight 700 on `h2`), at a 0,1,0 tie with its utilities that emission order decides. `not-prose` makes its own `levelClass` the single source, in and out of prose.

Cross-phase rules (from `CLAUDE.md`): kebab-case files; no barrels; tests colocated as `.unit.test.tsx` with `// @vitest-environment happy-dom`; semantic tokens only, no `dark:` or `/NN` alpha in components; no `dangerouslySetInnerHTML` outside the vetted markdown renderer (this change must not add one); the markdown security policy stays in `markdown-policy.tsx`.

Domain skills the executor must follow:

- `/Users/henry/.claude/skills/web-design-guidelines/SKILL.md` — "Headings hierarchical `<h1>`–`<h6>`" is the rule this plan enforces.
- `/Users/henry/.claude/skills/code-comments/SKILL.md` — rewrite the stale comments listed above; the `not-prose` class and the depth-to-tag shift each get one "why" comment; no comments that restate code.

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before you proceed. Report material drift. Do not replan silently.

## Gate

`pnpm gate` (typecheck, lint with fix, fmt, test) closes the phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If the shell's `node -v` is not 26, prefix with `mise exec --`.

## How to execute

- Single phase, one fresh session; the user commits. It is one phase with about 9 files, which is above the usual cap of 6, because the CSS re-key and both tag shifts must land together. Any split leaves an intermediate commit with wrong heading sizes.
- The orchestrator dispatches ONE subagent (`Task` tool, `subagent_type: general-purpose`) with this plan's Context, the Decisions/Scope/Acceptance below, and the intent. It verifies with the gate and re-prompts the SAME subagent on failure. It does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for user review.

---

## Phase 1 — Rank shift with the visual scale re-keyed

**Goal**: No artifact content renders an `<h1>`. Markdown depth d renders `h{min(d+1, 6)}`, and catalog Heading level n renders `h{n+1}`. In every size (base, sm, lg), each heading's computed font-size, line-height, weight, and margins equal the values at `ffee99b`.

**Decisions**:

- Markdown map (`markdown-policy.tsx`): add `h1`–`h6` entries to `createMarkdownComponents`. Depth d renders tag `h{min(d+1, 6)}` with `data-md-heading="{d}"` and forwards the incoming props and children. `######` and `#####` both render `h6`, because HTML has no `h7`; the attribute keeps them distinct. Add one sentence to the module doc comment (`:23-26`): content headings rank below the page title.
- House CSS (`styles.css:714-751`): delete the `.prose h1`–`.prose h4` rules. Replace them with unlayered `.prose [data-md-heading='1'..'4']` rules that set font-size, line-height, font-weight 600, and letter-spacing -0.01em, with the same values as today. The same rules also set `margin-top` and `margin-bottom` to the plugin's em values for the source tag (h1 for depth 1, h2 for depth 2, and so on). Base values apply under `.prose`; override them under `.prose-sm` and `.prose-lg` with the sm and lg values from `styles.js`. Depths 5 and 6 stay unstyled, as `h5`/`h6` are today.
- Sibling rhythm: add unlayered `.prose [data-md-heading='2'|'3'|'4'] + * { margin-top: 0 }`. This keeps the zeroing that depth 4 loses when it moves from `h4` to `h5`. Depth 1 inherits the plugin's `h2 + *` zeroing. Accept that: with collapsing margins the gap is the heading's margin-bottom, which differs by at most 1.5px (lg only) from today.
- Catalog Heading (`heading.tsx`): `Tag = h${props.level + 1}`, typed `'h2' | 'h3' | 'h4'`. Keep `levelClass` and the slug id unchanged. Add `not-prose` to the class list, with a one-line why: the typography rules for its new tag would otherwise tie with its utilities inside a markdown embed.
- Schema (`catalog.ts:169`): replace the `level` description with `'Heading size within the artifact body: 1 is largest (a Section title's rank), 3 is smallest. The artifact title is already the page heading; do not repeat it as a Heading.'` Keep the `Heading.description` at `:164-165`.
- Fixture: add one Prose block to `src/catalog/fixtures/flow.ts` whose markdown is a `#`–`####` ladder, each heading followed by a paragraph. The `/dev/library` "Flow stress test" demo then shows the markdown scale next to the catalog Heading.
- Accepted residuals (do not re-key): inline `code` size and `strong` weight inside markdown headings follow the plugin's rules for the new tag (for example, `h2 code` is 0.875em).

**Scope**: in — `src/components/markdown/markdown-policy.tsx`, `src/styles.css`, `src/components/catalog/heading.tsx`, `src/components/catalog/heading.unit.test.tsx` (new), `src/catalog/catalog.ts`, `src/components/markdown/markdown-view.unit.test.tsx`, `src/components/catalog/markdown-body.unit.test.tsx`, `src/components/catalog/flow.ts` (comment only), `src/catalog/fixtures/flow.ts`. Out — Section/Card/Day/Itinerary title tags (they already rank below the title); the `publish_markdown` description in `src/lib/mcp/server.ts` (see Open questions); `headingIds` (it stays false).

**Acceptance**:

- `pnpm gate` exits 0.
- `grep -nE '^\.prose h[1-6]' src/styles.css` returns no matches.
- `grep -n 'page title' src/catalog/catalog.ts` returns no matches.
- `grep -c "data-md-heading" src/styles.css` is at least 4.
- `src/components/markdown/markdown-view.unit.test.tsx`: change `:130-134` to query `h2`. Add a case: `#` through `######` render `h2,h3,h4,h5,h6,h6` with `data-md-heading` `1`–`6`, and `container.querySelector('h1')` is null.
- `src/components/catalog/markdown-body.unit.test.tsx:46`: assert that `container.querySelector('h1, h2, h3, h4, h5, h6')` is null, so the check stays meaningful for any tag.
- `src/components/catalog/heading.unit.test.tsx` (new, modelled on `card.unit.test.tsx`): levels 1/2/3 give `getByRole('heading', { level: 2|3|4 })`; the element carries its `levelClass` size (`text-2xl`/`text-xl`/`text-lg`) and `not-prose`; the slug id is kept; an all-non-Latin text renders no `id`.
- Manual smoke for the user (the agent never runs it). On `/dev/library` → Flow stress test, in DevTools, the markdown ladder at base size computes as follows: depth 1 is 24px/32px with margins 0 and 21.33px; depth 2 is 20px/28px with 40px and 20px; depth 3 is 18px/28px with 28.8px and 10.8px; depth 4 is 16px/24px with 24px and 8px. All have weight 600. Open a markdown artifact that starts with `# Title`: the accessibility tree shows one `h1` (the page title). A catalog Heading inside an exhibit fence looks the same as the same Heading in a spec.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note the deviation in the final summary. Stop and report instead of improvising in these cases:

- a locked decision turns out to be wrong or impossible,
- the work requires touching out-of-scope files,
- acceptance can't be met after a couple of honest attempts.

A specific stop condition: if `not-prose` does not remove the typography rules from the catalog Heading (for example, a future plugin version drops the `[class~="not-prose"]` exclusion that `node_modules/@tailwindcss/typography/src/index.js:20-23` emits today), report it. Do not add unlayered rules that restyle catalog components.

## Done criteria

- [ ] `pnpm gate` exits 0
- [ ] `grep -nE '^\.prose h[1-6]' src/styles.css` returns no matches
- [ ] `grep -rn "'h1'" src/components/catalog/heading.tsx` returns no matches
- [ ] The new markdown-depth test and `heading.unit.test.tsx` pass
- [ ] `docs/plans/README.md` status row updated

## Open questions

- Should the `publish_markdown` description (`src/lib/mcp/server.ts:253`) tell Claude not to open the body with a `#` copy of the title? Default: no, not in this plan. The rank shift already fixes the outline, and tool copy is a separate change.
- Should heading ranks follow nesting (a Heading inside a Section ranks `h3`)? Default: no. The spec renderer has no depth context, and a uniform shift already gives a valid outline.
