# GitHub Repo Explainer
![CI](https://github.com/ml1tz-web/github-repo-explainer/actions/workflows/ci.yml/badge.svg)
Paste any public GitHub URL. An AI pipeline clones the repo, walks the file
tree, picks the most informative subset of files, and asks Claude to produce a
structured analysis: a summary, the tech stack, an architecture explanation,
and runnable setup instructions.

Built as a senior-level full-stack exercise — clean monorepo, layered backend,
typed end-to-end, Dockerized for one-command local dev.

<!-- TODO: add a screenshot of the analyze page once you've run a real repo through it -->

---

## Tech stack

| Layer        | Choice                                                              |
| ------------ | ------------------------------------------------------------------- |
| Frontend     | Next.js 15 (App Router) · React 19 · Tailwind CSS v4 · shadcn/ui    |
| Backend      | Node.js 22 · Express 5 · TypeScript (strict)                        |
| AI           | Anthropic Claude (`claude-sonnet-4-6`) with prompt caching          |
| Database     | PostgreSQL 16 · Prisma ORM                                          |
| Tooling      | pnpm workspaces · Turborepo · ESLint 9 (flat) · Prettier · Vitest   |
| Containers   | Docker Compose (postgres + api + web)                               |

---

## What the pipeline does

```
POST /api/v1/analyses { url }
  │
  ├─ resolveHeadSha   (git ls-remote — cheap SHA lookup, no clone)
  ├─ cache lookup     (unique (repoUrl, commitSha) → return existing row on hit)
  │
  ├─ cloneRepo        (git clone --depth=1, with timeout + size cap + cleanup closure)
  ├─ scanRepo         (walk tree, apply 3-layer ignore rules, build FileTreeNode)
  ├─ selectFiles      (priority scoring 0..1000 + token-budgeted greedy fill)
  ├─ summarizeRepo    (Claude with forced tool-use for structured output)
  │
  ├─ createCompleted  (single terminal write; catches P2002 unique-violation
  │                    races and returns the winner's row instead of failing)
  └─ cleanup()        (in finally — temp dir always removed)
```

The web app navigates to `/analyze/[id]` after the POST and renders the result
server-side: overview, tech-stack badges grouped by category, markdown
architecture / setup sections, important-files list, and a collapsible file
tree.

---

## Repo structure

```
github-repo-explainer/
├── apps/
│   ├── api/                       Express service (clone → scan → summarize)
│   │   └── src/
│   │       ├── config/            zod-validated env (fails fast at boot)
│   │       ├── controllers/       HTTP layer
│   │       ├── middleware/        request-id, error handler, rate limit
│   │       ├── prompts/           system + user + emit_analysis tool schema
│   │       ├── repositories/      sole Prisma consumer
│   │       ├── routes/            route mounting
│   │       ├── services/analysis/ pipeline stages (clone/scan/select/summarize)
│   │       ├── utils/             logger, AppError hierarchy
│   │       └── validators/        zod request schemas
│   └── web/                       Next.js 15 frontend
│       └── src/
│           ├── app/               App Router pages (`/`, `/analyze/[id]`)
│           ├── components/        ui primitives + analysis renderers
│           ├── config/            public env
│           └── lib/               typed API client
├── packages/
│   ├── prisma/                    schema + singleton client (only place Prisma is imported)
│   └── shared/                    browser-safe zod schemas + DTOs
├── docker-compose.yml             postgres + api + web with healthcheck chain
├── turbo.json                     build/test/lint pipeline with proper env declarations
└── tsconfig.base.json             shared strict TS settings
```

---

## Running it locally

### Option 1 — Docker Compose (one command)

```bash
cp .env.example .env
# Edit .env, set ANTHROPIC_API_KEY=sk-ant-...
docker compose up --build
```

- Web → http://localhost:3000
- API → http://localhost:4000/health
- Postgres → 5432

### Option 2 — Host-mode dev

Prereqs: Node 22, pnpm 9, a running Postgres reachable at the `DATABASE_URL`
in your `.env`.

```bash
pnpm install
pnpm --filter @repo/prisma db:push        # apply schema
pnpm dev                                  # runs api + web in parallel via Turbo
```

---

## Notable design decisions

These are the calls worth pointing at in a portfolio review.

1. **Two packages, not one shared package.** `@repo/shared` holds browser-safe
   code (zod schemas, DTOs). `@repo/prisma` is the sole Prisma consumer. The
   split is enforced by what each can import — `shared` can't pull in `node:fs`
   or Prisma even if you tried. Prevents the Next bundle from accidentally
   trying to ship Prisma's binary engine to the browser.

2. **One zod schema, used on both sides of the wire.** `githubUrlSchema` lives
   in `@repo/shared`; the form imports it for client validation, the API
   imports the same module for server validation. Single source of truth for
   what counts as a valid URL.

3. **Analyses keyed by `(repoUrl, commitSha)`.** Re-analyzing the same SHA is a
   cache hit (return existing row, no clone, no AI call). Re-analyzing a moved
   branch produces a new row. Share links stay permanent because they point at
   immutable SHAs.

4. **`git ls-remote` before `git clone`.** SHA lookup is one round-trip and
   ~500 ms; cloning is 2–10 s for a typical repo. Doing the cache check
   *before* the clone means cache hits return in well under a second.

5. **Structured output via forced tool-use.** Claude is required to call an
   `emit_analysis` tool whose JSON Schema mirrors `analysisResultSchema`.
   Output is validated with zod before insert, so the `Json` column is safe to
   cast on read. The model can't return a chat preamble — it has to call the
   tool, once.

6. **Prompt caching on the system prompt.** `cache_control: { type: 'ephemeral' }`
   on the role/rules block; the per-repo user turn varies. Cuts cost on the
   system portion roughly 10× on cache hits.

7. **Layered backend with strict boundaries.** Controllers never touch Prisma.
   Services never touch Express. The pipeline is reusable from a CLI or queue
   worker without rewriting anything.

8. **`createApp()` factory separated from process bootstrap.** Tests can
   instantiate the Express app without binding a port — supertest just does
   `request(createApp()).get('/health')`.

9. **`req.signal` plumbed end-to-end.** Client disconnect aborts `git`, the
   Anthropic call, and any in-flight fs work. We don't run up bills after the
   user navigates away.

10. **Three-layer ignore rules in the scanner**, exported as constants so
    they're testable and tunable in one place. Soft truncation flags (not
    silent cutoff) so the AI knows when the picture is partial.

---

## What's intentionally deferred

This is an MVP — these are conscious next steps, not gaps.

- **Real-time progress events (SSE)** to replace the form's rotating
  "Cloning... Scanning..." copy with actual pipeline events.
- **Code-block syntax highlighting** inside the markdown sections (shiki or
  rehype-highlight).
- **Per-user auth + history.** The schema is anonymous-friendly today;
  adding `userId` is one migration and a column.
- **Real Prisma migrations.** Currently `db push` on boot; once the shape
  stabilizes, switch the compose command to `migrate deploy` and check
  migration files in.
- **Test coverage.** Vitest scaffolding is in `apps/api`. `scoreFile`,
  `cloneRepo` error classification, and the `/health` route are the natural
  first specs.
- **Queue-based processing.** Today the POST is synchronous (~5–40 s).
  Schema's `AnalysisStatus` enum already has `PENDING` / `RUNNING` /
  `FAILED` for when we move to a worker.

---

## License

MIT — see [LICENSE](./LICENSE).
