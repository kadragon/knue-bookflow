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

- Completed TASK-021 (SPEC-frontend-001): Created and applied a custom SVG favicon (book icon with
  project gradient) to frontend/public/favicon.svg and linked it in index.html.

- Completed TASK-022 (SPEC-ci-001): Updated .github/dependabot.yml to track updates for "github-actions"
  ecosystem weekly.

## Session 2025-11-23 (Continued)
- Completed TASK-023 (SPEC-notes-002): Implemented full note-taking feature with CRUD operations.
  - Added D1 migration for notes table (0002_add_notes_table.sql) with FK to books
  - Created NoteRecord type in database.ts and NoteViewModel in api.ts
  - Implemented NoteRepository with findByBookId, findById, create, update, delete, countByBookId
  - Added API endpoints: GET/POST /api/books/:id/notes, PUT/DELETE /api/notes/:id
  - Created notes-handler.ts with validation and error handling
  - Updated books-handler to include actual noteCount and noteState (in_progress when notes exist)
  - Added dbId to BookViewModel for proper note API calls
  - Implemented frontend NoteModal component with:
    - Note list display in page order with quote styling
    - Add/Edit form with page number and content fields
    - Delete confirmation
    - Close on backdrop click or Escape key
  - Added CSS styles for modal, notes list, forms, and buttons
  - All 59 tests passing, linting clean
  - Key pattern: Used database id (dbId) instead of charge_id for note API endpoints

### Implementation Notes
- Notes sorted by page_number ASC in repository
- Modal closes on backdrop click with proper a11y (role="button", onKeyDown)
- NoteState: 'not_started' (0 notes), 'in_progress' (>0 notes)
- Nullable coalescing (record.id ?? 0) to avoid non-null assertion

### Next Steps
- Deploy migration: `wrangler d1 migrations apply knue-bookflow-db`
- Test note creation/editing in production

### Session 2025-11-23 (UI tweak)
- Completed TASK-024 (SPEC-notes-002): moved note creation control to the top of NoteModal, added ordering helper with unit test (TEST-notes-ui-006), and adjusted spacing so users can start writing without scrolling past long histories.
- Completed TASK-025 (SPEC-notes-002): removed the '(작성 예정)' placeholder on book cards when no notes exist, added helper + test (TEST-notes-ui-007) to keep the copy hidden.
- Completed TASK-026 (SPEC-frontend-001): simplified filters by removing author/due-status/min-renew controls; only search and loan-state remain. Updated spec TEST-frontend-004 and added filterBooks helper + tests.
- Addressed PR feedback (2025-11-23): removed noteLayout helper/ordering indirection; NoteModal now renders entry section followed by notes directly to reduce complexity.

### Session 2025-11-23 (UI improvements)
- Completed TASK-027 (SPEC-frontend-001): Frontend UI improvements
  - Established pastel color design system:
    - primary: #7EB8DA (pastel blue)
    - secondary: #A8D5BA (pastel mint)
    - success: #A8D5BA (pastel green)
    - warning: #F5D89A (pastel yellow)
    - error: #F4A7B9 (pastel pink)
  - Added completion status (완독) toggle UI:
    - Integrated existing updateReadStatus API
    - Added CheckCircle icons and success color for completed state
    - Toggle button below notes section in BookCard
  - Updated main page statistics:
    - Changed from dueStatus-based (연체/임박/여유) to reading progress-based
    - New stats: 대여중, 독서중, 완료, 총
    - 대여중: on_loan && !isRead && noteCount === 0
    - 독서중: noteCount > 0 && !isRead
    - 완료: isRead === true
  - Fixed note edit button:
    - Added scroll-to-top behavior when edit form opens
    - Uses dialogContentRef with smooth scroll animation
- All 68 tests passing
- Branch: feature/frontend-ui-improvements
