# Plan 25 — House component API consistency: contexts, Textarea, Dialog close, card insets, dead exports, lint disables

Bring the house component library and its consumers in line with the house component rules. Move every context to the React 19 idiom. Route Textarea's props through Field.Control. Replace Dialog's `showCloseButton` booleans with a composed close. Use the card spacing token in three catalog blocks. Delete the demo-only `Label` and two unused exports. Remove all eight `oxlint-disable` directives. Out of scope: visual redesign, new components, and every behavior change except closing the edit dialog during a save.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: M (each item S; about 30 files across 5 phases)
- **Risk**: LOW
- **Depends on**: docs/plans/12-\*.md (plan 12 Phase 1 deletes the `spinner.tsx` directive; plan 12 Phase 2 adds the `ToggleGroup` that Phase 5 adopts)

## Why this matters

`src/components/ui` is the reference library, so executors copy whatever pattern they find in it. At HEAD it still contains `.Provider`/`useContext`, boolean props that inject markup, a Textarea whose caller `id`/`disabled` override the values Field.Control computes, a one-off `px-4`, and eight suppressions of lint rules. The owner's standing rule forbids disable comments. After this plan lands, each rule holds everywhere, and a grep of the repo proves it.

## Context

- React 19 contexts. Providers: `ui/alert.tsx:51-53`, `catalog/day.tsx:63`. Readers: `alert.tsx:85,119`, `catalog/stop.tsx:24`. The diagram engine exports `.Provider` aliases: `diagram/diagram-context.ts:167-168` (`DiagramConfigProvider`, `DiagramSceneProvider`), `diagram/canvas-context.ts:28` (`DiagramCanvasProvider`). Its readers are `diagram-context.ts:173,183,216` and `canvas-context.ts:31,41`, and its element factory is `diagram-context.ts:244`. Alias call sites: `diagram.tsx:295-297`, `diagram-boundary.tsx:101,119-123`, `canvas-parts.tsx:162-167`, `gantt-parts.unit.test.tsx:23,52-64`. Exemplar: `ui/map/map-context.ts:17-20`.
- Textarea: `ui/textarea.tsx:14` spreads every prop onto the render element. Base UI merges render-element props over the control's own props (`node_modules/@base-ui/react/internals/useRenderElement.mjs:105`) and then drops the render element's `ref`. The props Field.Control consumes are listed at `field/control/FieldControl.mjs:30-42`. Its prop type is input-only (`FieldControl.d.ts:18`, `BaseUIComponentProps<'input', …>`). `ui/input.tsx:7` types a Base UI Input as `ComponentProps<'input'>`. Exemplar for typing: `ui/field.tsx:7` (`FieldPrimitive.Root.Props`).
- Dialog: `ui/dialog.tsx:48-74` (Popup injects an X), `:84-101` (Footer's close has no consumer). The only product dialog is `artifacts/edit-artifact-dialog.tsx`. Its `onOpenChange` (`:88-103`) gates dismissal on `isDirty` but not on `pending`. Cancel is `disabled={pending}` (`:142`). The demo toggles the prop at `library/demos/dialog.tsx:18,25`. Positioned-slot exemplar: `ui/alert.tsx:116-128` (`Alert.Action`).
- Card insets: `px-4` at `catalog/details.tsx:14`, `catalog/choice.tsx:21`, `catalog/rating.tsx:38`. `--spacing-card` (14px) is at `src/styles.css:131`. `Card.Content` uses `px-card` (`ui/card.tsx:84`).
- Dead surface: `ui/label.tsx` is imported only by `library/demos/checkbox.tsx:4` and `library/demos/radio-group.tsx:3`. `library/registry.unit.test.ts:16` aliases `label` to `forms`. The wrapping-label exemplar is `catalog/choice.tsx:30-38`. `export { Badge, badgeVariants }` is at `ui/badge.tsx:48`, and `export { tabsListVariants }` is at `ui/tabs.tsx:77`. Neither has an importer. The cva definitions stay because the exported `VariantProps` types use them.
- Disable directives at HEAD: `ui/spinner.tsx:14` (plan 12 deletes it), `ui/label.tsx:10`, `catalog/rating.tsx:51`, `diagram/canvas-parts.tsx:95` (`div role="group"`), `diagram/diagram.tsx:333` (`svg role="img"`), `library/demos/diagram-playground.tsx:157,189` (`div role="group"`), and `lib/theme.unit.test.ts:75` (`new Function`). `jsx-a11y/prefer-tag-over-role` takes no options (`RuleNoConfig` in `node_modules/oxlint/configuration_schema.json`). `.oxlintrc.json` already has an `overrides` block.
- Rating: `RadioGroup.Item` is a fixed 16px circle with its own Indicator (`ui/radio-group.tsx:20-38`), so it cannot host a star. Base UI runs merged handlers right to left, so a caller's `onClick` runs before the radio's own. The radio's own handler returns on `defaultPrevented` without forwarding the click to the hidden input (`radio/root/RadioRoot.mjs:123-133`). Space on the `role="radio"` span arrives through `useButton` as a click on that same span.
- `diagram/diagram.css` is the engine's self-contained stylesheet (header `:1-20`: tier 0 must hold without the app). The `[data-part='canvas-controls']` rule is at `:767`. Fieldset precedent: `catalog/question-card.tsx:26-29` (a Safari caveat that applies only with a `legend`).
- Vitest runs `pool: 'threads'` (`vitest.config.ts:16`). happy-dom globals live on the worker's main context.

Cross-phase rules: the Conventions and Design system sections of `CLAUDE.md` apply. The ones this plan leans on: no aliases or re-export shims; no disable comments; compounds export namespace objects with bare part names; `render`, never `asChild`; disabled styling keys off `data-disabled`.

Domain skills the executor must follow: `/Users/henry/.claude/skills/building-components/SKILL.md`, `/Users/henry/.claude/skills/building-components/references/composition.md` (boolean props, React 19 section), `/Users/henry/.claude/skills/building-components/references/render.md`, and `/Users/henry/.claude/skills/code-comments/SKILL.md` (delete justifications that belonged to removed directives, and add no comments that restate code).

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before proceeding. Report material drift. Do not replan silently.

## Gate

`pnpm gate` (typecheck, lint with fix, fmt, test) closes every phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If `node -v` is not 26, prefix with `mise exec --`.

## How to execute

- One phase per fresh session; the user commits between phases.
- The orchestrator dispatches ONE subagent per phase (`Task` tool, `subagent_type: general-purpose`) with this plan's Context, the phase's Decisions/Scope/Acceptance, and the intent. It verifies with the gate and re-prompts the SAME subagent on failure. It does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for user review.

## Phases

1. React 19 context idiom everywhere (ui, catalog, diagram engine).
2. Textarea through Field.Control, Base UI-typed Input, and a composed Dialog close.
3. Delete `Label` and the unused variant exports.
4. Catalog question blocks: `px-card` insets and a Rating without the label wrapper.
5. Remaining directives: canvas controls, diagram svg, playground groups, theme test.

---

## Phase 1 — React 19 context idiom

**Goal**: No `.Provider` and no `useContext` in `src`. Runtime behavior is identical.

**Decisions**:

- Render providers as `<X value>` and read them with `use(X)`. This includes `use` inside `defaultFor`'s `Default` (`diagram-context.ts:216`) and `createElement(BasePropsContext, { key, value }, …)` at `:244`.
- Delete the three alias exports. Rename `ConfigContext` to `DiagramConfigContext` and `SceneContext` to `DiagramSceneContext`, and export both along with `DiagramCanvasContext`. Call sites render the contexts directly. Keep the hooks and their thrown messages unchanged. Aliases are forbidden, so no re-export shim may remain.

**Scope**: in — `ui/alert.tsx`, `catalog/day.tsx`, `catalog/stop.tsx`, `diagram/diagram-context.ts`, `diagram/canvas-context.ts`, `diagram/diagram.tsx`, `diagram/diagram-boundary.tsx`, `diagram/canvas-parts.tsx`, `diagram/gantt-parts.unit.test.tsx`. That is nine files, all mechanical renames. Out — every other edit in these files.

**Acceptance**:

- `pnpm gate` exits 0.
- `grep -rnE "\.Provider\b|useContext" src` → no matches.
- `grep -rn "DiagramConfigProvider\|DiagramSceneProvider\|DiagramCanvasProvider" src` → no matches.

---

## Phase 2 — Field text controls and the Dialog close

**Goal**: A caller's `id`, `disabled` and `ref` on Textarea reach Field.Control. Input is typed as Base UI's Input. Dialog has no boolean close props. No close path can dismiss the edit dialog during a save, and its X shows as disabled.

**Decisions**:

- `TextareaProps = ComponentProps<'textarea'> & Pick<FieldPrimitive.Control.Props, 'onValueChange'>`. Pass `id`, `name`, `value`, `defaultValue`, `disabled`, `autoFocus`, `ref` and `onValueChange` to `FieldPrimitive.Control`, and spread the rest onto `render={<textarea {...rest} />}`. Why this split: Control's type is input-only, so textarea attributes (`rows`, `wrap`) and `HTMLTextAreaElement` handlers cannot be spread onto it. The listed keys are exactly the ones Control consumes, plus `ref`, which the render element loses.
- `InputProps = InputPrimitive.Props`. This matches `field.tsx:7`, and exposes `onValueChange` and `render`.
- `dialog.tsx`: delete `showCloseButton` from Popup and Footer (`DialogPopupProps = DialogPrimitive.Popup.Props`, `DialogFooterProps = ComponentProps<'div'>`). Add `Action`, a `div` with `data-slot="dialog-action"` and `absolute top-2 right-2`, which mirrors `Alert.Action`. Callers compose `<Dialog.Action><Dialog.Close aria-label="Close" render={<Button variant="ghost" />}><XIcon data-icon="only" /></Dialog.Close></Dialog.Action>`.
- `edit-artifact-dialog.tsx`: renders that X with `disabled={pending}`. In `onOpenChange`, `!next && pending` cancels the change first, whatever the reason. Why: a failed save reports through `FormStatus` inside the dialog, and closing mid-save hides that error. The success path calls the `onOpenChange` prop directly, so the gate does not block it. Update the comment at `:89-91`.
- The dialog demo drops the boolean control and composes the X.

**Scope**: in — `ui/textarea.tsx`, `ui/textarea.unit.test.tsx` (new), `ui/input.tsx`, `ui/dialog.tsx`, `artifacts/edit-artifact-dialog.tsx`, `artifacts/edit-artifact-dialog.unit.test.tsx`, `library/demos/dialog.tsx`. Out — `AlertDialog`, which has no boolean close.

**Acceptance**:

- `pnpm gate` exits 0, with no edits to existing cases in `edit-artifact-dialog`, `diagram-playground` and forms tests.
- `grep -rn "showCloseButton" src` → no matches.
- `textarea.unit.test.tsx` (happy-dom) covers three cases. Inside `Field.Root`, with `Field.Label` "Notes" and `<Textarea id="notes-custom" />`, the label's `htmlFor` is `notes-custom`. `<Textarea disabled />` has `data-disabled`. A `ref` receives the `HTMLTextAreaElement`. The first two cases fail at HEAD.
- `edit-artifact-dialog.unit.test.tsx`: while `updateArtifactMetadataFn` never resolves, click Save and then `pressEscape()`. The Title field stays, and `getByRole('button', { name: 'Close' })` is disabled. Model the case on the failing-save case at `:105`.

---

## Phase 3 — Delete Label and the unused variant exports

**Goal**: The library exposes no API surface without a product or demo consumer.

**Decisions**:

- Delete `ui/label.tsx`. The checkbox and radio demos wrap the control and its text in a `<label className="flex items-center gap-2 text-sm">`, following `choice.tsx:30`. Drop the `id` and `htmlFor` pairs. Remove the `label` alias from `registry.unit.test.ts`.
- `badge.tsx:48` becomes `export { Badge };`. Remove `export { tabsListVariants }` from `tabs.tsx:77`, unless plan 12's `ui/toggle-group.tsx` imports it. In that case keep it, because it then has a consumer. Check with `grep -rn tabsListVariants src`.

**Scope**: in — `ui/label.tsx` (deleted), `library/demos/checkbox.tsx`, `library/demos/radio-group.tsx`, `library/registry.unit.test.ts`, `ui/badge.tsx`, `ui/tabs.tsx`. Out — `buttonVariants`, which has consumers after plan 12.

**Acceptance**:

- `pnpm gate` exits 0, including `registry.unit.test.ts`.
- `test ! -e src/components/ui/label.tsx` and `grep -rn "ui/label'" src` → no matches.
- `grep -rn "badgeVariants" src` → matches only in `ui/badge.tsx`.

---

## Phase 4 — Catalog question blocks

**Goal**: Details, Choice and Rating share the 14px card inset. Rating's stars are the radios themselves, with no wrapping label, no second handler and no directive.

**Decisions**:

- Replace `px-4` with `px-card` on the three `Card.Root` class lists. Do not wrap the content in `Card.Content`: Details wraps a Collapsible, and QuestionCard wraps a fieldset.
- Rating: each star is `Radio.Root` from `@base-ui/react/radio`, inside the house `RadioGroup.Root`. Keep ``aria-label={`${star} of 5 stars`}``. The `Star` icon is its child. One `onClick` calls `preventDefault()` and `set(statePath, 0)` when `star === value`, and this covers both pointer and Space (see Context). The focus ring moves onto the radio (`rounded-sm p-0.5 outline-none focus-visible:ring-3 focus-visible:ring-focus`). Delete the wrapping `<label>`, the item's `absolute size-px opacity-0`, and the duplicate handler. Replace the comments at `:49-50` and `:55-65` with one line on why the handler prevents default.

**Scope**: in — `catalog/details.tsx`, `catalog/choice.tsx`, `catalog/rating.tsx`, `catalog/rating.unit.test.tsx`. Out — `question-card.tsx` and `ui/radio-group.tsx`.

**Acceptance**:

- `pnpm gate` exits 0.
- `grep -n "px-4\|oxlint-disable" src/components/catalog/{details,choice,rating}.tsx` → no matches.
- `rating.unit.test.tsx`: the pointer case (`:64`) queries `[role="radio"] svg` in place of `label svg`. The pointer-clear, keyboard-clear and group-name cases pass without other edits.

---

## Phase 5 — Remaining disable directives

**Goal**: `grep -rn "oxlint-disable" src` finds nothing, and every a11y role keeps its accessible name.

**Decisions**:

- `CanvasControls` renders a `<fieldset>` (implicit `group` role, named by `aria-label`), and `DiagramCanvasControlsProps = ComponentProps<'fieldset'>`. The `[data-part='canvas-controls']` rule in `diagram.css` adds `margin: 0; padding: 0; border: 0; min-inline-size: 0;`, because the engine stylesheet must not depend on preflight to clear the fieldset's UA box.
- `diagram.tsx:333`: delete the directive, and add a `.oxlintrc.json` override that sets `jsx-a11y/prefer-tag-over-role` to `off` for `src/components/diagram/diagram.tsx` only. Why: an inline `<svg role="img">` is correct. An `<img>` cannot expose the `data-part` tree that `diagram.css` paints. The rule has no options, and this file has no other `role` attribute. Do not pass `role` through a props object to hide it from the linter.
- `diagram-playground.tsx`: both groups become plan 12's `ToggleGroup.Root` and `ToggleGroup.Item`, single-select with `value={[current]}`. `onValueChange` takes the first element and ignores `[]`. Keep `aria-label` "Preset" and "View mode".
- `theme.unit.test.ts`: `runInitScript` calls `runInThisContext(THEME_INIT_SCRIPT)` from `node:vm`. Keep the compile-as-assertion comment. Under the threads pool, the script resolves `localStorage`, `document` and `matchMedia` from the same globals that `new Function` used.

**Scope**: in — `diagram/canvas-parts.tsx`, `diagram/diagram.css`, `diagram/diagram.tsx`, `.oxlintrc.json`, `library/demos/diagram-playground.tsx`, `src/lib/theme.unit.test.ts`. Out — `Canvas`'s `role: 'group'` in its props object (`canvas-parts.tsx:156`), which the linter does not flag and which is correct.

**Acceptance**:

- `pnpm gate` exits 0, including `canvas.unit.test.tsx`, `diagram-playground.unit.test.tsx`, `styling-contract.unit.test.tsx` and `theme.unit.test.ts`.
- `grep -rn "oxlint-disable" src` → no matches.
- `canvas.unit.test.tsx` gains one assertion: `getByRole('group', { name: 'Diagram view' })` is a `FIELDSET`.
- Manual smoke for the user (the agent never runs it): in `/dev/library`, the diagram canvas controls sit bottom-right with no border or offset change, and the playground toggles switch the preset and the mode.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note the deviation in the final summary. Stop and report instead of improvising in these cases:

- a locked decision turns out to be wrong or impossible,
- the work requires touching out-of-scope files,
- acceptance can't be met after a couple of honest attempts.

Specific stop conditions:

- The Rating handler might not stop a re-selection under `user-event`. If so, report, and do not re-add the label wrapper.
- `runInThisContext` might not see happy-dom globals. If so, report, and do not move the rule into config.
- Plan 12 might not have landed. Then `spinner.tsx:14` and `ToggleGroup` are missing, so stop before Phase 5.

## Done criteria

- [ ] `pnpm gate` exits 0
- [ ] `grep -rn "oxlint-disable" src` → no matches
- [ ] `grep -rnE "\.Provider\b|useContext" src` → no matches
- [ ] `grep -rn "showCloseButton" src` → no matches
- [ ] `src/components/ui/label.tsx` does not exist; `badgeVariants` appears only in `ui/badge.tsx`
- [ ] `grep -n "px-4" src/components/catalog/{details,choice,rating}.tsx` → no matches
- [ ] `docs/plans/README.md` status row updated

## Open questions

- Phase 4: Rating imports a Base UI primitive directly, which no other catalog file does. Recommended default: accept it, because the star is a one-off visual. Add a `RadioGroup` part only if a second star-like radio appears.
- Phase 5: the diagram svg exception lives in config, not in code. Recommended default: keep the file-scoped override. The only alternative that satisfies the linter hides `role` in a props object, which is worse.
