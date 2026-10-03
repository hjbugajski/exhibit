# Plan 18 — Writing sweep: MCP tool descriptions, catalog copy, error messages, README

Rewrite the text that Claude and the owner read so it meets the house writing standard: the 12 MCP tool descriptions and their error strings, the catalog descriptions that `get_catalog` serves, the owner-facing error fallbacks and docs copy, and `README.md` with `.env.example`. Every fact, limit, and condition survives. This plan changes no behavior, no identifiers, no tool schemas, and no code comments except the one in `docs-view.tsx` that it makes stale.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: M
- **Risk**: LOW. The `get_catalog` payload sits within a few tokens of the budget test's ceiling (15,949 characters against 15,999 at `ffee99b`; plans 34–36 move both numbers), so Phase 2 must not grow the payload beyond the size measured at its own start (see Phase 2).
- **Depends on**: none

## Why this matters

Claude reads the tool descriptions on every MCP connection and cannot ask what they mean. Most of them have sentences over 25 words. The rules that decide whether a publish succeeds are buried mid-sentence: the zero-network CSP, which body key matches which artifact type, and what directive attributes can carry. The catalog example `Day 1 — Saturday` teaches Claude to put em dashes into labels the owner sees. Several owner-facing errors say what failed but not what to do next.

## Context

- `src/lib/mcp/server.ts`: tool `description` strings at `:156` (publish_spec), `:206` (publish_html), `:254-256` (publish_markdown, with `ALLOWED_FAMILIES` concatenated in), `:295` (get_catalog), `:310` (update_artifact), `:405`, `:441`, `:503`, `:521` (manage_tags), `:574`, `:628`, `:658`. Error strings at `:70`, `:77`, `:110`, `:125`, `:342`, `:358`, `:554`.
  - The owner-only-URL sentence repeats at `:156`, `:206`, and `:256`. The revise-with-update_artifact sentence repeats in all three publish descriptions.
  - `:441` says "pass `archived: true`" and `:628` says "ask for `archived: true`". These are the same act. "Providing `spec`…" at `:310` is a different act (sending a body).
  - `:295` "unless validation errors surprise you" is a condition an agent cannot check. `:521` has a comma splice and "you get affected 0".
- `src/lib/mcp/server.int.test.ts` matches these substrings, so they must survive: `'1 MB'` (`:130`, `:165`, `:208`), `'a spec payload instead'` (`:297`), `'at most one'` (`:314`), `'no version 7'` (`:364`), `'list_artifacts'` (`:371`), `'Renamed tag "trips" to "travel" on 1 artifact.'` (`:618`), `'requires a non-empty "to"'` (`:653`, `:676`), `'<html>'` (`:156`), `'WIRE FORMAT'` (`:217`). No test reads description text.
- `src/lib/mcp/limits.ts:15` is the size error for all four body paths. The label is `spec`, `html`, or `markdown`. The doc comment at `:1` belongs to plan 16.
- `src/catalog/catalog.ts`: 18 lines have em dashes. 15 are in description strings (`:138` to `:638`) and 3 are comments (`:6`, `:11`, `:51`). 26 lines have `e.g.`. Other issues: dash ranges at `:117`, `:120`, `:459`, `:464`, `:508`, `:606`, and `:630` (`"May 3 - May 8, 2026"`); `via` at `:382`, `:548`, `:588`, `:606`; "Change vs a prior period" at `:255`; `just` at `:260`; a trailing `...` at `:356`.
- `src/lib/mcp/catalog-summary.ts:84` joins every described prop as `` `${type} — ${description}` ``, which puts 65 em dashes in the payload. `catalog-summary.unit.test.ts:7-12` fails when `text.length / 4 >= 4000`. At `ffee99b` the text is 15,949 characters (measured).
- `src/catalog/fixtures/itinerary.ts:19` and `:65` hold the labels `Day 1 — Saturday` and `Day 2 — Sunday`. The trimmed Day 1 is the first `get_catalog` example. `src/catalog/registry.unit.test.tsx:40` and `src/components/artifacts/artifact-detail.unit.test.tsx:121` assert the Day 1 label.
- `src/catalog/validate.ts:123`: the duplicate-statePath error uses future tense and an em dash. Plan 06 Phase 4 reworks the statePath rules in this file.
- Owner-facing copy:
  - `src/components/docs/docs-view.tsx`: the doc comment at `:10-14` says "update both", but `README.md:46-59` is a third copy of the tool table. Em dashes at `:17` and `:24`. The connector steps at `:81-83` are one 3-instruction sentence. The example requests at `:99-102` are a non-parallel inline list. Revocation wording is at `:135-137`.
  - `src/components/account/settings-view.tsx`: revocation wording at `:236` (dialog) and `:253` (card); "via OAuth" at `:252`. Fallback errors with no next step at `:32`, `:75`, `:147`.
  - Other fallbacks: `consent-view.tsx:50`, `reset-password-view.tsx:33`, and `sign-in-view.tsx:52`, all in `src/components/account/`.
  - Exemplar that follows the rule: `artifact-detail.tsx:132` "Could not save your changes. Try again."
  - `src/components/markdown/catalog-dispatch.tsx:143` has an em dash and raw backticks in a rendered error. `src/components/artifacts/gallery.tsx:340` has "via MCP". `src/components/catalog/quote.tsx:21` renders `— {attribution}`. That dash is typographic by design, so keep it.
