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
- **Frontend**: React SPA (Vite) hosted via Worker Assets
- **Testing**: Vitest Workspaces (separating Workers/Node and Frontend/jsdom)

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
- **Hybrid Testing**: Vitest workspaces allow running node-compatible Worker tests and jsdom-based React tests in the same repo without conflict.

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

### Session 2025-11-23 (Telegram note broadcast)
- Completed TASK-028 (SPEC-notes-telegram-001): Daily Telegram reading note broadcast at 12:00 KST
  - Added note_send_stats table (0004_note_send_stats.sql) to track per-note send_count/last_sent_at
  - Implemented note-broadcast service with selection from lowest send_count, message format "title - author\np.xx\ncontent"
  - Added TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to env types/config; new cron 0 3 * * * in wrangler
  - Scheduled handler branches on event.cron between renewal (0 10) and note broadcast (0 3)
  - Tests: selection fairness, formatting, skip when no notes, Telegram failure handling; `npm test` passing (73 tests)

### Session 2025-11-23 (Stats filter + defaults)
- Completed TASK-029 (SPEC-frontend-001): Updated top stats to 대여중/미완료/완료/총 with clickable cards that filter the grid,
  introduced stat-based filtering in filterBooks, and set the initial loan-state filter to '대출 중' via shared defaultFilters.
  Tests: `npm test -- filterBooks` (stat filters + default preset).
  Pattern: keep shared defaults exported so acceptance requirements stay testable and in sync with UI state.

### Session 2025-11-23 (Book Detail Page)
- Completed TASK-030 (SPEC-book-detail-001): Created dedicated book detail page with two-column layout
  - Added React Router (react-router-dom) for client-side navigation
  - Created GET /api/books/:id endpoint returning single book with notes
  - Implemented BookDetailPage component with:
    - Left panel: Book info (cover, title, author, publisher, description, dates, status chips)
    - Right panel: Notes list with full CRUD (add/edit/delete)
    - Completion toggle (완독) button
    - Back navigation to bookshelf
  - Added handleGetBook in books-handler.ts using findById and findByBookId
  - Refactored App.tsx: BookshelfPage component with Routes wrapper
  - Clickable book covers and titles navigate to /books/:id
  - Responsive layout: single column on mobile, two columns on desktop
  - All 83 tests passing, lint clean
  - Key patterns:
    - Shared NoteItem type between App and BookDetailPage
    - React Query cache invalidation for books and book detail queries
    - dbId (database ID) used for routing and API calls

### Session 2025-11-23 (Notes layout)
- Completed TASK-031 (SPEC-book-detail-001): Removed inner scrollbar from book detail notes list so long notes expand page height; added NOTES_LIST_SX constant and layout test to prevent reintroducing fixed-height overflow.

### Session 2025-11-23 (Aladin cover size)
- Completed TASK-032 (SPEC-bookinfo-001): Added `Cover=Big` to Aladin ItemLookUp requests so we always fetch the largest cover image. Added a unit test to assert the parameter is present.

### Session 2025-11-23 (Cover refresh)
- Refreshed sync logic to re-fetch Aladin metadata when a stored book has a missing cover_url. BookRepository updates now coalesce new cover/description values on update. Added tests for cover refresh and update bindings.

### Session 2025-11-23 (Return sync)
- Completed TASK-034 (SPEC-return-001): Added discharge_date column via migration 0006, fetched paginated charge histories, matched returns by charge_id with ISBN fallback, and updated sync summary to report marked-returned count. Returned books now emit loanState=returned with daysLeft=0 and dueStatus=ok so they drop from the active loan view while remaining queryable.

### Session 2025-11-26
- Completed TASK-035 (SPEC-notes-telegram-002): Telegram note broadcast now uses MarkdownV2 formatting (bold title, italic author, escaped page line, blockquoted content), escapes all reserved characters including backslash/dot/dash, and sends requests with parse_mode=MarkdownV2 and link previews disabled. Added tests for formatting, escaping, and payload fields; `npm test -- --run src/services/__tests__/note-broadcast.test.ts` passing.
- Completed TASK-036 (SPEC-notes-telegram-002): Refined formatting per review by centralizing the MarkdownV2 escape regex, adding an author fallback, tolerating missing page numbers, and ensuring multiline content is quoted line-by-line. Added tests for multiline content, page placeholder, and payload assertions; `npm test -- --run src/services/__tests__/note-broadcast.test.ts` passing.
- Completed TASK-037 (SPEC-notes-telegram-002): Addressed review nits by removing redundant author nullish coalescing and skipping the content block when empty to avoid blank blockquotes. Added regression test for empty content; targeted test run remains green.

