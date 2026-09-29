# Plan 21 — Precompressed assets, lighter detail-route graph, parallel PR CI

Serve brotli and gzip variants of the built client assets from Nitro, and tell operators to compress dynamic responses at the proxy. Remove zod and `@json-render/core` from the artifact-detail route's static import graph, so an html artifact never downloads them. Let the PR `test` and `docker` jobs start without waiting for `lint`. This plan does not add runtime compression middleware, lazy-load `HighlightedCode`, or tune pnpm's install.

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: S
- **Risk**: MED. `@json-render/core` has no zod-free entry point, so store creation becomes an awaited dynamic import (Phase 4), which touches the interaction-state save path. Phases 1–3 are LOW.
- **Depends on**: docs/plans/28-\*.md (the nitro package swap may change the config types and the static handler that Phase 1 relies on)

## Why this matters

Caddy and Traefik do not compress proxied responses by default. Stock nginx compresses only `text/html`. With these defaults every JS/CSS asset goes out raw: the maplibre chunk is about 1 MB raw and about 260 KB gzip, and `styles.css` is about 127 KB raw and about 21 KB gzip. The detail route also statically loads zod and json-render's core. An html artifact never uses them, and they cost roughly 37 KB gzip on first view (approximate, from an unverified scratch build). PR CI runs two full `pnpm install`s in series, which is about half of the roughly 4m20s wall clock.

## Context

- `nitro.config.ts:8-22`: Nitro options (`experimental`, `modules`). Nitro's config loader reads this file alongside `vite.config.ts:14-22`'s inline `nitro({ plugins })` (comment at `nitro.config.ts:4-7`).
- `node_modules/nitro/dist/types/index.d.mts:1612-1621`: `compressPublicAssets: boolean | CompressOptions`. `:2073-2080`: `CompressOptions { gzip?, brotli?, zstd? }`. `true` enables all three.
- `node_modules/nitro/dist/_build/common.mjs:8463-8510`: `compressPublicAssets` writes `.gz`/`.br`/`.zst` siblings into the public output dir. It skips files under 1024 bytes, `.map` files, and non-compressible MIME types. `copyPublicAssets` calls it at `:8602`, and the Vite build calls that at `node_modules/nitro/dist/vite.mjs:110`, before the server build. So the server's public-asset manifest includes the variants.
- `node_modules/nitro/dist/runtime/internal/static.mjs:16-17`: the handler maps `Accept-Encoding` tokens to suffixes and sorts them, so `.br` < `.gz` < `.zst`. A browser that accepts `br` never gets a `.zst` file. `:35-36` appends `Vary: Accept-Encoding`.
- `README.md:90`: deploy step 3 ("point an HTTPS reverse proxy … at port 3000"). `README.md:102-106`: "Auth and proxy notes" bullet list.
- `.github/workflows/ci.yml:10-25`: the `lint` job (install `:22`, then fmt/lint/typecheck). `:26-27`: `test` has `needs: lint` and installs again at `:36`. `:38-39`: `docker` has `needs: lint`. `needs: lint` dates from the initial commit (`c5b2aef`), and no commit gives a reason for it.
- `src/lib/artifact-metadata.ts:1`: imports zod. `:15-19`: zod field schemas are built at module scope. `:24-49`: `normalizeTags` and its doc comment. `:11-12`: the comment says the client imports `normalizeTags`. Importers: `src/components/artifacts/edit-artifact-dialog.tsx:14` (client), `src/lib/artifacts.ts:25-32`, `src/lib/mcp/server.ts:24-30`, `src/database/repository.ts:24`, `src/database/repository.unit.test.ts:29`.
- `src/components/artifacts/artifact-detail.tsx:4`: static `createStateStore` from `@json-render/react`, which re-exports core's. `@json-render/core` is itself a direct dependency (`package.json:31`). `:48-52`: the comment says an html artifact downloads neither the catalog nor the renderer; the store import makes that false. `:53-60`: lazy `SpecView`/`MarkdownView`. `:104-114`: seed and version reseed of the store. `:116-158`: the debounced save effect. `:380-393`: the `Suspense` boundary around the views.
- `@json-render/core` exports only `.` and `./store-utils` (its `package.json` `exports`). Both resolve to `dist/chunk-7V7ZCHEJ.mjs`, which imports zod at `:2` and builds zod schemas at module scope. `createStateStore` is at `:626`. No zod-free path exists.
- Detail routes: `src/routes/_authed/a.$id/index.tsx:7-15` (loader), `:26-27` (store comment); `src/routes/_authed/a.$id/v.$n.tsx:8-22`, `:33-34`. `src/router.tsx:17` sets `defaultPendingComponent`, so TanStack Router wraps each non-root match in `Suspense` (`node_modules/@tanstack/react-router/dist/esm/Match.js:43`).
- Tests: `src/components/artifacts/artifact-detail.unit.test.tsx:16-25` mocks `@/lib/artifacts` and mounts through `renderWithRouter` (`testing/router.tsx`).
- Plans 06, 12 and 14 also edit `artifact-detail.tsx`. Plan 06 adds a flush ref to the save effect. Locate code by symbol, not by line. Plan 09 describes `ci.yml`'s `needs: lint` as current state; this plan owns removing it.

