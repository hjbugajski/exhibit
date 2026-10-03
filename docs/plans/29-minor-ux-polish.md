# Plan 29 — Minor UX: whitespace titles, RelativeTime hydration, reset confirmation

Three small UX fixes. The edit dialog rejects a whitespace-only title inline, with no raw zod dump. `RelativeTime` stops raising text hydration mismatches. The sign-in page confirms a successful password reset. Out of scope: the itinerary Day map layout shift (plan 36), server-side title trimming, and a live-ticking relative time.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none. File overlap with `docs/plans/02-sign-in-redirect-validation.md` (both edit `src/routes/sign-in.tsx` `validateSearch` and `src/components/account/sign-in-view.tsx`). Either order works; whichever runs second merges onto the other's shape.

## Why this matters

A title of spaces passes `required`, reaches the server as `''`, and the zod validator throws. `useFormAction` puts `err.message` in the danger alert, and a zod v4 message is `JSON.stringify(issues)`, so the owner sees a JSON dump. `RelativeTime` computes its text with `Date.now()` on the server and again on the hydrating client. When a minute boundary falls between the two, or the clocks differ, React 19 reports a text mismatch and client-renders the tree again. After a password reset, the owner lands on an unchanged sign-in form with no confirmation.

## Context

- `src/components/artifacts/edit-artifact-dialog.tsx:114-123` — the title `Field.Root`: `required` at :119, one `Field.Error match="valueMissing"` at :122. `handleSubmit` sends `title.trim()` at :75.
- `src/lib/artifact-metadata.ts:15` — `titleField = z.string().min(1).max(200)`, used by `updateArtifactMetadataInput` at `src/lib/artifacts.ts:149-151`.
- `src/lib/use-form-action.ts:25-29` — any thrown `Error` becomes the status message verbatim. The zod message is `node_modules/zod/v4/classic/errors.js:19`.
- Base UI Field (`node_modules/@base-ui/react/field/root/FieldRoot.d.ts:77`): `validate?: (value, formValues) => string | string[] | null`. `field/root/useFieldValidation.js:204-238`: `validate` runs only after native constraints pass, and a non-null result sets `customError`. `Field.Error match="customError"` shows it, and the Base UI `Form` blocks `onSubmit` while any field is invalid (the existing "blocks submit … when the title is cleared" test at `edit-artifact-dialog.unit.test.tsx:87-94` relies on this).
- `src/components/blocks/relative-time.tsx:18-37` — the title attribute is already deferred through `useHydrated` (`src/lib/use-hydrated.ts:9-15`). The text at :35 is not. `src/lib/format-time.ts:9` takes an optional `now`.
- `RelativeTime` call sites (none change): `src/components/artifacts/{gallery.tsx:440,artifact-card.tsx:49,artifact-detail.tsx:225,:269}`, `src/components/account/{settings-view.tsx:227,consent-view.tsx:86}`.
- `src/components/account/reset-password-view.tsx:38` — `navigate({ to: '/sign-in' })` on success.
- `src/routes/sign-in.tsx:9-14` — `validateSearch` returns `{ redirect?: string }` only. `:27-31` passes `redirect` to `SignInView`.
- `src/components/account/sign-in-view.tsx:28-30` — two `useFormAction` tracks, one status slot `signIn.status ?? forgotPassword.status`, rendered at :108. `ActionStatus` is exported from `src/lib/use-form-action.ts:3`.
- Test exemplars: `src/components/artifacts/edit-artifact-dialog.unit.test.tsx`, `src/components/blocks/relative-time.unit.test.tsx`, `src/components/account/sign-in-view.unit.test.tsx`, and `src/routes/sign-in.unit.test.tsx` (it calls `Route.options.*` directly). `src/components/artifacts/gallery.unit.test.tsx:119-124` shows the `vi.useFakeTimers({ toFake: ['Date'] })` pattern for pinning `Date.now()`.

Locked scoping:

- The Day map inserted above the stops after hydration is not fixed here. Plan 36 owns the root fix to how a Day learns its Stops.
- `RelativeTime` takes `suppressHydrationWarning`, not a loader-provided `now`. A shared `now` would thread through six call sites and still freeze the text at server time. The `useHydrated` flip already re-renders every `RelativeTime` once after hydration, so the client's `Date.now()` corrects the text one frame later — the one-level text case the attribute exists for.

