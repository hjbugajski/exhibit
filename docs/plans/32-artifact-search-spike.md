# Plan 32 — Direction spike: search beyond titles (description LIKE now, FTS5 later)

Phase 1 widens the existing `query` filter from the title to title or description, for both the MCP `list_artifacts` tool and the owner gallery, with no schema change. Phase 2 is a measurement spike on a seeded scratch database. Its only deliverable is a written FTS5 design plus a go/no-go verdict, appended to this file. No body-search code ships from this plan: a "go" verdict becomes a follow-up plan.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: M
- **Risk**: LOW. Phase 1 is one SQL condition plus copy; Phase 2 commits no source. Migration and write-path risk belong to the follow-up plan Phase 2 may recommend.
- **Depends on**: none

## Why this matters

`list_artifacts` tells Claude to "check what already exists before publishing something similar" (`src/lib/mcp/server.ts:441`), but its only search input matches the title (`:443`). The owner gallery has the same limit (`src/components/artifacts/gallery.tsx:123`, `:126`). Titles are picked one conversation at a time, so dedupe and "where was that thing about X" both fail unless X is in the title. Descriptions (up to 2000 chars, `src/lib/artifact-metadata.ts:16`) already exist and cost nothing to search. Body search is the larger win, but bodies are spec JSON, markdown, or hostile HTML, so raw-body LIKE matches markup, not content. The spike decides whether an extracted-text FTS5 index earns its migration.

## Context

- `src/database/repository.ts:432-434` the only search condition: `title like %escapeLike(query)% escape '\'`. `escapeLike` at `:154-159`. The `listArtifacts` doc at `:413-416` says `query` substring-matches the title. SQLite `LIKE` is ASCII-case-insensitive only; that stays.
- `artifacts.description` is nullable (`src/database/schemas/artifact.ts:9`). `NULL LIKE x` is NULL, so an `or(...)` with the title condition excludes null-description rows correctly with no `coalesce`.
- Callers of `listArtifacts`: `listArtifactsFn` (`src/lib/artifacts.ts:61-68`, gallery) and the `list_artifacts` handler (`src/lib/mcp/server.ts:477-486`). Both pass `query` through unchanged, so a repository change covers both surfaces.
- Gallery `Search` input: `gallery.tsx:115-131`. `src/components/artifacts/home.unit.test.tsx:124` finds it by the label `'Search by title'`.
- Existing query tests: `src/database/repository.unit.test.ts:266-288` (filter combination and a literal `%`). MCP: `src/lib/mcp/server.int.test.ts:379` `describe('list_artifacts')`.
- Write paths an index would have to follow (Phase 2 only): `createArtifact` `repository.ts:221-259`, `insertNextVersion` `:264-288` (shared by `appendVersion` `:291` and `revertToVersion` `:304`), `updateMetadata` `:332-352`, `purgeArtifact` `:646-648` (relies on the `onDelete: cascade` FK at `src/database/schemas/artifact-version.ts:11`). Plan 23 may replace `appendVersion` + `updateMetadata` with one `updateArtifact`; name whichever exists.
- Latest-body subquery pattern to reuse for measurement: `repository.ts:480-490` (with the `maxAnswerScanBytes` guard at `:135`).
- Body walkers: `src/lib/answer-count.ts:40-107` parses spec JSON and walks markdown mdast (`parseMarkdown` with `markdownParseOptions`, `src/lib/markdown-parse-options.ts`). It collects state paths, not text, but its traversal is the model for extraction.
- Migrations run on boot through `openDatabase(path, migrationsFolder)` (`src/database/open.ts:10`, `migrate` at `:32`). drizzle-kit does not model virtual tables; `drizzle-kit generate --custom` (an option in the installed 0.31) adds a journaled migration for hand-written DDL.
- Verified at planning time: the installed better-sqlite3 bundles SQLite 3.53.4 with `ENABLE_FTS5`, and both `unicode61` and `trigram` tokenizers create successfully. No new dependency is needed for FTS5. The repo has no HTML parser dependency.

