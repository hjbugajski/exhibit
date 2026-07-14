# Exhibit

A self-hosted gallery for Claude artifacts. Claude publishes through an MCP connector; you browse the rendered results.

Two artifact types:

- **Specs**: declarative JSON rendered natively by a 28-component catalog (prose, tables, charts, maps, itineraries, steps, …). Interactive components (Checklist, Choice, Rating, NoteBox) persist your input per artifact, and Claude can read it back later, so artifacts double as lightweight feedback forms.
- **HTML**: full pages served sandboxed on their own route.

Single owner, session-authed UI, OAuth 2.1 (PKCE + dynamic client registration) for MCP. SQLite storage, one container.

## Quick start

Requires Docker with Compose.

```sh
git clone https://github.com/hjbugajski/exhibit.git
cd exhibit
cp .env.example .env
```

Edit `.env`:

- `BETTER_AUTH_SECRET`: `openssl rand -base64 32`
- `BASE_URL`: the public URL the app is served at (for a local try-out, `http://localhost:3000`)
- `OWNER_EMAIL`/`OWNER_PASSWORD`: sign-in credentials, created on first boot

```sh
docker compose up -d
```

Open `BASE_URL` and sign in. Migrations run on boot, and the app seeds the owner account once; after that, change email and password in **/settings** (the env values are never re-applied).

## Connect Claude

- **claude.ai/Claude apps**: Settings → Connectors → Add custom connector → `https://your-domain/mcp`, then complete the OAuth flow.
- **Claude Code**: `claude mcp add --transport http exhibit https://your-domain/mcp`, then `/mcp` to authenticate.

claude.ai requires HTTPS for connectors, so connect it to a deployed instance, not localhost. The in-app **/docs** page has the same instructions with your instance's URL filled in, ready to copy.

MCP tools:

| Tool              | Purpose                                                  |
| ----------------- | -------------------------------------------------------- |
| `get_catalog`     | Spec-authoring reference: components, props, wire format |
| `publish_spec`    | Create a spec artifact from catalog components           |
| `publish_html`    | Create an artifact from a standalone HTML document       |
| `update_artifact` | Add a version, or update title/description/tags in place |
| `list_artifacts`  | Browse and filter published artifacts                    |
| `list_tags`       | List tags in use                                         |
| `get_artifact`    | Fetch one, including saved interaction state             |
| `delete_artifact` | Soft-delete (hidden from listings, kept in the database) |

Connected clients appear in **/settings → MCP connections**, where you can revoke them. Revocation deletes the client registration and its tokens; outstanding access tokens are short-lived JWTs that expire on their own.

## Environment

| Variable             | Required   | Purpose                                                                                                             |
| -------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET` | yes        | Signs sessions and encrypts the stored JWKS private key. See "Rotating the secret".                                 |
| `BASE_URL`           | yes        | Public origin; also the OAuth issuer/audience. Must match exactly what browsers and MCP clients use.                |
| `OWNER_EMAIL`        | first boot | Owner account email, created only when no user exists yet.                                                          |
| `OWNER_PASSWORD`     | first boot | Owner account password (change it in /settings afterwards).                                                         |
| `DATABASE_PATH`      | no         | SQLite file. Defaults to `./data/app.db`; the Docker image pins it to `/data/app.db` inside its volume.             |
| `RESEND_API_KEY`     | no         | Enables outbound email via [Resend](https://resend.com): password reset and email-change verification.              |
| `EMAIL_FROM`         | no         | Sender for Resend mail, e.g. `Exhibit <exhibit@your-domain.com>`; the domain must be verified in Resend.            |
| `PROTOMAPS_API_KEY`  | no         | [Protomaps](https://protomaps.com) key: Map blocks render the house-styled basemap; unset falls back to Carto.      |
| `MIGRATIONS_PATH`    | no         | Only if you relocate the drizzle migrations.                                                                        |
| `TRUSTED_PROXIES`    | no         | Comma-separated IPs/CIDRs of reverse proxies in front of the app; scopes which forwarded hops rate limiting trusts. |

The app validates all of this at boot and refuses to start on bad config: missing required values, a malformed `BASE_URL`, or one of `RESEND_API_KEY`/`EMAIL_FROM` or `OWNER_EMAIL`/`OWNER_PASSWORD` without its partner.

Without Resend, everything still works: password changes need the current password, email changes apply immediately, and there is no reset flow (if you lose the password, see "Recovering access").

## Deploying (Coolify or any Docker host)

The image is self-contained: multi-stage build, migrations on boot, `HEALTHCHECK` against `/healthz`, SQLite in the `/data` volume.

On Coolify:

1. New resource → your Git repository → build pack **Dockerfile** (or Docker Compose).
2. Set the environment variables from the table above, with `BASE_URL=https://your-domain`.
3. Add persistent storage mounted at `/data`.
4. Assign the domain with HTTPS and deploy.