- `README.md`:
  - The `## Quick start` heading at `:13` and "the quick start" at `:141`.
  - Word-level fixes: `…` at `:7`, `via` at `:72`, `e.g.` at `:73`, an em dash at `:112`, "not just hidden" at `:136`, and `via` at `:141`.
  - Long sentences at `:33` (about 45 words) and `:61` (about 40 words). `:129` opens with the fragment "Single-user app, so…". Bare `...` placeholders at `:162`.
- `.env.example`: "login" at `:27` and `:42`, but the UI says "Sign in". Also: the `NOTE:` opener at `:6`, em dashes at `:7` and `:28`, `e.g.` at `:31` and `:42`, and "sessions/tokens" at `:1`.
- Other plans edit some of the same files: plan 08 (`server.ts` handlers), 06 (`validate.ts` messages), 02 (`sign-in-view.tsx:76`), 01/04/05/09 (`README.md`), and 36 (Itinerary/Day descriptions). Sweep the text that exists when you execute. Find it by symbol and grep, not by line number.
- Comments with em dashes are out of scope, except `docs-view.tsx:10-14`. Plans 16 and 17 own comment prose.

Cross-phase rules (from CLAUDE.md): semantic tokens only, no `dark:` or `/NN` alpha in the new list markup; never add a lint-disable comment. Don't start dev servers or run installs.

Executors must follow these skill files:

- `/Users/henry/.claude/skills/writing-style/SKILL.md` (core rules, process, boundaries)
- `/Users/henry/.claude/skills/writing-style/references/controlled-english.md` (for Phases 1 and 2 and every Claude-facing error: agent-parsed text)
- `/Users/henry/.claude/skills/writing-style/references/checklist.md` (run it on every changed string)
- `/Users/henry/.claude/skills/writing-style/references/word-list.md`
- `/Users/henry/.claude/skills/code-comments/SKILL.md` (for the one comment edit)

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before you proceed. Report material drift. Don't silently replan.

## Gate

`pnpm gate` (typecheck, lint --fix, fmt, test) closes every phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If `node -v` differs from `mise current`, prefix commands with `mise exec --`.

## How to execute

- One phase per fresh session. The user commits between phases.
- The orchestrator dispatches one subagent per phase (`Task`, `subagent_type: general-purpose`) with this plan's Context and the phase block. It verifies with the gate and re-prompts the same subagent on failure.
- On success, the subagent returns a "what changed, what to test" summary with the fact list for that phase, then stops.

## Phases

1. MCP tool descriptions and server error strings
2. Catalog descriptions, `get_catalog` separator, and the itinerary example
3. Owner-facing UI copy and error fallbacks
4. `README.md` and `.env.example`

---

## Phase 1 — MCP tool descriptions and server error strings

**Goal**: all 12 descriptions, every `.describe()` string, and every error string in `server.ts` and `limits.ts` pass controlled-english.md. No fact is lost.

**Decisions**:

