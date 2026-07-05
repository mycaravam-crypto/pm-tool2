# node:20-slim (glibc), not -alpine (musl) — better-sqlite3 ships prebuilt
# native bindings for common glibc targets, so this avoids needing a
# build toolchain in the image just to compile it from source.

# ---- Build stage: full deps (incl. devDependencies), builds the client ----
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci
COPY . .
RUN npm run build

# ---- Runtime stage: production deps only, server + built client ----
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci --omit=dev
COPY server ./server
COPY --from=build /app/client/dist ./client/dist

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start", "-w", "server"]
