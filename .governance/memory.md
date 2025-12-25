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

## Git Hooks
- Using `simple-git-hooks` (replaced `husky` as of 2025-12-23) for pre-commit hooks.
- Pre-commit runs: `lint-staged`, `typecheck`, and `test`.
- Configuration is in `package.json` under `simple-git-hooks` field.

## Patterns
- API client wrappers (LibraryClient / AladinClient)
- Repository pattern for D1 access (BookRepository, NoteRepository, PlannedLoanRepository)
- Robust mapping for Pyxis field variations (avoid UI `undefined(undefined)` regressions)

## Known Issues / Follow-ups
- Vitest coverage + `nodejs_compat` quirks: keep compatibility_date pinned unless revalidated.
- D1 provisioning/migrations/secrets should be verified in the target environment before production deploy.

## Recent Work (high-level)
- 2025-12-25: fixed Biome lint issues by removing unused imports/vars and the non-null assertion in BookDetailModal; lint now passes. (TASK-080)
- 2025-11-22..11-26: audit + reliability hardening (TASK-011..TASK-037)
- 2025-12-11: planned loans features + monorepo conversion (TASK-043..TASK-064)
- 2025-12-14: new books pagination + infinite scroll (TASK-066)
- 2025-12-16: dependency upgrades + compatibility fixes (TASK-067)
- 2025-12-17: refactored tsconfig structure to decouple environment settings (TASK-068)
- 2025-12-17: standardized backend vitest config (coverage, globals, excludes) (TASK-069)
- 2025-12-23: removed renewal cron, kept note broadcast cron, unified manual refresh control (TASK-070)
- 2025-12-23: added backend refactor spec and task plan (TASK-071..TASK-079). Trace: SPEC-backend-refactor-001 / TASK-071
- 2025-12-23: baseline validation for refactor complete; confirmed sequential Aladin lookups, unbounded concurrency in sync/manual workflows, redundant planned-loan deletions, generic sync errors, and findByIsbn used only for return-history fallback. No explicit rate-limit/timeout policy documented. (TASK-071)
- 2025-12-23: implemented Aladin lookup timeout and bounded concurrency (10) for new-books metadata lookup; added tests for timeout, concurrency, and failure handling. Test run failed due to duplicate --configLoader flag. (TASK-072)
- 2025-12-23: deduplicated planned loan deletions by batching unique biblio ids after sync charge processing; added tests. (TASK-073)
- 2025-12-23: added sync error classification with codes/statuses and tests validating auth/library/unknown responses. (TASK-074)
- 2025-12-24: manual renewal workflow now uses allSettled for sync, logs sync failures, and keeps return processing running; added manual trigger test to confirm renewals log on partial sync failure. (TASK-075)
- 2025-12-24: findByIsbn now defaults to 10 results (SQL LIMIT) with updated return-history fallback and tests. (TASK-076)
- 2025-12-24: shared pagination parser added and adopted by new-books/search handlers with unit tests. (TASK-077)
- 2025-12-24: centralized renewal logging in renewal-service helper and added tests. (TASK-078)
- 2025-12-24: centralized shared constants (dates, renewal defaults, cache settings), added DEBUG-gated logger, and added per-instance Aladin lookup cache (1h TTL); updated handlers/services/date utils to use constants and added tests for constants/logger/cache TTL. (TASK-079)
