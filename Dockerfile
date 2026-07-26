# node:24-slim (glibc), not -alpine (musl) — better-sqlite3 (13.x, N-API)
# bundles prebuilt native bindings for linux-x64/arm64, both glibc and musl.
# `npm ci` still shells out to node-gyp for its own configure step regardless
# of the bundled prebuild being used at require()-time, though, so a
# toolchain is needed transiently during install either way — see the `RUN
# npm ci` steps below, which install one, use it, then remove it again.
#
# Pinned by digest (tag kept alongside purely for readability — Docker
# resolves the digest, which wins if the two ever disagree). Re-pin when
# intentionally upgrading Node:
#   docker pull node:24-slim
#   docker inspect --format='{{index .RepoDigests 0}}' node:24-slim

# ---- Build stage: full deps (incl. devDependencies), builds the client ----
FROM node:24-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && npm ci \
  && apt-get purge -y --auto-remove python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY . .
RUN npm run build

# ---- Runtime stage: production deps only, server + built client ----
FROM node:24-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d

ARG IMAGE_VERSION=dev
LABEL org.opencontainers.image.title="ChronosPM" \
      org.opencontainers.image.description="Project/stakeholder management tool — single-process Express + SQLite server serving a built Vue client." \
      org.opencontainers.image.source="https://github.com/mycaravam-crypto/pm-tool2" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.version="${IMAGE_VERSION}"

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && npm ci --omit=dev \
  && apt-get purge -y --auto-remove python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY server ./server
COPY --from=build /app/client/dist ./client/dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# /app/server/data is where SQLite lives (server/db/connection.js). Owning it
# — and creating it — before VOLUME is declared means a fresh named volume
# inherits this ownership on first mount, so the non-root `node` user (built
# into this base image) can write to it with no chown-at-startup step needed.
RUN mkdir -p /app/server/data \
  && chown -R node:node /app \
  && chmod +x /usr/local/bin/docker-entrypoint.sh

VOLUME ["/app/server/data"]
USER node

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
# Runs `node` directly rather than `npm run start` — npm run spawns the
# script as a child process and doesn't reliably forward SIGTERM/SIGINT to
# it, which would silently defeat index.js's graceful-shutdown handling.
CMD ["node", "server/index.js"]
