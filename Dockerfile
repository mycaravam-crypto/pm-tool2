# Stage 1: Build
FROM node:24-slim AS build

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


# Stage 2: Runtime
FROM node:24-slim

WORKDIR /app

# Copy dependency manifests again for the production environment
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json

# Install ONLY production dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && npm ci --omit=dev \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy files and set ownership instantly during the copy step to avoid chown lag
COPY --chown=node:node server ./server
COPY --chown=node:node --from=build /app/client/dist ./client/dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Only modify permissions for the exact data directory the database uses
RUN mkdir -p /app/server/data \
    && chown node:node /app/server/data \
    && chmod +x /usr/local/bin/docker-entrypoint.sh

# Drop to non-root user
USER node

# Assuming standard entrypoint and CMD for your setup
EXPOSE 3001
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "start", "-w", "server"]