Cross-phase rules (from `CLAUDE.md`): kebab-case files; no barrels; tests colocated as `.unit.test.tsx`; forms are Base UI end to end (house `Form` + `Field`, field errors via `Field.Error`, form-level status via `FormStatus`); field errors are declarative state ("Title is required."), never imperatives; semantic tokens only; `/sign-in` is a public route, so a new search param there carries a boolean only, never display text.

Domain skills the executor must follow:

- `/Users/henry/.claude/skills/web-design-guidelines/SKILL.md` — Forms (errors inline next to fields), Hydration safety (`suppressHydrationWarning` only where truly needed; date/time rendering guarded), UI copy (error and status messages name the next step).
- `/Users/henry/.claude/skills/code-comments/SKILL.md` — one why-comment for `suppressHydrationWarning`, folded into the existing component doc comment; no comment restates code.

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before you proceed. Report material drift. Do not replan silently.

## Gate

`pnpm gate` (typecheck, lint with fix, fmt, test) closes every phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If the shell's `node -v` is not 26, prefix with `mise exec --`.

## How to execute

- One phase per fresh session; the user commits between phases.
- The orchestrator dispatches ONE subagent per phase (`Task` tool, `subagent_type: general-purpose`) with this plan's Context, the phase's Decisions/Scope/Acceptance, and the intent. It verifies with the gate and re-prompts the SAME subagent on failure. It does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for user review.

## Phases

1. Whitespace-only title error and RelativeTime hydration.
2. Password-reset confirmation on sign-in.

---

## Phase 1 — Whitespace-only title error and RelativeTime hydration

**Goal**: submitting `'   '` as a title shows the inline "Title is required." and never calls the server fn. Hydrating `RelativeTime` markup rendered a minute earlier raises no recoverable error, and the text updates to the client's value after hydration.

**Decisions**:

- `edit-artifact-dialog.tsx`: add `validate` to the title `Field.Root`. It returns `'Title is required.'` when the value is a string whose `trim()` is empty, otherwise `null`. Add `<Field.Error match="customError">Title is required.</Field.Error>` beside the existing `valueMissing` error. Keep `required`, because it carries the native and ARIA required semantics. Each `Field.Error` stays tied to one constraint, the same as `sign-in-view.tsx:93-94`. No change to `handleSubmit`.
- `titleField` in `artifact-metadata.ts` does not change. It is shared with the MCP `update_artifact` schema, and trimming there changes MCP behavior (see Open questions).
- `relative-time.tsx`: add `suppressHydrationWarning` to the `<time>`. Extend the component doc comment by one sentence: the text is computed from `Date.now()` on both sides, so it may differ at hydration, and the `useHydrated` flip re-renders it with the client clock. No interval ticker.

**Scope**: in — `src/components/artifacts/edit-artifact-dialog.tsx`, `src/components/artifacts/edit-artifact-dialog.unit.test.tsx`, `src/components/blocks/relative-time.tsx`, `src/components/blocks/relative-time.unit.test.tsx`. Out — `artifact-metadata.ts` and the server fns (the client now blocks the input); `use-form-action.ts` (general ZodError formatting is a wider change with no other reachable trigger found); all `RelativeTime` call sites.

**Acceptance**:

- `pnpm gate` exits 0.
- `grep -n 'match="customError"' src/components/artifacts/edit-artifact-dialog.tsx` → one match.
- `grep -n "suppressHydrationWarning" src/components/blocks/relative-time.tsx` → one match.
- Tests to add in `edit-artifact-dialog.unit.test.tsx`, modelled on the cleared-title case at :87-94: set the title to `'   '`, click Save, expect `'Title is required.'`, and expect `updateArtifactMetadataFn` not called. Write it first and watch it fail.
- Tests to add in `relative-time.unit.test.tsx`: pin `Date` with `vi.useFakeTimers({ toFake: ['Date'] })`. Render `renderToStaticMarkup` for a value 30 s old ("just now") into a container, advance the system time by 60 s, then `hydrateRoot` inside `act` with an `onRecoverableError` spy. Expect the spy not called and the text to be `'1m ago'` after hydration. Confirm it fails without the attribute before you add it.
- Manual smoke for the user: open the edit dialog, replace the title with spaces, and press Save. The inline error appears under Title, and no danger alert appears.

---

## Phase 2 — Password-reset confirmation on sign-in