Notes:

- `BASE_URL` is load-bearing for auth: it is the cookie origin and the OAuth issuer/audience baked into tokens. Changing it invalidates existing MCP connections; clients re-authorize on their next use.
- Everything except `/sign-in`, `/reset-password`, `/api/auth/*`, `/.well-known/*`, and `/healthz` requires the owner session; `/mcp` requires a Bearer token. No extra proxy layer is needed, but the app assumes it is the only thing served on its origin.
- Sign-in and password-reset rate limiting keys on the client IP from proxy headers. Coolify forwards `X-Forwarded-For` out of the box; set `TRUSTED_PROXIES` when a known proxy fronts the app. Without one, the header is client-controlled and rate limiting is best-effort.

## Backups

State lives in one SQLite file (`/data/app.db`, bind-mounted to `./data` by the compose file). To back up: stop the container, copy the `data/` directory, start it again. For an online copy without downtime, run `sqlite3 data/app.db ".backup backup.db"` on the host. `delete_artifact` is a soft delete: deleted rows stay in `app.db` and in every backup taken after the delete.

## Rotating the secret

`BETTER_AUTH_SECRET` does two jobs: signing sessions and encrypting the private half of the JWKS used to sign MCP access tokens (stored in the `jwks` table). After rotating it:

1. All sessions are invalidated; sign in again.
2. The stored JWKS can no longer be decrypted. Delete it so a fresh keypair is generated on demand:

   ```sh
   sqlite3 data/app.db "DELETE FROM jwks;"
   ```

3. MCP clients hold tokens signed by the old key; they fail verification and re-run OAuth on their own.

## Recovering access

Single-user app, so there is no admin reset path. With Resend configured, use "Forgot password?" on the sign-in page. Without it: `sqlite3 data/app.db "DELETE FROM user;"` and restart the container; the owner is re-seeded from `OWNER_EMAIL`/`OWNER_PASSWORD`. This deletes sessions and MCP grants (cascade) but not artifacts.

## Security model

- **Hostile HTML is the design assumption.** HTML artifacts are AI-authored, arbitrary script. They are never embedded in the app UI: each opens as its own page at `/render/:id/:n`, served with `Content-Security-Policy: sandbox allow-scripts`, which gives the document an opaque origin. Its scripts cannot use the owner session, read cookies, or make credentialed same-origin requests; the rest of the CSP blocks network calls (`connect-src 'none'`) and restricts scripts/styles to inline or cdnjs.
- **Specs are data, not code.** Spec artifacts are JSON validated against a zod catalog and rendered by the app's own React components; markdown rendering strips raw HTML and filters link/image protocols. No `dangerouslySetInnerHTML`.
- **MCP auth is standard OAuth 2.1.** `/mcp` requires a Bearer JWT issued by the app's own authorization server (Better Auth + oauth-provider): PKCE, dynamic client registration, consent, discovery documents under `/.well-known/`. Tokens are verified locally against the JWKS in the database; the server never calls itself.
- **Single owner.** Sign-up is disabled in the auth config, not just hidden. The seed runs only on an empty database.
- **External fetches.** Rendered artifacts can reference `https:` images, and the map component loads CARTO basemap tiles; both expose your IP and referrer to those hosts, same as any embedded image. No other third-party calls are made.

## Development

Node 26 + pnpm via [mise](https://mise.jdx.dev) (`mise install`). Copy `.env.example` to `.env`, then:

```sh
pnpm install
pnpm dev            # http://localhost:3000
pnpm gate           # typecheck + lint + fmt + tests
pnpm build          # production bundle (.output/)
pnpm db:generate    # drizzle migrations from schema changes
```

In dev, `/dev/library` is a component library with a props playground for every house UI component and every catalog component, plus the kitchen-sink example artifact. `scripts/dev-publish.ts` drives the full OAuth + MCP publish flow against a running instance; run it with plain `node scripts/dev-publish.ts` (scripts stick to relative imports, so Node's native type stripping is enough).

`nitro` is pinned to a dated nightly build (TanStack Start requires nitro v3, which has no stable release yet); `pnpm outdated` won't flag it, so bump the pin manually now and then.
