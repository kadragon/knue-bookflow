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