**Goal**: after a successful reset, `/sign-in?reset=true` shows a success status, "Password reset. Sign in with your new password." The status clears as soon as the owner submits or requests another reset link.

**Decisions**:

- `reset-password-view.tsx:38`: `navigate({ to: '/sign-in', search: { reset: true } })`.
- `sign-in.tsx` `validateSearch` return type becomes `{ redirect?: string; reset?: true }`. Include `reset: true` only when `search.reset === true` (TanStack's default search parser JSON-decodes `?reset=true` to a boolean). Omit the key otherwise, so absent stays absent, as it does for `redirect`. Keep the existing `redirect` logic unchanged (plan 02 owns it). `SignInRoute` passes `reset` to `SignInView`.
- `SignInView` gets an optional `reset?: boolean` prop. It holds `const [resetNotice, setResetNotice] = useState(reset ?? false)`. `handleSubmit` and `handleForgotPassword` call `setResetNotice(false)` first. The status slot becomes `signIn.status ?? forgotPassword.status ?? (resetNotice ? RESET_STATUS : null)`, with `RESET_STATUS` a module-level `ActionStatus` constant of kind `'success'`. A local flag, not a seed into `useFormAction`: `run` clears status on every call, so a seeded message would flash back while a later attempt is pending.
- The param stays in the URL. A reload shows the notice again. That is acceptable for a single-owner app, and stripping it would need a replace navigation for no user gain.

**Scope**: in — `src/components/account/reset-password-view.tsx`, `src/routes/sign-in.tsx`, `src/routes/sign-in.unit.test.tsx`, `src/components/account/sign-in-view.tsx`, `src/components/account/sign-in-view.unit.test.tsx`. Out — `sign-in.tsx` redirect validation (plan 02); a new `reset-password-view` test file (the change is one navigate call, and `renderWithRouter` in `testing/router.tsx` exposes no router location to assert on).

**Acceptance**:

- `pnpm gate` exits 0.
- `grep -n "reset: true" src/components/account/reset-password-view.tsx` → one match.
- Tests to add in `src/routes/sign-in.unit.test.tsx`, a `describe('/sign-in validateSearch')` that calls `Route.options.validateSearch`: `{ reset: true }` → `{ reset: true }`; `{ reset: 'true' }` and `{ reset: 1 }` → `{}`; `{}` → `{}`. If plan 02 already added this describe, extend it.
- Tests to add in `sign-in-view.unit.test.tsx`: with `reset`, the success text is present with `role="status"`. Without `reset`, it is absent. With `reset`, fill both fields, mock `authClient.signIn.email` to resolve `{ error: { message: 'Invalid email or password.' } }`, and click "Sign in": the error text is present and the success text is absent. (Fill the fields because `Form` blocks `onSubmit` on empty required fields, so the handler would not run.)
- Manual smoke for the user: request a reset link, open it, and set a new password. The sign-in page shows the success status. Sign in with the new password.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note the deviation in the final summary. Stop and report instead of improvising in these cases:

- a locked decision turns out to be wrong or impossible,
- the work requires touching out-of-scope files,
- acceptance can't be met after a couple of honest attempts.

Specific stop conditions: if happy-dom `hydrateRoot` does not surface the text mismatch through `onRecoverableError` even without the attribute, report it and keep only a static-markup assertion. Do not spy on `console.error` instead. If TanStack's search parser in this router version yields the string `'true'`, not a boolean, report it before you widen the accepted type.

## Done criteria

- [ ] `pnpm gate` exits 0
- [ ] `edit-artifact-dialog.unit.test.tsx` has a whitespace-title case, and it passes
- [ ] `relative-time.unit.test.tsx` has a hydration-across-a-minute case, and it passes
- [ ] `sign-in.unit.test.tsx` covers `validateSearch` for `reset`; `sign-in-view.unit.test.tsx` covers the success status
- [ ] `docs/plans/README.md` status row updated

## Open questions

- Should `titleField` become `z.string().trim().min(1).max(200)` so MCP `update_artifact`/publish callers cannot store a whitespace title either? Resolves in a separate plan, not here. Recommended default: no change in this plan. It alters MCP input semantics, and the UI path is closed by Phase 1.
- Should `RelativeTime` re-render on a timer while the page stays open? Recommended default: no. Every navigation and `router.invalidate()` re-renders it already, and a ticker adds a shared interval for cosmetic gain.
