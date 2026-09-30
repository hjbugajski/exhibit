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

---

## Phase 2 findings

Measured 2026-09-29 on the working tree after plans 23 and 31 (SQLite 3.53.4 bundled with better-sqlite3 13, macOS, Node 26.10). Harness: a throwaway `src/database/search-spike.int.test.ts` (deleted), on-disk databases under `os.tmpdir()` opened with `openDatabase`, seeded through `createArtifact` + two `updateArtifact` calls (3 versions each). Type mix 40% spec / 40% markdown / 20% html. Bodies built from `src/catalog/fixtures` and `scripts/examples`; 2% of artifacts (20 at 1k, 100 at 5k, spread across all three types) carry a latest body of about 0.98 MB. Every body carries a unique marker word; 40% carry the word `lighthouse`. HTML bodies carry `<style>`, `<script>`, and a comment that contains `lighthouse`, so markup false positives show up. Query timings are p50 / p95 / max over 50 runs after one warm-up, in milliseconds, for the full `listArtifacts`-shaped statement (live, unarchived, `artifact_states` left join, `updated_at desc, id desc`, `limit + 1`).

Queries: hit = `lighthouse` (40% of bodies, no titles), rare = one marker (1 body), miss = `xylophonequartz` (full-scan worst case), short = `zq` (2 characters, in every body).

### Options

- 1: Phase 1 title or description LIKE (baseline, shipped).
- 2: 1 OR the latest body via the `artifact_versions` subquery LIKE.
- 3: 1 OR a plain side table `(artifact_id, extracted text)` LIKE.
- 4a: FTS5 `trigram` over title, description, extracted text; one MATCH.
- 4b: 1 OR `id IN` an FTS5 `trigram` MATCH over extracted body text only (external content on the side table).

### Query latency (p50 / p95, ms)

| Option                  | N   | hit, 20     | hit, 100    | rare, 100     | miss, 20      | miss, 100     | short, 100           |
| ----------------------- | --- | ----------- | ----------- | ------------- | ------------- | ------------- | -------------------- |
| 1 raw SQL               | 1k  | 0.22 / 0.26 | 0.21 / 0.28 | 0.21 / 0.25   | 0.21 / 0.25   | 0.21 / 0.23   | 0.21 / 0.22          |
| 1 via `listArtifacts()` | 1k  | 0.35 / 0.45 | 0.35 / 0.44 | 0.33 / 0.43   | 0.34 / 0.45   | 0.33 / 0.40   | 0.33 / 0.40          |
| 2 raw body LIKE         | 1k  | 0.12 / 0.17 | 2.07 / 2.38 | 17.6 / 18.6   | 17.8 / 18.6   | 17.7 / 18.3   | 0.66 / 0.92          |
| 3 side table LIKE       | 1k  | 0.27 / 0.40 | 2.91 / 3.10 | 13.6 / 14.3   | 13.2 / 13.4   | 13.3 / 13.5   | 0.47 / 0.63          |
| 4a FTS all columns      | 1k  | 1.87 / 2.18 | 2.03 / 2.23 | 0.31 / 0.50   | 0.08 / 0.15   | 0.08 / 0.20   | 0.07 / 0.07 (0 rows) |
| 4b FTS body + meta LIKE | 1k  | 0.54 / 0.71 | 0.64 / 0.77 | 0.64 / 0.77   | 0.27 / 0.32   | 0.27 / 0.34   | 0.24 / 0.26 (0 rows) |
| 1 raw SQL               | 5k  | 1.02 / 1.10 | 0.99 / 1.09 | 0.96 / 1.07   | 0.97 / 1.03   | 0.99 / 1.08   | 0.95 / 1.04          |
| 1 via `listArtifacts()` | 5k  | 1.21 / 1.37 | 1.18 / 1.30 | 1.09 / 1.35   | 1.13 / 1.48   | 1.14 / 1.43   | 1.13 / 1.35          |
| 2 raw body LIKE         | 5k  | 0.12 / 0.17 | 2.10 / 2.32 | 100.8 / 176.4 | 93.2 / 157.1  | 92.0 / 122.6  | 0.63 / 0.78          |
| 3 side table LIKE       | 5k  | 0.85 / 0.99 | 3.79 / 7.78 | 138.2 / 173.6 | 124.5 / 193.3 | 112.8 / 168.1 | 0.53 / 0.80          |
| 4a FTS all columns      | 5k  | 11.1 / 13.4 | 10.2 / 10.6 | 0.60 / 0.73   | 0.28 / 0.34   | 0.27 / 0.32   | 0.26 / 0.33 (0 rows) |
| 4b FTS body + meta LIKE | 5k  | 1.94 / 2.23 | 2.19 / 2.38 | 1.61 / 1.75   | 1.18 / 1.29   | 1.15 / 1.27   | 1.14 / 1.23 (0 rows) |