- Sentence rules:
  - At most 20 words per sentence, or 25 for a purely descriptive one. The condition comes first, with one instruction per sentence.
  - Write "because", not "since", for a cause.
  - Use "pass" for giving a parameter value, including `archived: true` at `:441` and `:628`. Use "call" for invoking a tool.
  - Don't use: em dashes, `e.g.`, `vs`, `via`, `currently`, `quickest`, "reach for", or a trailing `...`. Use the serial comma.
- Wherever a description has three or more parallel rules, write them as a `\n- ` list inside the string. This applies to: publish_html's three CSP rules, publish_markdown's rendering rules and its two embedding modes (numbered `1.`/`2.`), and update_artifact's body-key-to-type mapping.
- Add a module-level `const PUBLISH_RESULT_DESCRIPTION`. Its sentences say:
  - the tool returns the id and url;
  - the url opens only for the gallery owner, because it requires the owner's session, so it is not a link to share;
  - to revise the artifact, call `update_artifact` with its id instead of publishing again.

  All three publish descriptions end with it through a template literal.

- get_catalog: replace the "surprise you" clause with "The result does not change within a session. One call per session is enough." manage_tags: fix the comma splice. Say "the result reports `affected: 0`".
- Error strings:
  - `:342` becomes "Pass at most one body payload; …" and `:358` ends "Pass a/an … payload instead." These are the "pass" verb, and they keep the asserted substrings.
  - At `:554`, split at the em dash.
  - `limits.ts:15` becomes `` `The ${label} body is ${n} bytes, which exceeds the 1,000,000-byte (1 MB) limit. Shorten the body, or split the content across several artifacts.` ``
- Facts that must survive, word-for-word where they are syntax:
  - CSP: fetch, XHR, and WebSocket are blocked, and the page needs zero network calls. Scripts and styles are inline or come from `cdnjs.cloudflare.com`. Images and fonts can use any `https:` URL or a `data:` URI. The document needs `<html>`, `<head>`, and `<body>`.
  - Markdown: GFM tables, task lists, strikethrough, footnotes, and highlighted fences. Raw HTML shows as literal text, and bare URLs do not autolink. Links render only for http(s) and images only for https. Anything else is dropped.
  - Directives: both directive forms keep their exact example syntax. Attributes are flat strings, so Grid and Tabs cannot be directives. The `exhibit` fence keeps its JSON shape. Keep `ALLOWED_FAMILIES` and the fallback, and the statePath persistence.
  - Tools:
    - update_artifact: the type match, at most one body, metadata-only calls create no version, both kinds of change can be combined, and old versions stay browsable.
    - list_artifacts: `archived: true` returns only archived artifacts.
    - manage_tags: a rename merges into an existing tag, the scope includes archived and deleted artifacts, and an unused tag is not an error.
    - delete_artifact: the call is idempotent.
- Size: the combined length of the 12 descriptions can grow at most 10% over the `ffee99b` total. Report the before and after totals.

**Scope**: in: `src/lib/mcp/server.ts` strings only, `src/lib/mcp/limits.ts:15`, and `src/lib/mcp/server.int.test.ts` only if an asserted substring must change. Out: schemas, annotations, handler logic (plan 08), and the `limits.ts:1` doc (plan 16).

**Acceptance**:

- `pnpm vitest run src/lib/mcp` → all pass.
- `grep -n "—\|e\.g\.\|currently\|quickest\|surprise you\|affected 0\|ask for \`archived" src/lib/mcp/server.ts | grep -v "^[0-9]*: *\(//\|/\*\|\*\)"` → no matches.
- `grep -c "PUBLISH_RESULT_DESCRIPTION" src/lib/mcp/server.ts` → `4`.
- The summary includes a per-tool before/after fact list with no fact missing.

---

## Phase 2 — Catalog descriptions, `get_catalog` separator, and the itinerary example

**Goal**: every `description` and `.describe()` string in `catalog.ts`, the summary separator, the itinerary fixture labels, and the validate.ts messages meet the standard. The `get_catalog` payload does not grow.

**Decisions**:

- Separator: `catalog-summary.ts:84` uses `. ` in place of `—`. This saves one character per described prop, which pays for the rewrites.
  - `-` saves nothing.
  - `: ` would read as a second `key: type` pair.
  - Keep the `; ` join.
