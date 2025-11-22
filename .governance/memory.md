# Project Memory

## Project Overview
KNUE BookFlow - Cloudflare Workers-based automatic book renewal system for Korea National University of Education library.

## Architecture Decisions
- **Platform**: Cloudflare Workers (serverless)
- **Database**: Cloudflare D1 (serverless SQLite)
- **Scheduler**: Cron Triggers (daily execution)
- **External APIs**:
  - KNUE Library Pyxis API (login, charges, renewals)
  - Aladin Open API (book metadata)

## Key Learnings
- Session initialized: 2025-01-22
- Project status: Core implementation complete (TASK-001 to TASK-007)

### Implementation Notes
- Used latest versions: Wrangler 4.50.0, Workers-types 4.20251119.0, Vitest 3.2.4
- LibraryClient handles session with cookies and pyxis-auth-token
- Renewal criteria: renewCnt == 0 AND dueDate within 2 days
- Aladin API uses ItemLookUp endpoint for detailed book info
- D1 schema includes books and renewal_logs tables

## Patterns Identified
- API Client Pattern: Encapsulated external API calls in client classes
- Repository Pattern: D1 database access through BookRepository
- Result Type Pattern: RenewalResult for success/failure tracking
- Service Composition: Separate services for library, aladin, renewal, storage

## Known Issues
- Vitest compatibility issue with nodejs_compat after 2025-09-21 (using 2024-11-01 compat date)
- Need to create D1 database and update database_id in wrangler.toml

## Next Session Focus
- Create D1 database: `wrangler d1 create knue-bookflow-db`
- Apply migrations: `wrangler d1 migrations apply knue-bookflow-db`
- Set up secrets: `wrangler secret put LIBRARY_USER_ID` etc.
- Write unit tests for all services
- Deploy to production

## Session 2025-11-22
- Completed TASK-011 (SPEC-maintenance-001): post-build code audit after first build.
- Key findings:
  - Renewal workflow fetches charges twice and persists stale due dates/renewCnt (see TASK-012).
  - Manual `/trigger` endpoint lacks authentication (TASK-013).
  - Library client missing retries/timeouts and pagination; risk of partial data (TASK-014).
  - Date utilities assume local timezone; need KST-aware calculations (TASK-015).
  - Aladin client uses HTTP instead of HTTPS; should switch to HTTPS to avoid MITM/mixed content.
- Added backlog items TASK-012 to TASK-015 for follow-up work; spec_id references set.
- Tests: `npm test` (Vitest) passing as of 2025-11-22.
- Completed TASK-012 (SPEC-renewal-001): reuse pre-fetched charges in renewal workflow, mutate
  charges with renewed dueDate/renewCnt, and add tests to ensure no duplicate fetch and accurate
  persistence path.
- Completed TASK-013 (SPEC-scheduler-001-sec): secured /trigger with Bearer secret, documented
  TRIGGER_SECRET, and added tests covering missing/invalid/valid secrets.
- Completed TASK-014 (SPEC-auth-001): added fetchWithResilience (timeouts/backoff), login retries,
  paginated charges retrieval, and retryable renewals. Tests cover pagination and 5xx retry.
- Completed TASK-015 (SPEC-renewal-001): made date utilities timezone-safe with offset defaults (KST),
  routed renewal/new-book selection through offset-aware checks, and added tests for day rollover.
- Completed TASK-016 (SPEC-scheduler-001-zt): removed TRIGGER_SECRET requirement; manual trigger now
  relies on Cloudflare Zero Trust for access control. Cleaned env/wrangler/test artifacts accordingly.
- Completed TASK-017 (SPEC-deploy-001): added custom domain route for book.kadragon.work in wrangler.toml
  with trace comment to keep routing aligned with deployment needs.
- Completed TASK-018 (SPEC-observability-001): enabled Smart Placement and observability with 100% log
  sampling and 10% trace sampling in wrangler.toml.

- Completed TASK-019 (SPEC-frontend-001): served a React-based bookshelf SPA from Worker assets with
  /api/books providing derived dueStatus/daysLeft, SPA index fallback via env.ASSETS.fetch, and
  client-side filters for author, due status, renew count, and loan state. Vite config switched to
  ESM (.mts) under single package.json; frontend build outputs to frontend/dist used by assets binding.

- Completed TASK-020 (SPEC-notes-001): added stub note metadata (noteCount=0, noteState=not_started)
  to /api/books and surfaced a note CTA on the bookshelf cards, keeping API contract ready for future
  note persistence without DB changes yet.

- Completed TASK-008: Consolidated TypeScript type definitions across codebase. Created src/types/renewal.ts
  (RenewalCandidate, RenewalResult, RenewalConfig) and src/types/api.ts (DueStatus, BookViewModel, etc.).
  Extracted inline types from services (FetchOptions, HttpMethod, ChargeWithBookInfo) into dedicated files.
  All services now import from centralized types. 39 tests pass.

- Completed TASK-009: Added comprehensive unit tests for all modules. Created book-repository.test.ts with
  17 tests covering D1 operations (saveBook, findByChargeId, findByIsbn, findAll, logRenewal, getRenewalLogs,
  createBookRecord). Test suite now has 56 tests total across 6 test files. All tests pass with mocked APIs.

- Completed TASK-010: Verified production deployment. D1 database knue-bookflow-db with tables (books,
  renewal_logs) confirmed. Secrets (LIBRARY_USER_ID, LIBRARY_PASSWORD, ALADIN_API_KEY) configured.
  Cron trigger 10:00 UTC, custom domain book.kadragon.work, Smart Placement, and observability enabled.
