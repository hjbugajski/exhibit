FROM node:26-slim AS build
WORKDIR /app
# Node 25+ images no longer bundle corepack; install it so the packageManager
# pin in package.json keeps selecting the pnpm version.
RUN npm install -g corepack && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:26-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Default the DB into the declared volume so a bare `docker run` (no compose
# env) still persists data across redeploys.
ENV DATABASE_PATH=/data/app.db
COPY --from=build /app/.output ./.output
COPY --from=build /app/src/database/migrations ./src/database/migrations
COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# Starts as root so the entrypoint can chown the (typically root-owned) /data
# bind mount, then setpriv-drops to node before exec'ing the server.
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]
