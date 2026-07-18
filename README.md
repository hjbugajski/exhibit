# Exhibit

A self-hosted gallery for Claude artifacts. Claude publishes through a Model Context Protocol (MCP) connector; you browse the rendered results.

Two artifact types:

- **Specs**: declarative JSON rendered natively by a 28-component catalog (prose, tables, charts, maps, itineraries, steps, …). Interactive components (Checklist, Choice, Rating, NoteBox) persist your input per artifact, and Claude can read it back later, so artifacts double as lightweight feedback forms.
- **HTML**: full pages served sandboxed on their own route.

One owner, one container: session-authed UI, OAuth 2.1 (PKCE + dynamic client registration) for MCP, SQLite for storage.

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

Compose pulls the prebuilt image from `ghcr.io/hjbugajski/exhibit`, published from `main` by CI. On Linux, create the data directory first so the non-root container (uid 1000) can write it: `mkdir -p data && sudo chown 1000:1000 data`. Docker Desktop on macOS/Windows handles the ownership itself.

Open `BASE_URL` and sign in. Migrations run on boot, and the app seeds the owner account once; the env values are never re-applied. Change email and password in **/settings**.

## Connect Claude

- **claude.ai / Claude apps**: Settings → Connectors → Add custom connector → `https://exhibit.example.com/mcp`, then complete the OAuth flow.
- **Claude Code**: `claude mcp add --transport http exhibit https://exhibit.example.com/mcp`, then `/mcp` to authenticate.

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

Connected clients appear in **/settings → MCP connections**, where you can revoke them. Revocation deletes the client registration and its tokens; outstanding access tokens are short-lived JSON Web Tokens (JWTs) that expire on their own.

## Environment

| Variable             | Required   | Purpose                                                                                                             |
| -------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET` | yes        | Signs sessions and encrypts the stored JWKS private key. See [Rotating the secret](#rotating-the-secret).           |
| `BASE_URL`           | yes        | Public origin; also the OAuth issuer/audience. Must match exactly what browsers and MCP clients use.                |
| `OWNER_EMAIL`        | first boot | Owner account email, created only when no user exists yet.                                                          |
| `OWNER_PASSWORD`     | first boot | Owner account password (change it in /settings afterwards).                                                         |
| `DATABASE_PATH`      | no         | SQLite file. Defaults to `./data/app.db`; the Docker image pins it to `/data/app.db` inside its volume.             |
| `RESEND_API_KEY`     | no         | Enables outbound email via [Resend](https://resend.com): password reset and email-change verification.              |
| `EMAIL_FROM`         | no         | Sender for Resend mail, e.g. `Exhibit <exhibit@example.com>`; the domain must be verified in Resend.                |
| `PROTOMAPS_API_KEY`  | no         | [Protomaps](https://protomaps.com) key: Map blocks render the house-styled basemap; unset falls back to Carto.      |
| `MIGRATIONS_PATH`    | no         | Only if you relocate the drizzle migrations.                                                                        |
| `TRUSTED_PROXIES`    | no         | Comma-separated IPs/CIDRs of reverse proxies in front of the app; scopes which forwarded hops rate limiting trusts. |

The app validates all of this at boot and refuses to start on bad config: missing required values, a malformed `BASE_URL`, or one of `RESEND_API_KEY`/`EMAIL_FROM` or `OWNER_EMAIL`/`OWNER_PASSWORD` without its partner.

Without Resend, everything still works: password changes need the current password, email changes apply immediately, and there is no reset flow. If you lose the password, see [Recovering access](#recovering-access).

## Deploying (any Docker host)

The image is self-contained: multi-stage build, migrations on boot, `HEALTHCHECK` against `/healthz`, SQLite in the `/data` volume.

On the server:

1. Copy `compose.yaml` and `.env.example` (renamed to `.env`) into a directory, or clone the repo.
2. Set the environment variables from the table above, with `BASE_URL=https://exhibit.example.com`.
3. `mkdir -p data && sudo chown 1000:1000 data` so the non-root container can write the database.
4. `docker compose up -d`, and point an HTTPS reverse proxy (Caddy, Traefik, nginx) at port 3000.

To upgrade:

```sh
docker compose pull && docker compose up -d
```

Every merge to `main` publishes an image, and conventional commit subjects drive the version: `fix` bumps patch, `feat` bumps minor, a breaking change bumps major. A release produces a git tag, a GitHub Release, and image tags `X.Y.Z`, `X.Y`, and `latest`. Merges with nothing release-worthy (`chore`, `docs`, `ci`) publish only an immutable `sha-<commit>` image and don't move `latest`.

To pin a version instead of tracking `latest`, set the `image:` tag in `compose.yaml` to `X.Y` or a `sha-<commit>`. Migrations are forward-only: before upgrading across a release that adds migration files, take the backup below. The backup is the rollback path, not an older image tag.

Auth and proxy notes:

- **`BASE_URL` is load-bearing for auth**: it is the cookie origin and the OAuth issuer/audience baked into tokens. Changing it invalidates existing MCP connections; clients re-authorize on their next use.
- **Route protection**: everything except `/sign-in`, `/reset-password`, `/api/auth/*`, `/.well-known/*`, and `/healthz` requires the owner session, and `/mcp` requires a Bearer token. No extra proxy layer is needed, but the app assumes it is the only thing served on its origin.
- **Rate limiting**: sign-in and password-reset limits key on the client IP from proxy headers. Set `TRUSTED_PROXIES` to your reverse proxy's IP so its `X-Forwarded-For` is trusted; without it, the header is client-controlled and rate limiting is best-effort.

## Backups

State lives in one SQLite file: `/data/app.db`, bind-mounted to `./data` by the compose file. To back up, stop the container, copy the `data/` directory, and start it again. For an online copy without downtime, run `sqlite3 data/app.db ".backup backup.db"` on the host. `delete_artifact` is a soft delete, so deleted rows stay in `app.db` and in every backup taken after the delete.

## Rotating the secret

`BETTER_AUTH_SECRET` does two jobs: signing sessions and encrypting the private half of the JSON Web Key Set (JWKS) used to sign MCP access tokens (stored in the `jwks` table). After rotating it:

1. Sessions no longer verify; sign in again.
2. The stored JWKS can no longer be decrypted. Delete it so a fresh keypair is generated on demand:

   ```sh
   sqlite3 data/app.db "DELETE FROM jwks;"
   ```

3. MCP clients hold tokens signed by the old key; they fail verification and re-run OAuth on their own.

## Recovering access

Single-user app, so there is no admin reset path. With Resend configured, use “Forgot password?” on the sign-in page. Without it, run `sqlite3 data/app.db "DELETE FROM user;"` and restart the container; the app re-seeds the owner from `OWNER_EMAIL`/`OWNER_PASSWORD`. This deletes sessions and MCP grants (cascade) but not artifacts.

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

The compose file pulls the published image. To run a local build instead, `docker build -t exhibit .` and point `compose.yaml`'s `image:` at it, or run the container directly.

In dev, `/dev/library` is a component library with a props playground for every house UI component and every catalog component, plus the kitchen-sink example artifact. `scripts/dev-publish.ts` drives the full OAuth + MCP publish flow against a running instance. Run it with plain `node scripts/dev-publish.ts`; scripts stick to relative imports, so Node's native type stripping is enough.

`nitro` is pinned to a dated nightly build (TanStack Start requires nitro v3, which has no stable release yet). `pnpm outdated` won't flag it, so bump the pin manually when updating dependencies.
