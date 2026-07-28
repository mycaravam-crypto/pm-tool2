# Pinned by digest (tag kept alongside purely for readability — Docker
# resolves the digest, which wins if the two ever disagree). Re-pin when
# intentionally upgrading Node:
#   docker pull node:24-slim
#   docker inspect --format='{{index .RepoDigests 0}}' node:24-slim

# Stage 1: Build — full deps (incl. devDependencies), builds the client.
FROM node:24-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS build

WORKDIR /app

# Copy dependency manifests first to leverage Docker layer caching
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json

# Install all dependencies (including dev dependencies for build)
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && npm ci \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy source code and build the client
COPY . .
RUN npm run build


# Stage 2: Assemble — production-only deps + app files, still on a full
# Debian base since npm/apt/a shell are needed to install and lay things out.
# This is *not* the image that runs: stage 3 copies the finished /app tree
# out of it onto a base with far less attack surface.
FROM node:24-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS assemble

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json

# Install ONLY production dependencies, and only the server workspace's —
# the client is already pre-built into static files by stage 1, so its
# dependency tree (vue, vite's transitive deps, ...) has no reason to exist
# in what actually ships.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && npm ci --omit=dev --workspace=server \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# 65532:65532 is the "nonroot" user baked into the runtime base (stage 3) —
# named `chown=node:node` doesn't resolve there, since that image has no such
# user, so this uses the numeric id directly.
COPY --chown=65532:65532 server ./server
COPY --chown=65532:65532 --from=build /app/client/dist ./client/dist

# server/db/connection.js creates this directory itself on startup, but it
# needs to exist with the right owner *before* that first run for a
# freshly-mounted named volume (root-owned by default) to be writable by the
# non-root runtime user.
RUN mkdir -p /app/server/data && chown 65532:65532 /app/server/data


# Stage 3: Runtime — distroless, no shell/package manager/OS utilities at
# all, just the Node runtime + this app. Cuts the image's vulnerability
# surface to just glibc/openssl (see gcr.io/distroless/nodejs24-debian12);
# node:24-slim's full Debian userland (perl, ncurses, util-linux, npm's own
# vendored deps, ...) never ships in what actually runs in production.
# Digest re-pin:
#   docker pull gcr.io/distroless/nodejs24-debian12:nonroot
#   docker inspect --format='{{index .RepoDigests 0}}' gcr.io/distroless/nodejs24-debian12:nonroot
FROM gcr.io/distroless/nodejs24-debian12:nonroot@sha256:14d42e2511532589a7c7e01a753667a74fcc96266e137e8125006b87b0c32d0a

WORKDIR /app

# Set by the CI build (--build-arg GIT_SHA=<commit sha>, see
# .github/workflows/ci.yml) so a running container can report exactly which
# commit it was built from via GET /version — the traceability link between a
# deployed image and the source it came from. Falls back to "unknown" for a
# manual `docker build` with no build-arg.
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

COPY --from=assemble /app /app

# Already running as the image's built-in `nonroot` (65532:65532) user; no
# USER instruction needed. No shell either, so entrypoint logic that used to
# live in docker-entrypoint.sh is server/entrypoint.js instead, run directly
# by this image's default ENTRYPOINT (/nodejs/bin/node).
EXPOSE 3001
CMD ["server/entrypoint.js"]