- Budget: measure `buildCatalogSummary().text.length` at phase start with a throwaway assertion (not committed); after the phase it must be ≤ that measured value. Don't raise the test ceiling. If the rewrites run long, trim wording such as "the primary workhorse" and "Use sparingly — …".
- Replacements in strings:
  - Em dash → period, colon, or semicolon.
  - `e.g.` → "such as".
  - Ranges → "to", as in "1 to 4". The zoom range becomes "1 (world) to 18 (street)".
  - `via` → "through".
  - "Change vs" → "Change from".
  - `just` → "only".
  - Finish the `1, 2, 3, ...` list or reword it.
  - Keep sample values in quotes as they are, except the em-dash label.
- Labels: `catalog.ts:638` shows `"Day 1: Saturday"`. `fixtures/itinerary.ts` uses `Day 1: Saturday` and `Day 2: Sunday`. Update the two test assertions to match.
- `validate.ts:123` reads: `statePath "${path}" is used by ${n} elements (${keys}). They share one saved state. Give each interactive element a unique statePath.` If plan 06 has landed, apply the same rules to its prefix-conflict message. Check the messages at `:182` and `:214` too.

**Scope**: in: `src/catalog/catalog.ts` strings, `src/lib/mcp/catalog-summary.ts:84`, `src/catalog/fixtures/itinerary.ts`, `src/catalog/validate.ts` messages, `src/catalog/registry.unit.test.tsx`, and `src/components/artifacts/artifact-detail.unit.test.tsx`. Out: comments in these files (plans 16 and 17), plus `src/components/library/demos/*` and `scripts/examples/*`, which are dev-only content.

**Acceptance**:

- `pnpm vitest run src/lib/mcp/catalog-summary.unit.test.ts src/catalog src/components/artifacts` → all pass.
- `grep -n "—\|e\.g\.\|[0-9] *[-–] *[0-9A-Z]\| via " src/catalog/catalog.ts | grep -v "^[0-9]*: *\*"` → no matches (the range pattern covers the hyphen and en dash ranges and `"May 3 - May 8"`).
- `grep -c "—" src/lib/mcp/catalog-summary.ts` → `2` (the comments at `:110` and `:155`).
- `grep -rn "Day [12] —" src/catalog src/components/artifacts` → no matches.
- The summary reports the payload length before (15,949) and after.

---

## Phase 3 — Owner-facing UI copy and error fallbacks

**Goal**: the docs page, the settings copy, the gallery empty state, and every "Could not…" fallback meet the UI-copy rules. Each error states a known next step.

**Decisions**:

- Revocation wording is canonical. Use these two sentences, identical in `docs-view.tsx` (Manage connections) and in the settings dialog (`:236`): "Revoking deletes the client’s registration and tokens, so its access ends immediately, even for tokens it already holds. The client can reconnect later by authorizing again." The settings card (`:253`) uses the first sentence only.
- `docs-view.tsx`:
  - The connector setup (`:81-83`) becomes an `<ol>` with three steps:
    1. Open **Settings → Connectors → Add custom connector** in the claude.ai web, desktop, or mobile app.
    2. Paste the server URL.
    3. Complete the sign-in and consent prompts as the gallery owner.

    The HTTPS sentence and the `CopyField` follow the list.

  - The example requests (`:99-102`) become a `<ul>` of four parallel imperative items, introduced by a full sentence and a colon. Keep the same four examples.
  - Remove the em dashes at `:17` and `:24`.
  - Rewrite the comment at `:10-14` to name the three copies: this table, the `server.ts` descriptions, and `README.md`'s tool table.
- `via` becomes "through" at `settings-view.tsx:252` and `gallery.tsx:340`.
- Fallbacks, exact text:
  - `consent-view.tsx:50`: "Could not process consent. Start the connection again from Claude."
  - `reset-password-view.tsx:33`: "Could not reset the password. Request a new reset link from the sign-in page."
  - `sign-in-view.tsx:52` and `settings-view.tsx:32`, `:75`, `:147`: the existing sentence plus " Try again."
- `catalog-dispatch.tsx:143`: 'This exhibit block is not a JSON object with a "type" field. Write it as { "type": ComponentName, "props": { … } }.' This removes the em dash and the raw backticks.

