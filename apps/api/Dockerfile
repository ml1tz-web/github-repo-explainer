# syntax=docker/dockerfile:1.7
#
# Multi-stage Dockerfile for the API.
#   - `dev`     : bind-mounted source + pnpm dev, used by docker-compose
#   - `builder` : full prod build (prisma generate + tsup)
#   - `runner`  : minimal prod image, what you'd push to a registry
#
# Build context is the monorepo root (compose sets context: .). Paths in
# COPY are relative to the repo root for that reason.

ARG NODE_VERSION=22-alpine

# ---------------------------------------------------------------------------
# base — system deps shared by every stage. Pinned pnpm via corepack.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS base
RUN apk add --no-cache git openssl ca-certificates tini \
    && corepack enable \
    && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

# ---------------------------------------------------------------------------
# deps — install only what's needed to install (manifests + lockfile).
# This layer is cached as long as deps don't change, which is the big win.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/prisma/package.json packages/prisma/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# dev — used by docker-compose. Source is bind-mounted at runtime so we
# don't COPY it. We DO pull in the prisma schema so `prisma generate` can
# produce the client into the named volume on first boot.
# ---------------------------------------------------------------------------
FROM deps AS dev
COPY packages/prisma/prisma packages/prisma/prisma
COPY packages/shared/src packages/shared/src
ENV NODE_ENV=development
EXPOSE 4000
# compose overrides this command to also push the schema; keep a sensible
# default for `docker run`.
CMD ["pnpm", "--filter", "@repo/api", "dev"]

# ---------------------------------------------------------------------------
# builder — full source, full build.
# ---------------------------------------------------------------------------
FROM deps AS builder
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/api/ apps/api/
RUN pnpm --filter @repo/prisma db:generate \
    && pnpm --filter @repo/api build

# ---------------------------------------------------------------------------
# runner — production image. Only the artifacts we need to run.
# ---------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
# Non-root user for the runtime process.
RUN addgroup -S app && adduser -S app -G app

# App code
COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/apps/api/package.json apps/api/package.json
# Workspace siblings the API imports
COPY --from=builder /app/packages/prisma/generated packages/prisma/generated
COPY --from=builder /app/packages/prisma/package.json packages/prisma/package.json
COPY --from=builder /app/packages/prisma/src packages/prisma/src
COPY --from=builder /app/packages/shared/src packages/shared/src
COPY --from=builder /app/packages/shared/package.json packages/shared/package.json
# Hoisted + workspace node_modules. pnpm symlinks point at .pnpm/, so we
# need the whole structure intact.
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json ./

USER app
EXPOSE 4000
# tini reaps zombies and forwards signals correctly to node.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/dist/index.js"]
