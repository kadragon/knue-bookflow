# Runbook

Operational cheat sheet. Commands assume you are at the repo root unless noted.

## Quick Start

### Prerequisites

- Bun 1.2.20 (`bun --version`) — pinned via `packageManager` in `package.json`
- Node toolchain available (Wrangler 4 spawns child processes)
- A Cloudflare account with Workers + D1 access for deployment
- macOS / Linux (Husky symlinks expected)

### Setup

```bash
git clone <repo>
cd knue-bookflow
bun install                 # workspaces resolve packages/* deps
cp .dev.vars.example .dev.vars   # if a template exists; otherwise create with the secrets below
bun run dev                 # starts wrangler dev for backend
# In another terminal:
bun run dev:frontend        # starts vite dev server
```

The Worker is at `http://localhost:8787` by default; the Vite dev server runs on `http://localhost:5173`. In dev, Vite proxies `/api/*` to the Worker (see `packages/frontend/vite.config.mts`).

### Verify

- `curl http://localhost:8787/api/books` returns JSON.
- `bun run typecheck && bun run lint && bun run test` all pass.

## Build

| Command | Purpose |
|---------|---------|
| `bun run build` | Full chain: shared → frontend → backend (`wrangler build`) |
| `bun run --cwd packages/frontend build` | Frontend only (`tsc && vite build` → `packages/frontend/dist/`) |
| `bun run --cwd packages/backend build` | Worker only (`wrangler build`) |
| `bun run typecheck` | `tsc --build` across project references |

The Worker serves frontend assets via the `[assets] ASSETS` binding — frontend must be built before deploying the backend.

## Test

| Command | Purpose |
|---------|---------|
| `bun run test` | Full suite (Vitest, `--configLoader runner`) |
| `bun run --cwd packages/backend test` | Backend only |
| `bun run --cwd packages/frontend test` | Frontend only |
| `bun run --cwd packages/backend test -- path/to.test.ts` | Single file |
| `bun run --cwd packages/backend test -- --coverage` | Backend coverage (v8) |

### Conventions

- Test files: `*.test.ts` / `*.test.tsx`, colocated under `__tests__/` or next to source.
- Fixtures: keep small inline; large fixtures go under `__tests__/fixtures/`.
- Frontend uses `@testing-library/react` + `jsdom`.

## Lint & Format

| Command | Purpose |
|---------|---------|
| `bun run lint` | `biome check .` (lint + format check) |
| `bun run lint:fix` | `biome check --write .` |
| `bun run format` | `biome format --write .` |

`lint-staged` (via `simple-git-hooks` pre-commit) runs `biome check --write --no-errors-on-unmatched` on staged files automatically.

## Database (D1)

| Command | Purpose |
|---------|---------|
| `bun run --cwd packages/backend wrangler d1 migrations apply knue-bookflow-db --local` | Apply migrations to local D1 |
| `bun run db:migrate` | Apply migrations to remote D1 (production) |
| `bun run --cwd packages/backend wrangler d1 execute knue-bookflow-db --remote --command "SELECT ..."` | Ad-hoc remote query |
| `bun run --cwd packages/backend wrangler d1 execute knue-bookflow-db --local --command "SELECT ..."` | Ad-hoc local query |

Migrations are append-only — add a new numbered file under `packages/backend/migrations/` for any schema change.

## Deploy

| Environment | URL | Branch | Method |
|-------------|-----|--------|--------|
| Local | `http://localhost:8787` | any | `bun run dev` |
| Production | `https://book.kadragon.work/` | `main` | `bun run deploy` after merge |

### Deploy steps

1. Merge feature branch into `main` (CI must be green).
2. `git pull && bun install`
3. `bun run build`
4. `bun run db:migrate` if any new migrations landed.
5. `bun run deploy` (uses `wrangler deploy` from `packages/backend`).
6. Smoke: `curl https://book.kadragon.work/api/books` returns JSON; check Cloudflare dashboard logs.

### Rollback

`wrangler deployments list --name knue-bookflow` → `wrangler rollback <id>`. Migrations are not auto-reverted; if a migration is the regression, write a new migration that undoes it.

## Secrets

Set via Wrangler. Never commit values.

| Secret | Used by |
|--------|---------|
| `LIBRARY_USER_ID` | KNUE Pyxis login |
| `LIBRARY_PASSWORD` | KNUE Pyxis login |
| `ALADIN_API_KEY` | Aladin metadata lookup |
| `TELEGRAM_BOT_TOKEN` | Telegram broadcast + webhook |
| `TELEGRAM_CHAT_ID` | Default broadcast target |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook signature verification (required in production) |

```bash
bun run --cwd packages/backend wrangler secret put TELEGRAM_BOT_TOKEN
```

For local development, place values in `.dev.vars` (gitignored).

## Common Failures

### "Module not found: @knue-bookflow/shared"

**Symptom:** Backend or frontend test/build fails to resolve `@knue-bookflow/shared`.
**Cause:** `shared` not built yet, or a stale `dist/`.
**Fix:** `bun run --cwd packages/shared build` (or run the full `bun run build`).

### Pre-commit hook fails on typecheck

**Symptom:** `bun run typecheck` errors block commit.
**Cause:** Real type error or stale `tsbuildinfo`.
**Fix:** Read the error first. If it points to a stale build artifact, `rm -rf packages/*/dist packages/*/tsconfig.tsbuildinfo && bun run typecheck`. **Never** `--no-verify`.

### `wrangler dev` returns 401 from Pyxis

**Symptom:** Local dev calls fail at the LibraryClient login step.
**Cause:** `.dev.vars` missing or wrong credentials.
**Fix:** Verify `LIBRARY_USER_ID` / `LIBRARY_PASSWORD` in `.dev.vars`; restart `bun run dev`.

### D1 migration fails "table already exists"

**Symptom:** `db:migrate` errors on a fresh remote.
**Cause:** Migration history desynced, or someone applied SQL out-of-band.
**Fix:** Inspect with `wrangler d1 migrations list knue-bookflow-db`; if needed, mark the missing migration as applied via Wrangler — do NOT edit the .sql file.

## Sweep Trigger Policy

`tools/sweep.sh` is **manual** for this project — run between features or before a release. It is intentionally not part of session-start sync (too heavy). If sweep cadence becomes a problem, switch to a SessionStart hook with a 7-day staleness guard or a weekly GitHub Actions cron.

```bash
bash tools/sweep.sh         # full sweep
bash tools/sweep.sh --quick # lint scan only
```

## Environment Variables (non-secret)

| Variable | Default | Notes |
|----------|---------|-------|
| `ENVIRONMENT` | `production` | Set in `wrangler.toml [vars]`; used by handlers to gate dev-only paths. |

## Trace IDs

Existing source uses `// Trace: SPEC-... / TASK-...` comments. When extending an existing flow, keep its trace; when adding a new flow, mint a new SPEC/TASK identifier and reference it in the design doc.