**Scope**: in: `docs-view.tsx`, `settings-view.tsx`, `consent-view.tsx`, `reset-password-view.tsx`, `sign-in-view.tsx`, `catalog-dispatch.tsx`, and `gallery.tsx` (strings, plus list markup in docs-view). Out: `quote.tsx:21`, other comments, and the flow and behavior of the form.

**Acceptance**:

- `pnpm vitest run src/components` → all pass.
- `grep -n "—" src/components/docs/docs-view.tsx` → no matches. `grep -n "via " src/components/account/settings-view.tsx src/components/artifacts/gallery.tsx | grep -v "^[0-9]*: *\(//\|/\*\|\*\)"` → no matches.
- `cat src/components/docs/docs-view.tsx src/components/account/settings-view.tsx | perl -0777 -ne 'print scalar(() = /even\s+for\s+tokens\s+it\s+already\s+holds/g)'` → `2` (multiline match, because oxfmt wraps JSX text).
- Manual smoke (user): open `/docs` and `/settings`. Both lists render, the revoke dialog body reads as two sentences, and both themes look right.

---

## Phase 4 — `README.md` and `.env.example`

**Goal**: both files pass the markdown-document rules, and the product term is "sign-in" everywhere.

**Decisions**:

- `## Quick start` becomes `## Run with Docker`. At `:141`, "the quick start" becomes a link to `#run-with-docker`.
- Split `:33` and `:61` into sentences of 25 words or fewer. Keep every fact, including the rootless-Docker `chown` caveat and the per-request re-check.
- Other word-level fixes:
  - `:61` reuses the canonical revocation sentence from Phase 3.
  - `:7`: finish the list, with no `…`.
  - `:73`: "for example".
  - `:112`: period.
  - `:136`: "not only hidden".
  - `:129`: a sentence with a subject ("Exhibit has one user, so…").
  - `:72` and `:141`: "through".
  - `:162`: `OWNER_EMAIL=owner_email OWNER_PASSWORD=owner_password`.
- `.env.example`:
  - "login" becomes "sign-in" (`:27` "the sign-in page", `:42` "sign-in and reset rate limiting").
  - Drop `NOTE:`, remove the em dashes, and write "for example".
  - "sessions and tokens" at `:1`.
  - Values and keys stay unchanged.
- Facts stay as they are, even where they look stale, because plan 16 owns factual corrections (including "28-component") and plan 28 owns the nitro note.

**Scope**: in: `README.md` and `.env.example`. Out: the facts in tables (word-level fixes in cells, such as `:72` and `:73`, are in), commands, and variable names.

**Acceptance**:

- `pnpm fmt:check` → exit 0 (oxfmt formats the tables).
- `grep -n "—\|e\.g\.\|Quick start\|just \| via \|=\.\.\." README.md` → no matches. `grep -n "login\|—\|e\.g\.\|NOTE:" .env.example` → no matches.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope. Note each deviation in the final summary. Stop and report instead of improvising when:

- a locked decision is wrong or impossible,
- the work requires touching out-of-scope files,
- acceptance can't be met after a couple of honest attempts.

This plan also has a sweep-specific stop rule. If a rewrite must choose between the 20-word cap and keeping a condition or caveat, keep the longer sentence and list it in the summary. A dropped fact is a failed phase.

## Done criteria

- [ ] `pnpm gate` exits 0 after each phase
- [ ] Every grep in the four Acceptance blocks returns its expected result
- [ ] `buildCatalogSummary().text.length` ≤ the value measured at Phase 2 start, and `catalog-summary.unit.test.ts` passes with its ceiling unchanged
- [ ] Each phase summary carries its fact list, and no fact is missing
- [ ] `docs/plans/README.md` status row updated

## Open questions

- Phase 2: should `catalog-summary.ts` list each prop on its own `- ` line instead of joining with `; `? That would also fix the `.; ` artifacts (36 in the payload). Default: no. It costs about 1 character per prop, and the budget cannot absorb it.
- Phase 2: should the dev-only `catalog-itinerary.tsx` demo and `scripts/examples/road-trip.ts` get the same `Day N: Weekday` labels? Default: no, they are out of scope. Take them up in a later sweep if the owner wants them to match.
