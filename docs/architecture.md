# Architecture

## Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5.7 (strict, project references) |
| Runtime | Cloudflare Workers (compat date `2024-11-01`) |
| Database | Cloudflare D1 (binding `DB`) |
| Frontend | React 19 + MUI 7 + Vite 7, served by the Worker via `[assets] ASSETS` |
| Build | Bun 1.2.20 workspaces, Wrangler 4 |
| Lint/Format | Biome 2.4 |
| Test | Vitest 4 (`--configLoader runner`) |
| CI | GitHub Actions (`.github/workflows/ci.yml`) |
| Pre-commit | simple-git-hooks → `bunx lint-staged && bun run typecheck && bun run test` |

## Source Layout

```
packages/
  backend/
    migrations/                 # Numbered .sql files; append-only
    src/
      index.ts                  # Worker entry — fetch + scheduled + queue dispatch
      handlers/                 # HTTP / Telegram handlers
      services/                 # API clients + D1 repositories + business orchestration
      types/                    # env.ts, library.ts, aladin.ts, renewal.ts, database.ts
      utils/                    # date, pagination, response, logger, branch-volumes
    wrangler.toml               # bindings, route, cron, observability
  frontend/
    src/
      pages/                    # route-level views
      components/               # presentational + container
      hooks/                    # React Query + UI hooks
      api.ts                    # fetch layer to /api/*
    vite.config.mts
  shared/
    src/index.ts                # cross-package types and enums (e.g. ReadStatus)
```

## Layer Rules

### Backend dependency direction

```
handlers/ → services/ → repositories (services/*-repository.ts) → DB binding
                     ↘ external clients (library-client, aladin-client) → fetch
utils/ and types/ are leaf — they import nothing from handlers/services.
```

- Handlers orchestrate request → validation (Zod) → service call → response shaping.
- Services own the business rules (renewal eligibility, broadcast composition).
- Repositories are the **only** modules that may touch `env.DB`.
- External clients (`library-client`, `aladin-client`) wrap `fetch` and never touch D1.

### Cross-package boundaries

- `shared` exports types only — no runtime code that imports backend or frontend internals.
- `frontend` consumes `shared` for response shapes; never imports `backend/src/**`.
- `backend` consumes `shared` for shared enums (`ReadStatus`, payload shapes).

## Data Access

All D1 work goes through repository factories returning typed query helpers:

```
services/book-repository.ts                  # books table
services/note-repository.ts                  # notes + send stats
services/planned-loan-repository.ts          # planned_loans + dismissals
services/telegram-message-repository.ts      # broadcast audit
services/planned-loan-dismissal-repository.ts
```

Each file exports a `create*Repository(db: D1Database)` factory. Handlers receive `env.DB`, build the repo, then call typed methods. **No raw `env.DB.prepare(...)` outside this layer.**

Migrations live in `packages/backend/migrations/NNNN_description.sql`. Applied locally via `wrangler d1 migrations apply --local`, remotely via `bun run db:migrate`.

## Scheduled & External Surfaces

| Surface | Entry | Notes |
|---------|-------|-------|
| Cron `0 3 * * *` UTC (12:00 KST) | `scheduled()` in `index.ts` | Wraps note broadcast + renewal pipeline in `ctx.waitUntil` |
| `GET /api/books`, `/api/notes`, `/api/planned-loans`, `/api/search`, `/api/aladin/:isbn` | `fetch()` in `index.ts` | All JSON; pagination via `utils/pagination.ts` |
| `POST /trigger` | sync-handler | Manual sync entrypoint |
| Telegram webhook | `telegram-webhook-handler.ts` | Requires `TELEGRAM_WEBHOOK_SECRET` in production |
| Static assets | `[assets] ASSETS` | Frontend dist served from Worker |

## Key Abstractions

1. **Repository factory** — `createXRepository(db)` returns a typed object; handlers never see `D1Database` directly.
2. **External client factory** — `createLibraryClient(env)`, `createAladinClient(env)`; both encapsulate auth, retries, and parsing.
3. **`ctx.waitUntil` pipeline** — Scheduled work returns fast; durable work runs after response. Renewal and broadcast both use this.
4. **`ReadStatus` tri-state** — `0` unread, `1` finished, `2` abandoned. Shared between backend and frontend through `@knue-bookflow/shared`.
5. **Zod schemas at handler boundary** — Input parsing and validation happens before any service call. Schemas colocated with handlers.

## Observability

`wrangler.toml` enables logs (1.0 sample) and traces (0.1 sample). Use `console.log` / `console.warn` with structured prefixes (`[BookFlow]`, `[Renewal]`, etc.) — see `utils/logger.ts`.
