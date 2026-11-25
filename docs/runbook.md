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

- `curl http://localhost:8787/api/books` returns JSON once `.dev.vars` sets the local identity (see [Local development identity](#local-development-identity)); without it the API answers 500 or 401.
- `bun run typecheck && bun run lint && bun run test` all pass.

## Build

| Command                                 | Purpose                                                         |
| --------------------------------------- | --------------------------------------------------------------- |
| `bun run build`                         | Full chain: shared → frontend → backend (`wrangler build`)      |
| `bun run --cwd packages/frontend build` | Frontend only (`tsc && vite build` → `packages/frontend/dist/`) |
| `bun run --cwd packages/backend build`  | Worker only (`wrangler build`)                                  |
| `bun run typecheck`                     | `tsc --build` across project references                         |

The Worker serves frontend assets via the `[assets] ASSETS` binding — frontend must be built before deploying the backend.

## Test

| Command                                                  | Purpose                                      |
| -------------------------------------------------------- | -------------------------------------------- |
| `bun run test`                                           | Full suite (Vitest, `--configLoader runner`) |
| `bun run --cwd packages/backend test`                    | Backend only                                 |
| `bun run --cwd packages/frontend test`                   | Frontend only                                |
| `bun run --cwd packages/backend test -- path/to.test.ts` | Single file                                  |
| `bun run --cwd packages/backend test -- --coverage`      | Backend coverage (v8)                        |

### Conventions

- Test files: `*.test.ts` / `*.test.tsx`, colocated under `__tests__/` or next to source.
- Fixtures: keep small inline; large fixtures go under `__tests__/fixtures/`.
- Frontend uses `@testing-library/react` + `jsdom`.

## Lint & Format

| Command            | Purpose                               |
| ------------------ | ------------------------------------- |
| `bun run lint`     | `biome check .` (lint + format check) |
| `bun run lint:fix` | `biome check --write .`               |
| `bun run format`   | `biome format --write .`              |

`lint-staged` (via `simple-git-hooks` pre-commit) runs `biome check --write --no-errors-on-unmatched` on staged files automatically.

## Database (D1)

| Command                                                                                               | Purpose                                    |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `bun run --cwd packages/backend wrangler d1 migrations apply knue-bookflow-db --local`                | Apply migrations to local D1               |
| `bun run db:migrate`                                                                                  | Apply migrations to remote D1 (production) |
| `bun run --cwd packages/backend wrangler d1 execute knue-bookflow-db --remote --command "SELECT ..."` | Ad-hoc remote query                        |
| `bun run --cwd packages/backend wrangler d1 execute knue-bookflow-db --local --command "SELECT ..."`  | Ad-hoc local query                         |

Migrations are append-only — add a new numbered file under `packages/backend/migrations/` for any schema change.

## Deploy

| Environment | URL                           | Branch | Method                                   |
| ----------- | ----------------------------- | ------ | ---------------------------------------- |
| Local       | `http://localhost:8787`       | any    | `bun run dev`                            |
| Production  | `https://book.kadragon.work/` | `main` | Cloudflare auto-deploy on push to `main` |

### Deploy steps

1. Merge the feature branch into `main` through a PR (CI must be green).
2. Cloudflare's Git integration builds and deploys the Worker automatically — no manual `bun run deploy`.
3. `bun run db:migrate` if any new migrations landed (not applied by the auto-deploy).
4. Smoke: `curl https://book.kadragon.work/api/books` returns JSON; check Cloudflare dashboard logs.

Manual fallback (only if the auto-deploy is unavailable): `git pull && bun install && bun run build && bun run deploy`.

### Rollback

`wrangler deployments list --name knue-bookflow` → `wrangler rollback <id>`. Migrations are not auto-reverted; if a migration is the regression, write a new migration that undoes it.

## Secrets

Set via Wrangler. Never commit values.

| Secret                | Used by                        |
| --------------------- | ------------------------------ |
| `LIBRARY_USER_ID`     | KNUE Pyxis login               |
| `LIBRARY_PASSWORD`    | KNUE Pyxis login               |
| `ALADIN_API_KEY`      | Aladin metadata lookup         |
| `TELEGRAM_BOT_TOKEN`  | Telegram due-soon broadcast    |
| `TELEGRAM_CHAT_ID`    | Default broadcast target       |
| `CALENDAR_FEED_TOKEN` | Loan calendar URL (optional)   |
| `ACCESS_TEAM_DOMAIN`  | Cloudflare Access JWT issuer   |
| `ACCESS_AUD`          | Cloudflare Access JWT audience |
| `ADMIN_EMAIL`         | Owner (admin) identity         |

```bash
bun run --cwd packages/backend wrangler secret put TELEGRAM_BOT_TOKEN
```

For local development, place values in `.dev.vars` (gitignored).

## Access and Per-User Data

Cloudflare Access signs users in at the edge. The Worker then verifies the `Cf-Access-Jwt-Assertion` JWT on every `/api/*` request and on `/trigger`; `/api/calendar.ics` is the only exception and keeps its token check. Verification checks the RS256 signature against `https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs`, the `aud` claim against `ACCESS_AUD`, the issuer and the expiry. The user is identified by the verified `email` claim. The `Cf-Access-Authenticated-User-Email` header is never trusted.

- `ADMIN_EMAIL` maps to the owner, user id 1. Every row that existed before per-user separation belongs to that user.
- Any other identity gets its own `users` row on first sign-in. Books, notes, planned loans, dismissals and book requests are scoped to that row. Another user's ids return 404, or `{"success": false}` on delete.
- Library sync, renewal, the cron pipeline, Telegram alerts and the calendar feed use the single `LIBRARY_USER_ID` account and act on the owner's data only. `/trigger`, `/api/books/sync` and `/api/cron-runs*` return 403 for anyone but the admin. Other users have no library loans, so they have no books and therefore no notes. Their planned loans and book requests are their own.
- Missing `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` or `ADMIN_EMAIL` makes every `/api/*` request fail with 500. A request that bypasses Access, for example through a `workers.dev` URL, gets 401.

### Zero Trust configuration

1. **Team domain.** Zero Trust settings show the team domain, which looks like `<team>.cloudflareaccess.com`. Store it without the scheme.
2. **AUD tag.** Go to **Access → Applications** and open the self-hosted application for `book.kadragon.work`. Copy its **Application Audience (AUD) Tag**. Use the AUD of the host-wide application, not the calendar bypass application.
3. **Who can sign in.** In the same application's Allow policy, include every person who should get an account, by email or email domain. Anyone the policy admits gets an empty account on first visit.
4. **Secrets.** Set the three values:

   ```bash
   bun run --cwd packages/backend wrangler secret put ACCESS_TEAM_DOMAIN   # e.g. myteam.cloudflareaccess.com
   bun run --cwd packages/backend wrangler secret put ACCESS_AUD
   bun run --cwd packages/backend wrangler secret put ADMIN_EMAIL          # the owner's Access login email
   ```

   These are secrets, not `[vars]`. This keeps the admin email out of the repository, and Git-integration deploys keep them.

See [Cloudflare's JWT validation guide](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

### Local development identity

`wrangler dev` has no Access in front of it. Add a local identity to `packages/backend/.dev.vars`:

```bash
ENVIRONMENT=development
DEV_AUTH_EMAIL=you@example.com
ADMIN_EMAIL=you@example.com   # omit to act as a non-admin user
```

The fallback works only when `ENVIRONMENT` is `development` **and** the request host is `localhost`, `127.0.0.1` or `[::1]`. Deployed Workers get `ENVIRONMENT = "production"` from `wrangler.toml`, so the fallback cannot turn on there. Apply migrations to the local D1 first with `wrangler d1 migrations apply knue-bookflow-db --local`.

### Rollout of per-user separation (migrations 0016–0020)

Merging to `main` deploys immediately, so finish these steps first:

1. Take a backup: `bun run --cwd packages/backend wrangler d1 export knue-bookflow-db --remote --output backup-before-0016.sql`. Also note the current Time Travel bookmark with `wrangler d1 time-travel info knue-bookflow-db`.
2. Record the row counts. Run `SELECT (SELECT COUNT(*) FROM books), (SELECT COUNT(*) FROM notes), (SELECT COUNT(*) FROM note_send_stats), (SELECT COUNT(*) FROM planned_loans), (SELECT COUNT(*) FROM planned_loan_dismissals), (SELECT COUNT(*) FROM book_requests)` with `wrangler d1 execute knue-bookflow-db --remote --command "..."`.
3. Complete the Zero Trust configuration and set the three secrets.
4. Apply the migrations with `bun run db:migrate`. The new `user_id` columns default to 1, so the Worker that is still deployed keeps working.
5. Re-run the count query and compare it with step 2. `SELECT COUNT(*) FROM books WHERE user_id <> 1` must return 0.
6. Merge the PR. Then sign in as the admin and confirm that the shelf, notes and planned loans are unchanged. Sign in as another allowed user and confirm the shelf is empty. Check that the calendar subscription URL still returns 200.

Rollback: `wrangler rollback` restores the previous Worker without touching the schema. The old code ignores `user_id` and shows every user's rows to everyone signed in. Restore the D1 backup only if the migrations themselves are the problem.

## Loan Due Date Calendar

1. Generate a random URL-safe token and paste it at the Wrangler prompt.

   ```bash
   openssl rand -hex 32
   bun run --cwd packages/backend wrangler secret put CALENDAR_FEED_TOKEN
   ```

2. Cloudflare Access protects `book.kadragon.work` and redirects unauthenticated requests for the feed to sign-in. In Zero Trust, create a more specific self-hosted Access application for `book.kadragon.work/api/calendar.ics` with a **Bypass → Include → Everyone** policy and no wildcard. Keep the existing application and policies for the rest of the host. The Worker validates the query token for the feed itself. See [Cloudflare's endpoint bypass instructions](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/common-policies/#bypass-a-public-endpoint).
3. Confirm from an unauthenticated session that `https://book.kadragon.work/api/calendar.ics` returns HTTP 404 without a token and the full subscription URL returns HTTP 200 with `Content-Type: text/calendar; charset=utf-8`.
4. In Google Calendar on the web, choose **Other calendars → + → From URL** and add `https://book.kadragon.work/api/calendar.ics?token=<CALENDAR_FEED_TOKEN>`. Google refreshes the feed on its own schedule, and renewals or returns can take hours to appear. See [Google Calendar's subscription instructions](https://support.google.com/calendar/answer/37100?hl=en#zippy=%2Cuse-a-link-to-add-a-public-calendar).

Keep the full URL private because it grants access to the feed. The Worker redacts query strings from request URLs in Workers logs and traces. If the URL is exposed, set a new token with the same Wrangler command and subscribe again with the new URL.

The feed reads the D1 loan snapshot. Sync checks the 20 most recent return records, so a return older than that window can remain in the snapshot if it was missed during sync.

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

| Variable      | Default      | Notes                                                                                                               |
| ------------- | ------------ | ------------------------------------------------------------------------------------------------------------------- |
| `ENVIRONMENT` | `production` | Set in `wrangler.toml [vars]`; `development` (in `.dev.vars`) enables the localhost-only `DEV_AUTH_EMAIL` identity. |

## Trace IDs

Existing source uses `// Trace: SPEC-... / TASK-...` comments. When extending an existing flow, keep its trace; when adding a new flow, mint a new SPEC/TASK identifier and reference it in the design doc.
