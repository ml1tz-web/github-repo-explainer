# syntax=docker/dockerfile:1.7
#
# Multi-stage Dockerfile for the Next.js web app.
# Uses Next's standalone output for a tiny runner image.

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS base
RUN apk add --no-cache tini \
    && corepack enable \
    && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

# ---------------------------------------------------------------------------
# deps
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
# dev — used by docker-compose. Source is bind-mounted.
# ---------------------------------------------------------------------------
FROM deps AS dev
COPY packages/shared/src packages/shared/src
ENV NODE_ENV=development
EXPOSE 3000
CMD ["pnpm", "--filter", "@repo/web", "dev"]

# ---------------------------------------------------------------------------
# builder
# ---------------------------------------------------------------------------
FROM deps AS builder
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/web/ apps/web/
# NEXT_PUBLIC_* must be present at build time — Next inlines them into the
# client bundle. Compose passes these via build args.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN pnpm --filter @repo/web build

# ---------------------------------------------------------------------------
# runner — standalone Next output
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
RUN apk add --no-cache tini && addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next standalone bundles its own minimal node_modules under the output dir.
# Layout (with outputFileTracingRoot = monorepo root):
#   /app/apps/web/.next/standalone/  ← server entry + traced deps
#   /app/apps/web/.next/static/      ← copied next to standalone as required
#   /app/apps/web/public/
COPY --from=builder --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=builder --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=app:app /app/apps/web/public ./apps/web/public

USER app
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