Budget (miss, limit 100, 5k, p95 ≤ 50 ms): 2 fails (122.6), 3 fails (168.1), 4a passes (0.32), 4b passes (1.27). Options 2 and 3 are fast only when matches are common enough to fill the page early; a rare hit or a miss scans every body. Rows returned matched expectations in every case (21 / 101 for hit, 1 for rare, 0 for miss).

Queries under 3 characters: a trigram MATCH returns no rows (4a and 4b return 0 rows for `zq`, which is in every body). A LIKE on the FTS table falls back to a full scan and does match. Option 4b still applies the title or description LIKE, so a 1 to 2 character query keeps exactly the Phase 1 behaviour; 4a loses it.

### Markup false positives (latest bodies containing the word)

| Word         | N   | Raw body LIKE (option 2) | Extracted text (options 3, 4)                                  |
| ------------ | --- | ------------------------ | -------------------------------------------------------------- |
| `props`      | 5k  | 5000                     | 1000 (the word is in fixture prose)                            |
| `div`        | 5k  | 2361                     | 0                                                              |
| `script`     | 5k  | 2965                     | 1307 (prose)                                                   |
| `statePath`  | 5k  | 1724                     | 0                                                              |
| `lighthouse` | 5k  | 3000                     | 2000 (the correct count; the other 1000 were in HTML comments) |

Raw body LIKE matches every spec body for `props`, and every HTML body for words inside comments, scripts, and styles. It is not a usable search even at a size where it would be fast.

### Extraction

Prototype contract (kept for the design): spec → string values under each element's `props`, skipping `type`, `statePath`, `href`, `src`, `url`, `id` and values starting with `http:`, `https:`, `mailto:`, `data:` or `/`; markdown → `parseMarkdown` with `markdownParseOptions` and `commentComponentsExtension`, collecting `text` and `inlineCode` values, string values under `exhibit` fence `props`, and directive attribute strings (the last is a deviation from the plan's list; directive attributes such as a Card `title` are rendered content); html → regular expressions only: drop comments, then `script`, `style`, `template`, `noscript` elements (an unclosed one runs to end of input), replace every tag with a space, decode named, decimal and hex entities, collapse whitespace. The HTML path uses no parser, no DOM, and no dependency. Its output is only a match target, never rendered or returned, so leaked fragments from malformed markup cost precision, not safety.

| Body                     | Extraction p50 / p95 / max (ms) |
| ------------------------ | ------------------------------- |
| All latest bodies, 5k    | 0.03 / 0.20 / 66.8              |
| Spec ≈ 1 MB (5k set)     | 5.1 / 16.6 / 20.1               |
| Markdown ≈ 1 MB (5k set) | 35.1 / 63.1 / 66.8              |
| HTML ≈ 1 MB (5k set)     | 12.9 / 33.4 / 38.4              |

### Write overhead per publish (1k database, index populated)

Overhead = extraction + the index write, each write in its own transaction. Baseline = the existing `updateArtifact` body append, for scale.

| Bodies                 | Baseline `updateArtifact` p50 / p95 | Extract p95 | Option 3 overhead p50 / p95 / max | Option 4b overhead p50 / p95 / max |
| ---------------------- | ----------------------------------- | ----------- | --------------------------------- | ---------------------------------- |
| ≤ 200 KB (300 samples) | 0.26 / 0.45                         | 0.20        | 0.07 / 0.23 / 6.3                 | 0.36 / 1.75 / 13.4                 |
| ≈ 1 MB (20 samples)    | 4.62 / 12.07                        | 26.2        | 13.4 / 35.7 / 40.4                | 77.3 / 116.9 / 124.4               |

