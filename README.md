# Exhibit

A self-hosted gallery for Claude artifacts. Claude publishes through a Model Context Protocol (MCP) connector; you browse the rendered results.

Three artifact types:

- **Specs**: declarative JSON rendered natively by a 28-component catalog (prose, tables, charts, maps, itineraries, steps, …). Interactive components (Checklist, Choice, Rating, NoteBox) persist your input per artifact, and Claude can read it back later, so artifacts double as lightweight feedback forms.
- **Markdown**: prose-first documents rendered in the gallery, with catalog components embeddable inline. Raw HTML is never interpreted.
- **HTML**: full pages served sandboxed on their own route.

One owner, one container: session-authed UI, OAuth 2.1 with Proof Key for Code Exchange (PKCE) and dynamic client registration for MCP, and SQLite for storage.

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

Compose pulls the prebuilt image from `ghcr.io/hjbugajski/exhibit`, published from `main` by CI for `linux/amd64` and `linux/arm64`. The entrypoint chowns `/data` on boot and then drops to a non-root user, so no host-side setup is needed; under rootless Docker, where the container cannot chown the bind mount, `chown` the `data/` directory to the mapped uid yourself.

Open `BASE_URL` and sign in. Migrations run on boot, and the app seeds the owner account once; the env values are never re-applied. Change email and password in **/settings**.

## Connect Claude

- **claude.ai / Claude apps**: Settings → Connectors → Add custom connector → `https://exhibit.example.com/mcp`, then complete the OAuth flow.
- **Claude Code**: `claude mcp add --transport http exhibit https://exhibit.example.com/mcp`, then `/mcp` to authenticate.

claude.ai requires HTTPS for connectors, so connect it to a deployed instance, not localhost. The in-app **/docs** page has the same instructions with your instance's URL filled in, ready to copy.

MCP tools:

| Tool                    | Purpose                                                  |
| ----------------------- | -------------------------------------------------------- |
| `get_catalog`           | Spec-authoring reference: components, props, wire format |
| `publish_spec`          | Create a spec artifact from catalog components           |
| `publish_html`          | Create an artifact from a standalone HTML document       |
| `publish_markdown`      | Create an artifact from a markdown document              |
| `update_artifact`       | Add a version, or update title/description/tags in place |
| `list_artifacts`        | Browse and filter published artifacts                    |
| `list_tags`             | List tags in use                                         |
| `get_artifact`          | Fetch one, including saved interaction state             |
| `set_artifact_archived` | Hide from Claude's default listing, or restore           |
| `delete_artifact`       | Soft-delete (hidden from listings, kept in the database) |

Connected clients appear in **/settings → MCP connections**, where you can revoke them. Revocation deletes the client registration and its tokens, and takes effect immediately: `/mcp` re-checks the client registration on every request, so an access token issued before the revocation stops working on its next call.

## Environment

| Variable             | Required   | Purpose                                                                                                                      |
| -------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET` | yes        | Signs sessions and encrypts the stored JSON Web Key Set (JWKS) private key. See [Rotating the secret](#rotating-the-secret). |
| `BASE_URL`           | yes        | Public origin; also the OAuth issuer/audience. Must match exactly what browsers and MCP clients use.                         |
| `OWNER_EMAIL`        | first boot | Owner account email, created only when no user exists yet.                                                                   |
| `OWNER_PASSWORD`     | first boot | Owner account password (change it in /settings afterwards).                                                                  |
| `DATABASE_PATH`      | no         | SQLite file. Defaults to `./data/app.db`; the Docker image pins it to `/data/app.db` inside its volume.                      |
| `RESEND_API_KEY`     | no         | Enables outbound email via [Resend](https://resend.com): password reset and email-change verification.                       |
| `EMAIL_FROM`         | no         | Sender for Resend mail, e.g. `Exhibit <exhibit@example.com>`; the domain must be verified in Resend.                         |
| `PROTOMAPS_API_KEY`  | no         | [Protomaps](https://protomaps.com) key: Map blocks render the house-styled basemap; unset falls back to Carto.               |
| `MIGRATIONS_PATH`    | no         | Only if you relocate the drizzle migrations.                                                                                 |
| `TRUSTED_PROXIES`    | no         | Comma-separated IPs/CIDRs of reverse proxies in front of the app; scopes which forwarded hops rate limiting trusts.          |

The app validates all of this at boot and refuses to start on bad config. That means a missing required value or a malformed `BASE_URL`. It also means a half-set pair: `RESEND_API_KEY` and `EMAIL_FROM` must be set together, as must `OWNER_EMAIL` and `OWNER_PASSWORD`.

Without Resend, everything still works: password changes need the current password, email changes apply immediately, and there is no reset flow. If you lose the password, see [Recovering access](#recovering-access).

## Deploying (any Docker host)

The image is self-contained: multi-stage build, published for `linux/amd64` and `linux/arm64`, migrations on boot, `HEALTHCHECK` against `/healthz`, SQLite in the `/data` volume. The entrypoint chowns `/data` and drops privileges, so the bind-mounted directory needs no host-side ownership fix.

On the server:

1. Copy `compose.yaml` and `.env.example` (renamed to `.env`) into a directory, or clone the repo.
2. Set the environment variables from the table above, with `BASE_URL=https://exhibit.example.com`.
3. `docker compose up -d`, and point an HTTPS reverse proxy (Caddy, Traefik, nginx) at port 3000.

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

State lives in one SQLite file: `/data/app.db`, bind-mounted to `./data` by the compose file. To back up, stop the container, copy the `data/` directory, and start it again. For an online copy without downtime, run `sqlite3 data/app.db ".backup backup.db"` on the host.

`delete_artifact` is a soft delete: the row is hidden from listings but stays in `app.db`, and so in every backup taken after the delete. Filter the gallery to "Deleted only" to restore it or delete it forever. Deleting forever removes the artifact and all of its versions from the database, so it leaves later backups — but not the ones you already took.

## Rotating the secret

`BETTER_AUTH_SECRET` does two jobs: signing sessions and encrypting the private half of the JWKS used to sign MCP access tokens (stored in the `jwks` table). After rotating it:

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

Node 26 + pnpm via [mise](https://mise.jdx.dev) (`mise install`). Copy `.env.example` to `.env` and fill in the same three values as the quick start:

- `BETTER_AUTH_SECRET`: `openssl rand -base64 32`
- `BASE_URL`: `http://localhost:3000`
- `OWNER_EMAIL`/`OWNER_PASSWORD`: the owner account is your sign-in; sign-up is disabled, so without these the app boots with no way in.

Then:

```sh
pnpm install
pnpm dev            # http://localhost:3000
pnpm gate           # typecheck + lint + fmt + tests
pnpm build          # production bundle (.output/)
pnpm db:generate    # drizzle migrations from schema changes
```

The compose file pulls the published image. To run a local build instead, `docker build -t exhibit .` and point `compose.yaml`'s `image:` at it, or run the container directly.

In dev, `/dev/library` is a component library with a props playground for every house UI component and every catalog component, plus the kitchen-sink example artifact. `scripts/dev-publish.ts` drives the full OAuth + MCP publish flow against a running instance. It takes its config from the environment:

```sh
BASE_URL=http://localhost:3000 OWNER_EMAIL=... OWNER_PASSWORD=... node scripts/dev-publish.ts
```

Scripts stick to relative imports, so Node's native type stripping runs the TypeScript as-is.

`nitro` is pinned to a dated nightly build (TanStack Start requires nitro v3, which has no stable release yet). `pnpm outdated` reports it as `nitro-nightly`, but the alias spec in `package.json` has to be bumped by hand.