Beyond CLAUDE.md's conventions: no re-exports when moving a symbol; `nitro.config.ts`'s existing `process.env.NODE_ENV` read stays (build config); no dev servers or installs, but `pnpm build` is allowed (writes gitignored `.output/`).

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before you proceed. Report material drift. Don't silently replan.

## Gate

`pnpm gate` (typecheck, lint --fix, fmt, test) closes every phase. CI runs the `:check` variants. If `node -v` differs from `mise current`, prefix commands with `mise exec --`.

## How to execute

- One phase per fresh session. The user commits between phases.
- The orchestrator dispatches one subagent per phase (`Task`, `subagent_type: general-purpose`) with this plan's Context and the phase block. It verifies with the gate and re-prompts the same subagent on failure.
- On success, the subagent returns a short "what changed, what to test" summary, then stops.

## Phases

1. Precompress public assets and document proxy compression.
2. Run PR `test` and `docker` in parallel with `lint`.
3. Move `normalizeTags` to a zod-free module.
4. Load the json-render store factory on demand.

---

## Phase 1 — Precompressed assets

**Goal**: A production build emits `.br` and `.gz` siblings for every compressible public asset of 1024 bytes or more. The README tells operators to compress dynamic responses at the proxy.

**Decisions**:

- `nitro.config.ts`: add `compressPublicAssets: { gzip: true, brotli: true }`. zstd stays off: the handler prefers `.br` for every browser that accepts both (`static.mjs:16-17`), so `.zst` files would only enlarge the image. Add a one-line comment that states this reason.
- README: add one bullet to "Auth and proxy notes" (`README.md:102-106`). It says that the app serves static assets precompressed, but SSR pages and server-function responses leave uncompressed. Operators must enable response compression at the proxy. Give Caddy's `encode zstd gzip` as the example, and say that nginx's stock `gzip on` covers only `text/html` unless `gzip_types` is extended.
- After plan 28 lands, re-verify the option name and type in the installed `nitro` types before you edit.

**Scope**: in: `nitro.config.ts`, `README.md`. Out: runtime compression middleware in the app (the proxy owns dynamic responses), cache headers (Nitro already sets `immutable` on `/assets/**`).

**Acceptance**:

- Gate exits 0. `pnpm build` exits 0.
- `find .output/public -name '*.br' | wc -l` → greater than 0 and equal to `find .output/public -name '*.gz' | wc -l`. `find .output/public -name '*.zst' | wc -l` → `0`.
- `find .output/public/assets \( -name '*.js' -o -name '*.css' \) -size +1k ! -exec test -e {}.br \; -print` → no output.
- `grep -rl '\.js\.br' .output/server` → at least one file (the public-asset manifest lists the variants).
- Manual smoke (user): start the built server with a valid env, then run `curl -sI -H 'Accept-Encoding: br, gzip' <BASE_URL>/assets/<any>.js`. Expect `content-encoding: br` and `vary: Accept-Encoding`.

---

## Phase 2 — Parallel PR jobs

**Goal**: `lint`, `test` and `docker` start at the same time on every PR.

**Decisions**: delete `needs: lint` from both `test` (`ci.yml:27`) and `docker` (`ci.yml:39`). A PR is green only when all three pass, so the early gate adds only wall clock. Keep the three jobs separate. Merging `test` into `lint` would serialize the checks again, and plan 09 adds steps to `lint`.

**Scope**: in: `.github/workflows/ci.yml`. Out: `release.yml` (plan 09 owns it), pnpm link-phase tuning (cause unverified).

**Acceptance**:

- Gate exits 0. `grep -n "needs:" .github/workflows/ci.yml` → no matches.
- Manual smoke (user): on the next PR, all three jobs start within seconds of each other.

---

## Phase 3 — Zod-free `normalizeTags`

**Goal**: The client edit dialog imports `normalizeTags` from a module that has no zod import.

**Decisions**:

- New `src/lib/normalize-tags.ts` exports `normalizeTags`, unchanged, with its doc comment. Add one sentence to the doc comment: the module must stay free of zod and server imports because the edit dialog imports it into the client bundle.
- Remove `normalizeTags` from `src/lib/artifact-metadata.ts`. Change every importer listed in Context to import it from `@/lib/normalize-tags`. Add no re-export.
- `artifact-metadata.ts:11-12`: delete the sentence about the client bundle. Keep the no-database constraint only if another reason for it remains (`requireArtifact`'s doc at `:51-56` gives one).

**Scope**: in: the two lib modules and the five importers. Out: the zod field schemas (server and MCP only).

**Acceptance**:

- Gate exits 0.
- `grep -rn "normalizeTags" src --include='*.ts' --include='*.tsx' | grep "artifact-metadata"` → no matches.
- `grep -n "zod" src/lib/normalize-tags.ts` → no matches.

---

## Phase 4 — On-demand store factory

**Goal**: The detail route's static client graph contains neither zod nor `@json-render/core`. Spec and markdown artifacts still create their store synchronously from the view's point of view, save exactly as before, and render during SSR.

**Decisions**:

- The store stays in `ArtifactDetailView`; only the factory is dynamic-imported. The save effect, the reseed, and plan 06's flush all need the store instance in the parent, so creating it inside the lazy view chunk is rejected.
- New `src/components/artifacts/state-store-loader.ts` exports `loadStateStoreFactory(): Promise<typeof createStateStore>` and `peekStateStoreFactory(): typeof createStateStore | undefined` (the factory once the promise has resolved). It uses a type-only import from `@json-render/core` and memoizes one `import('@json-render/core')` promise in a module-level `let`. The doc comment gives the reason: core builds zod schemas at module scope, and html artifacts never need a store.
- `artifact-detail.tsx`: remove the value import of `createStateStore` and read the factory into `createStore` as `stateful ? (peekStateStoreFactory() ?? use(loadStateStoreFactory())) : null`. Seed and reseed with `createStore`, and leave the save effect as it is. The `use()` suspends inside the route match's `Suspense`. SSR awaits it, and hydration waits for it like the lazy views already do. The peek exists because `use()` suspends once on any promise it has not seen settle, even an already-resolved one, which would flash the fallback after the loader already awaited it.
- Both detail route loaders call `await loadStateStoreFactory()` after the detail fetch when `detail.artifact.type !== 'html'`. The chunk then loads in parallel with navigation and on intent preload, and the promise is already resolved at render.
- Fix the stale comments: `artifact-detail.tsx:48-52` (it becomes true; keep it accurate) and the store comments in both route files.
- If plan 06 has landed, its flush ref and gcTime stay as they are. This phase changes only where the factory comes from.

**Scope**: in: `state-store-loader.ts` (new), `artifact-detail.tsx`, `artifact-detail.unit.test.tsx`, `a.$id/index.tsx`, `a.$id/v.$n.tsx`. Out: lazy-loading `HighlightedCode`, whose tokenizers are a few KB and which html needs for its Source tab. Also out: a house `StateStore` implementation, which would duplicate json-render's JSON-pointer semantics.

**Acceptance**:

- Gate exits 0. `pnpm build` exits 0.
- `grep -nE "^import \{[^}]*\} from '@json-render/(core|react)'" src/components/artifacts/artifact-detail.tsx` → no matches (type imports only).
- Closure check (scratch script, not committed): in `.output/public/assets`, find the chunk that contains `Could not parse the stored spec JSON`. Follow its static `import` specifiers recursively, and list closure files that contain `$ZodType`. Run it at the start of the phase: it must find at least one file. After the change it must find none.
- `artifact-detail.unit.test.tsx`: convert assertions that follow a first render to `findBy*` where the suspension requires it. Add cases: an html detail never calls `loadStateStoreFactory` (spy with `vi.mock` plus `importActual`), and a spec detail calls it and still saves a checklist toggle (model on the existing debounce test).
- Manual smoke (user): hard-reload a spec artifact with a checked item. It renders with no skeleton flash, and a toggle persists across reload. An html artifact's network panel shows no zod-bearing chunk.

---

## When reality disagrees with the plan

Adapt when the change still serves the intent and stays in scope, and note the deviation. Stop and report if any of these happens:

- plan 28's nitro no longer precompresses through `compressPublicAssets`, or its static handler no longer negotiates encodings;
- the Phase 4 closure check still finds zod because another static import (for example, validator code left in the `@/lib/artifacts` client stubs) pulls it in;
- `use()` causes a hydration mismatch or a visible fallback on hard reload.

## Done criteria

- [ ] Gate exits 0 after every phase
- [ ] `pnpm build` emits `.br` and `.gz` variants and no `.zst`
- [ ] `ci.yml` contains no `needs:`
- [ ] No importer takes `normalizeTags` from `artifact-metadata`
- [ ] The detail route's static client closure contains no `$ZodType`
- [ ] `docs/plans/README.md` status row updated

## Open questions

- Phase 1: should the README bullet go under deploy step 3 (`README.md:90`) instead? Default: "Auth and proxy notes", which already holds proxy guidance.