Budgets: ≤ 20 ms p95 at ≤ 200 KB (4b: 1.75, passes); ≤ 250 ms at 1 MB (4b: max 124.4 including extraction; the cold 1 MB markdown extraction max was 66.8, so the worst case stays under 170, passes). The FTS upsert of a 1 MB text dominates (p95 94.5 ms).

### Size

| N   | DB before | Latest bodies | Extracted text | Side table delta | Body FTS delta (4b) | All-column FTS delta (4a) |
| --- | --------- | ------------- | -------------- | ---------------- | ------------------- | ------------------------- |
| 1k  | 30.4 MB   | 22.3 MB       | 17.1 MB        | +17.5 MB         | +52.6 MB            | +56.9 MB                  |
| 5k  | 151.2 MB  | 111.3 MB      | 83.2 MB        | +85.1 MB         | +253.4 MB           | +258.7 MB                 |

The trigram index is about 3x the extracted text, and 4b adds the side table (1x) on top, so 4b costs about 4x the extracted latest-body text. The synthetic set is a worst case: the 2% of artifacts near 1 MB hold about 90% of the text. For typical 3 to 20 KB artifacts the absolute cost is small (about 60 KB of index per 15 KB artifact). Initial FTS backfill insert time: 1.35 s at 1k, 12.2 s at 5k.

### Drizzle-kit and the drift gate (verified on a scratch copy of the schemas and migrations)

