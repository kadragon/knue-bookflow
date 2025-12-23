# Project Memory

## Overview
KNUE BookFlow is a Cloudflare Workers-based automatic book renewal system for Korea National University of Education library.

## Architecture
- Monorepo (npm workspaces; since 2025-12-11)
  - `packages/backend`: Cloudflare Worker (handlers/services) + D1 access
  - `packages/frontend`: React SPA (Vite) served via Worker Assets
  - `packages/shared`: shared DTOs/types
- Platform: Cloudflare Workers + D1 + Cron Triggers
- External APIs: KNUE Library Pyxis (login/charges/renew/items), Aladin (book metadata)
- Renewal criteria: `renewCnt == 0` AND `dueDate` within 2 days (timezone-safe defaults use KST)

## Operational Notes
- Wrangler config: `packages/backend/wrangler.toml` (compatibility_date pinned to `2024-11-01`)
- Worker assets: `packages/frontend/dist` bound as `ASSETS`
- `wrangler types` generates runtime types (`worker-configuration.d.ts`) and recommends migrating off `@cloudflare/workers-types` (optional)

## Testing
- Vitest 4.0.15 (Vite 7): use `--configLoader runner` to load ESM configs reliably.
- Root test orchestration uses `test.projects` (backend + frontend).
- Frontend tests run with `environment: 'jsdom'`.
- Backend tests are Node-based unit tests (DB and env are mocked); `@cloudflare/vitest-pool-workers` removed because 0.10.x is not compatible with Vitest 4 pools.

## Patterns
- API client wrappers (LibraryClient / AladinClient)
- Repository pattern for D1 access (BookRepository, NoteRepository, PlannedLoanRepository)
- Robust mapping for Pyxis field variations (avoid UI `undefined(undefined)` regressions)

## Known Issues / Follow-ups
- Vitest coverage + `nodejs_compat` quirks: keep compatibility_date pinned unless revalidated.
- D1 provisioning/migrations/secrets should be verified in the target environment before production deploy.

## Recent Work (high-level)
- 2025-11-22..11-26: audit + reliability hardening (TASK-011..TASK-037)
- 2025-12-11: planned loans features + monorepo conversion (TASK-043..TASK-064)
- 2025-12-14: new books pagination + infinite scroll (TASK-066)
- 2025-12-16: dependency upgrades + compatibility fixes (TASK-067)
- 2025-12-17: refactored tsconfig structure to decouple environment settings (TASK-068)
- 2025-12-17: standardized backend vitest config (coverage, globals, excludes) (TASK-069)
- 2025-12-23: removed renewal cron, kept note broadcast cron, unified manual refresh control (TASK-070)