Overlaps: plan 18 rewrites `server.ts` tool strings and plan 12 edits `gallery.tsx`. Locate by symbol, keep their wording style, and keep this plan's facts (title or description).

Follow repo `CLAUDE.md` (HTML artifacts are hostile; never render, frame, or execute them outside `/render/:id/:n`) and `/Users/henry/.claude/skills/code-comments/SKILL.md`.

If the code has drifted since `ffee99b`, re-check the decision it supports before you proceed. Report material drift. Do not replan silently.

## Gate

`pnpm gate` (typecheck, lint with fix, fmt, test) closes every phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If the shell's `node -v` is not 26, prefix with `mise exec --`.

## How to execute

- One phase per fresh session. The user commits between phases.
- The orchestrator dispatches ONE subagent per phase (`Task` tool, `subagent_type: general-purpose`) with this plan's Context, the phase's Decisions/Scope/Acceptance, and the intent. It verifies with the gate and re-prompts the SAME subagent on failure. It does not edit files itself.
- On success: a short "what changed, what to test" summary, then stop for user review.

## Phases

1. `query` matches title or description (ship).
2. Spike: measure body-search options on a seeded 1k-artifact scratch DB; append an FTS5 design and a go/no-go verdict.

---

## Phase 1 — Query matches title or description

**Goal**: `listArtifacts(db, { query })` returns rows whose title or description contains the query (case-insensitive ASCII, literal `%`/`_`). Every surface that describes the search says so.

**Decisions**:

- `repository.ts:432-434`: build the escaped pattern once, push `or(title like pattern escape '\', description like pattern escape '\')`. Same `escapeLike`, no `coalesce`, no index (a leading-`%` LIKE cannot use one; at single-owner scale the scan is the existing cost).
- `listArtifacts` doc (`:413-416`): "`query` substring-matches the title or the description". No comment restating the `or(...)`.
- `server.ts:443` query describe: `'Case-insensitive substring match on title or description.'` The tool description at `:441` keeps "metadata only, no bodies"; it stays true.
- Gallery `Search`: `aria-label="Search artifacts"`, `placeholder="Search title and description…"`. Update `home.unit.test.tsx:124` to the new label.
- No change to `ListArtifactsInput`, the server-fn validator, or the MCP input schema shape.

**Scope**: in: `src/database/repository.ts`, `src/database/repository.unit.test.ts`, `src/lib/mcp/server.ts`, `src/lib/mcp/server.int.test.ts`, `src/components/artifacts/gallery.tsx`, `src/components/artifacts/home.unit.test.tsx`. Out: body search, schema, migrations (Phase 2 decides); result ranking.

**Acceptance**:

- Gate exits 0.
- `grep -rn "Search by title\|substring match on title\.\|substring-matches the title;" src` → no matches.
- Tests in `repository.unit.test.ts`, next to `:266`: a query that appears only in a description returns that row; a row with a null description and a non-matching title is excluded while a title match still returns; a literal `%` in a description matches literally (model on `:281-288`); a description match on a soft-deleted row stays out of the live listing. Write the description-only case first; it is red before the change.
- Test in `server.int.test.ts` `describe('list_artifacts')`: publish two artifacts, one with `description: 'weekend trip to Kyoto'` and an unrelated title; `list_artifacts` with `query: 'kyoto'` returns exactly that one.
- Manual smoke for the user: type a word that appears only in a description into the gallery search; the artifact shows.

---

## Phase 2 — Spike: body search measurement and FTS5 design

**Goal**: numbers and a design that let the owner approve or reject body search without further research. Output is a `## Phase 2 findings` section appended to this file. No source change survives the phase.

**Decisions**:

- Harness: one throwaway Vitest file, `src/database/search-spike.int.test.ts` (Vitest only includes `src/**`), run with `pnpm vitest run src/database/search-spike.int.test.ts`, deleted before the phase ends. Prototype extractors live in that file too. The database is an on-disk file under `os.tmpdir()` opened with `openDatabase`, so WAL and the migrations match production; in-memory numbers do not count.
- Seed through the repository functions: 1,000 artifacts, 3 versions each, type mix 40% spec / 40% markdown / 20% html. Bodies come from `src/catalog/fixtures` and `scripts/examples`, varied so queries have hits and misses; 20 artifacts carry a latest body near the 1 MB cap. Repeat the query measurements at 5,000 artifacts for headroom.
- Measure `listArtifacts`-equivalent queries, p50 and p95 over 50 runs, at limit 20 and 100, for a hit and for a miss (the full-scan worst case):
  1. Phase 1 title/description LIKE (baseline).
  2. Raw latest-body LIKE via the `:480-490` subquery (cost only; record false positives such as `props`, `div`).
  3. A plain side table of extracted text + LIKE.
  4. FTS5 `trigram` over title, description, extracted text (trigram keeps today's substring semantics; record behaviour for queries under 3 chars).
- Also record: extraction time per body (p95, and max at 1 MB), per-publish write overhead for options 3 and 4, and the DB file size delta.
- Extraction contract for the prototypes and the design: latest version only; server-only module; spec → string prop values from `elements` (skip keys, `type`, `statePath`, URLs); markdown → mdast text nodes plus string values inside `exhibit` fences; html → plain string processing that drops `<script>`, `<style>` and comments, strips tags, decodes common entities. HTML is never rendered, never parsed by a DOM, never executed. No new dependency.
- Budgets: query p95 ≤ 50 ms (miss, limit 100) at 5k; write overhead p95 ≤ 20 ms for bodies ≤ 200 KB and ≤ 250 ms at 1 MB.
- Verdict rule: no-go (Phase 1 suffices) if extraction misses the write budget or HTML needs a parser dependency. Otherwise go, choosing FTS5 unless option 3 meets every budget at 5k with simpler maintenance, in which case recommend option 3 and say why.
- The design section must lock, for a follow-up plan: table DDL and tokenizer; which repository functions maintain it inside their existing transaction (create, next-version insert, metadata update, purge; FTS5 tables have no FK cascade, so name explicit delete or trigger); that soft delete, archive and restore do not touch it (`listArtifacts` keeps filtering on `artifacts`); the migration (`drizzle-kit generate --custom`, hand-written SQL, snapshot unchanged) and how existing rows are backfilled, since SQL cannot run JS extraction; that it is exposed through the existing `query` param with sort-based order and cursor pagination unchanged; and the test seams.

**Scope**: in: this plan file only (the appended section), plus the throwaway harness, deleted before the phase ends. Out: any committed source, schema, migration, or dependency change; the follow-up implementation plan.

**Acceptance**:

- `git status --porcelain -- src testing scripts package.json pnpm-lock.yaml` → empty at phase end.
- Gate exits 0.
- `grep -n "^## Phase 2 findings" docs/plans/32-artifact-search-spike.md` → one match, followed by a results table with every measurement above, the design, and one line that starts `Verdict: go` or `Verdict: no-go` at column 0.

---

## When reality disagrees with the plan

Adapt and keep going when the change still serves the intent, respects the locked decisions, and stays in scope; note the deviation in the final summary. Stop and report instead of improvising when a locked decision turns out wrong or impossible, the work requires out-of-scope files, or acceptance cannot be met after a couple of honest attempts. In Phase 2, a surprising number (for example raw body LIKE under budget) is a finding to record, not a reason to ship code.

## Done criteria

- [ ] Gate exits 0
- [ ] `pnpm vitest run src/database/repository.unit.test.ts src/lib/mcp/server.int.test.ts` passes, including the new description-match cases
- [ ] `grep -rn "Search by title" src` → no matches
- [ ] `grep -c "^Verdict: \(go\|no-go\)" docs/plans/32-artifact-search-spike.md` → 1
- [ ] `test ! -e src/database/search-spike.int.test.ts` exits 0 (spike harness deleted)
- [ ] `docs/plans/README.md` status row updated

## Open questions

- Phase 2: should results rank by relevance (FTS5 `bm25`) instead of the chosen sort? Default: no. Ranking breaks the sort-keyed cursor (`repository.ts:194-218`); keep the sort order and treat ranking as a separate decision.
- Phase 2: index every version or only the latest? Default: latest only. Older versions stay browsable but are not what "find that artifact" means.