`drizzle-kit generate --custom --name artifact_search` (0.31.11) writes an empty `0005_artifact_search.sql`, a journal entry, and a `0005_snapshot.json` whose body equals `0004_snapshot.json` (only `id` / `prevId` and key order differ). With the DDL below pasted into that file, the drizzle migrator applies it (statements split by `--> statement-breakpoint`; a trigger's `BEGIN … END` is one statement), and a following `drizzle-kit generate` reports "No schema changes, nothing to migrate", so the CI drift gate stays clean. drizzle-kit reads only `src/database/schemas`, so tables that are not declared there are invisible to it. The same scratch check confirmed that deleting an `artifacts` row cascades into the side table and fires the delete trigger (FTS `integrity-check` passes, the text no longer matches).

### Design (locked for the follow-up plan)

- Shape: option 4b. A side table holds the extracted text of the latest version; an external-content FTS5 `trigram` table indexes it; triggers on the side table keep the index in sync. Title and description stay on the Phase 1 LIKE. Reasons over 4a: metadata updates never touch the index, 1 to 2 character queries keep their Phase 1 results, the common-hit query is about 4x faster at 5k (2.4 vs 10.6 ms p95, limit 100), and deletes key on an integer rowid instead of scanning an `UNINDEXED` text column.
- DDL, in one custom migration (`pnpm db:generate --custom --name artifact_search`, hand-written SQL, snapshot unchanged):

```sql
CREATE TABLE `artifact_search_text` (
	`rowid` integer PRIMARY KEY,
	`artifact_id` text NOT NULL UNIQUE REFERENCES `artifacts`(`id`) ON DELETE cascade,
	`body` text NOT NULL
);
--> statement-breakpoint
CREATE VIRTUAL TABLE `artifact_search` USING fts5(body, content='artifact_search_text', content_rowid='rowid', tokenize='trigram');
--> statement-breakpoint
CREATE TRIGGER `artifact_search_text_ai` AFTER INSERT ON `artifact_search_text` BEGIN
  INSERT INTO artifact_search(rowid, body) VALUES (new.rowid, new.body);
END;
--> statement-breakpoint
CREATE TRIGGER `artifact_search_text_ad` AFTER DELETE ON `artifact_search_text` BEGIN
  INSERT INTO artifact_search(artifact_search, rowid, body) VALUES ('delete', old.rowid, old.body);
END;
--> statement-breakpoint
CREATE TRIGGER `artifact_search_text_au` AFTER UPDATE ON `artifact_search_text` BEGIN
  INSERT INTO artifact_search(artifact_search, rowid, body) VALUES ('delete', old.rowid, old.body);
  INSERT INTO artifact_search(rowid, body) VALUES (new.rowid, new.body);
END;
```

- The side table is not declared in `src/database/schemas`. If drizzle-kit owned it, a future table-recreate migration would drop it with its triggers. Declare the drizzle table object for queries in the search module instead, outside the schemas folder.
- Tokenizer: `trigram` with defaults (`case_sensitive 0`, no diacritic removal). It keeps substring semantics; case folding becomes Unicode-aware for body matches, which is a widening of today's ASCII-only LIKE, not a narrowing.
- Extraction: one server-only module, `src/database/search-text.ts`, implementing the contract in "Extraction" above, latest version only. It uses relative imports (see the backfill below), and `src/lib/markdown-parse-options.ts` is already dependency-free.
- Write paths, inside their existing transactions: `createArtifact` inserts the row; `insertNextVersion` (shared by `updateArtifact` with a body and by `revertToVersion`) upserts with `INSERT … ON CONFLICT(artifact_id) DO UPDATE SET body = excluded.body`. Never `INSERT OR REPLACE`: the REPLACE deletion does not fire delete triggers unless `recursive_triggers` is on, which would orphan index entries. `updateArtifact` without a body writes nothing to the index. `purgeArtifact` needs no code: the FK cascade deletes the side row and its delete trigger updates the FTS index (verified).
- Not touched: `softDeleteArtifact`, `restoreArtifact`, `setArtifactArchived`, `setArtifactState`, tag writes. `listArtifacts` keeps filtering liveness and archive on `artifacts`, so a soft-deleted or archived row's index entry is harmless.
- Backfill: SQL cannot run the extractor, so the migration only creates the schema. A boot step `backfillSearchText(sqlite)` in `src/database/search-text.ts`, called from `src/database/index.ts` right after `openDatabase`, inserts rows for every artifact that has none (`WHERE NOT EXISTS`). It is idempotent and a no-op after the first boot. `index.ts` is on the plain-`node` seed chain, which is why the module must use relative imports. Re-indexing after an extractor change is a later custom migration with `DELETE FROM artifact_search_text;`, which the next boot refills.
- Query: exposed only through the existing `query` param; no new input, same sort, same cursor. For a query of 3 or more characters, the condition becomes `(title LIKE p OR description LIKE p OR artifacts.id IN (SELECT t.artifact_id FROM artifact_search f JOIN artifact_search_text t ON t.rowid = f.rowid WHERE artifact_search MATCH ?))`, with the MATCH argument the query wrapped as one FTS5 phrase (`"` + query with `"` doubled + `"`), so `%`, `_`, `*`, `-`, `AND` stay literal. Under 3 characters, the body branch is omitted (a trigram MATCH cannot match it). No `bm25` ranking.
- Copy: the MCP `query` describe and the gallery placeholder then say title, description, or content. The `list_artifacts` description keeps "metadata only, no bodies" (bodies are searched, never returned).
- Test seams: extractor unit tests per type (spec skipped keys and URLs, markdown text plus fence and directive strings, HTML script, style, comment, entity, unclosed-tag cases); repository tests that a body-only word finds the artifact after create, after update, after revert, and not after purge; that a metadata-only update leaves the index unchanged; that a 2-character query still matches titles; a migration test that the triggers and the virtual table exist and that `INSERT INTO artifact_search(artifact_search) VALUES ('integrity-check')` passes after a write sequence; a backfill test on a database seeded without index rows.

Verdict: go. Build the FTS5 `trigram` body index (option 4b) in a follow-up plan: extraction meets both write budgets without a parser dependency, and the only LIKE-based body option (3) misses the 5k query budget by more than 3x.

What would change the verdict: a real-corpus measurement where the extracted text is much larger than this synthetic set (index size about 4x the text becomes the binding cost; a `unicode61` word index is about a third of the size but drops substring matching); a requirement to return snippets or rank by relevance (needs `bm25` and a different cursor); or a publish-latency requirement under 120 ms for 1 MB bodies (move extraction and the FTS write out of the publish transaction into a deferred job).

Owner decisions for the follow-up plan:

- Accept an index of about 4x the extracted latest-body text on disk.
- Accept that 1 to 2 character queries search title and description only.
- Accept Unicode case folding for body matches while titles and descriptions stay ASCII-only LIKE.