### Session 2025-12-03
- Completed TASK-038 (SPEC-maintenance-001): Added `wrangler build` to `.github/workflows/ci.yml` to ensure the Cloudflare Worker build process is validated during continuous integration.

### Session 2025-12-11
- Completed TASK-039 (SPEC-ci-002): Introduced React component smoke tests to CI.
  - Problem: CI wasn't catching React/ReactDOM version mismatches (runtime error) because only logic unit tests were running.
  - Solution: Installed `@testing-library/react` and `jsdom`. Configured Vitest Workspaces to separate Worker (Node) and Frontend (jsdom) environments.
  - Outcome: `npm test` now runs both worker logic tests and a frontend `App` smoke test.

### Session 2025-12-11 (governance tidy)
- Completed TASK-040 (SPEC-governance-001): Compacted task/governance registries.
  - Cleared backlog to only pending tasks (now empty), normalized done.yaml into a single completed_tasks list, and reset current.yaml to null.
  - Added SPEC-governance-001 to codify maintenance/compaction behaviors.
  - Ensured historical tasks 001-007 recorded with explicit "unknown" timestamps to avoid loss of traceability.

### Session 2025-12-11 (library search tests)
- Completed TASK-041 (SPEC-search-001): Added comprehensive integration tests for search handler.
  - Created SPEC-search-001 with GWT acceptance tests for library book search API
  - Added 18 integration tests in search-handler.test.ts:
    - Parameter validation (query, max, offset) with edge cases (empty, NaN, boundaries)
    - Error handling for API failures (500 responses)
    - Response format verification (metadata, transformed fields)
    - Cache headers (Cache-Control: public, max-age=300)
    - Optional field handling (null author, missing ISBN)
  - All 122 tests passing across project (73 worker tests, 49 frontend tests)
  - Key patterns:
    - Use async beforeEach for proper vi.mock module import isolation
    - Test edge cases: empty strings, NaN values, boundary conditions
    - Verify HTTP response headers in API integration tests
    - Mock LibraryClient.searchBooks with vi.fn() and createLibraryClient factory

### Session 2025-12-11 (PR review fixes)
- Completed TASK-042: Applied PR review feedback from gemini-code-assist[bot] (PR #49).
  - Fixed Material-UI prop usage: replaced `slotProps.input` with `InputProps` for TextField
    - `slotProps.input` passes props to native input element, not the Input component
    - `InputProps` correctly passes startAdornment/endAdornment to OutlinedInput
  - Added URL parameter validation for page number with validatePageParam helper
    - Validates parsed page is not NaN and greater than 0, defaults to 1 otherwise
    - Prevents crashes from malicious/invalid URL params (page=abc, page=0, page=-1)
  - Created SearchBooksPage.test.ts with 8 unit tests for validatePageParam
    - Tests null, empty, non-numeric, zero, negative, valid positive, whitespace cases
  - All 130 tests passing (122 worker/frontend + 8 new validation tests)
  - Key learnings:
    - Always validate user-supplied URL parameters with explicit checks
    - Material-UI v5+ has different prop structures: slotProps vs component-specific props
    - Extract validation logic to testable helper functions

### Session 2025-12-11 (Planned loans)
- Completed TASK-043 (SPEC-loan-plan-001): Added planned loans D1 table/migration 0007, repository, and /api/planned-loans POST/GET/DELETE with duplicate guard on libraryId and branch volume parsing.
- Frontend: New /planned page listing planned items with removal, + buttons on Search/NewBooks pages, shared payload helpers, and branch availability summary.
- Tests: Added planned-loans handler tests and payload builder tests; `npm test` now 139 passing.
- Next: apply migration 0007 to production D1 and sanity-check planned list UI against live catalog data.

### Session 2025-12-11 (Planned loans sync)
- Completed TASK-044 (SPEC-loan-plan-001): processCharge now deletes planned loans by library biblio id after syncing charges, ensuring borrowed items drop from "대출 예정" automatically.
- Added repo helper deleteByLibraryBiblioId and test TEST-loan-plan-006; full suite now 140 tests passing.
