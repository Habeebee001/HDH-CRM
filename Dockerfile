# HDH CRM: one container with the web app, the API server and PostgREST.
# The database is Neon (set DATABASE_URL). Railway builds this file
# automatically when it is at the root of the repository.

ARG NODE_IMAGE=node:24.21.0-slim

# ---- 1. Build the web app (dist/) --------------------------------------------
FROM ${NODE_IMAGE} AS web
WORKDIR /app
# Stops Vite's bundle visualizer from trying to open a browser, and skips
# installing git hooks (there is no .git in the build context).
ENV NODE_ENV=CI HUSKY=0
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- 2. Server dependencies (pg, nodemailer) ---------------------------------
FROM ${NODE_IMAGE} AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json server/.npmrc ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---- 3. PostgREST (static binary from the official release) ------------------
FROM debian:stable-slim AS postgrest
ARG POSTGREST_VERSION=16.6
ARG TARGETARCH
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
 && rm -rf /var/lib/apt/lists/*
RUN case "${TARGETARCH:-amd64}" in \
      amd64) arch=x86-64 ;; \
      arm64) arch=aarch64 ;; \
      *) echo "Unsupported architecture: ${TARGETARCH}" && exit 1 ;; \
    esac \
 && curl -fsSL "https://github.com/PostgREST/postgrest/releases/download/v${POSTGREST_VERSION}/postgrest-v${POSTGREST_VERSION}-linux-static-${arch}.tar.xz" \
    | tar -xJ -C /usr/local/bin \
 && /usr/local/bin/postgrest --version

# ---- 4. Runtime ---------------------------------------------------------------
FROM ${NODE_IMAGE}
ENV NODE_ENV=production
WORKDIR /app
COPY --from=postgrest /usr/local/bin/postgrest /usr/local/bin/postgrest
COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server ./server
COPY --from=web /app/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "server/index.ts"]
