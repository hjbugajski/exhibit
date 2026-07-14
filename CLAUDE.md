# exhibit

Self-hosted gallery for Claude artifacts. Claude publishes via MCP (streamable HTTP, stateless JSON, OAuth 2.1) at `/mcp`; the single owner browses rendered artifacts through a session-authed UI.

## Stack

TanStack Start (React 19) · SQLite via Drizzle + better-sqlite3 · Better Auth (`@better-auth/oauth-provider` + `jwt` plugins) · `@modelcontextprotocol/sdk` (stateless streamable HTTP) · `@json-render` catalog in `src/catalog` · Tailwind v4 (CSS-first) · house components on Base UI primitives (`src/components/ui`, tokens in `src/styles.css`) · oxlint + oxfmt · Vitest · pnpm.

## Commands

Node/pnpm via mise (`mise.toml`).

- `pnpm gate` — typecheck && lint && fmt && test; run before claiming done (CI uses `:check` variants)
- `pnpm db:generate` / `db:migrate` — drizzle-kit; migrations live in `src/database/migrations`, run on boot
- Don't start dev servers; the owner runs his own.

## Conventions

- Kebab-case filenames; hooks `use-*`; no barrel files. Routes folder is pure routes — support code lives in `src/components/<domain>/` or `src/lib/`.
- Tests colocated with source (`.unit.test.ts(x)` / `.int.test.ts`); shared helpers in root-level `testing/` (`@testing/*`).
- Env vars only via `src/lib/env.ts` — never `process.env` in app code (exceptions: `drizzle.config.ts`, `scripts/dev-publish.ts`). The seed chain runs under plain `node`, so its modules use relative imports, never `@/*`.
- Forms are Base UI end to end: house `Form` + `Field`, never a raw `<form>`; async handlers via `useFormAction`; server/form-level errors via `FormStatus`. Field errors are declarative state ("Email is required."), never imperatives.
- Server fns get auth via `sessionMiddleware`; constants imported as runtime values by client code live in client-safe modules, never server-only files.
- Verify third-party config keys (Better Auth especially) against installed `node_modules` types — plausible-but-wrong keys are silently ignored.

## Design system

- Semantic tokens only, defined once per scheme in `src/styles.css` (12-step OKLCH scales; Tailwind's default palette is purged). Never `dark:` color variants or `/NN` alpha steps in components — if a state's color is missing, add a token in both schemes.
- Catalog blocks space themselves: `my-*` + `first:mt-0 last:mb-0` (`src/components/catalog/flow.ts`), collapsing in normal flow; flow containers add no `space-y`/`gap`, and multi-column Grid/Columns wrap children in cells to neutralize the margins.
- Every interactive control is 32px (`h-8`); no size props. Icons tag `data-icon="only" | "inline-start" | "inline-end"` at the call site. Spacing via semantic tokens (`px-control`, `p-dialog`, `gap-card`, …), never one-off pads.
- Compounds export namespace objects with bare internal part names; `render`/`useRender`, never `asChild`; disabled styling keys off Base UI's `data-disabled`.
- Browse every component and catalog demo at `/dev/library` (dev only).

## Security invariants

- Public routes: `/sign-in`, `/reset-password`, `/api/auth/*`, `/.well-known/*`, `/healthz` only. Everything else needs a session; `/mcp` needs a Bearer token.
- HTML artifacts are hostile: opened as their own page at `/render/:id/:n` (never iframe/srcdoc) with CSP `sandbox allow-scripts` for an opaque origin — never same-origin with the app.
- No `dangerouslySetInnerHTML` outside the vetted markdown renderer. Signup disabled in Better Auth config, not just UI.
