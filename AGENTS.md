# knue-bookflow - AGENTS

Last Updated: 2026-02-21
Framework: TDD (Test-Driven Development)

## Project Overview
KNUE BookFlow is a Cloudflare Workers-based automatic book renewal system for Korea National University of Education library.

## Operating Principles
- TDD first: RED -> GREEN -> REFACTOR.
- Keep changes minimal and focused.
- Maintain quality gates on every change.

## Architecture & Data Flow
- Monorepo: `packages/backend` (Worker + D1), `packages/frontend` (React/Vite), `packages/shared` (types).
- Platform: Cloudflare Workers + D1 + Cron; frontend assets served via Worker `ASSETS`.
- External APIs: KNUE Pyxis (login/charges/renew/items) and Aladin ItemLookUp for metadata.
- Core flow: sync/manual job -> LibraryClient -> BookRepository; AladinClient enriches by ISBN; frontend uses `/api/books`.
- Renewal eligibility: `renewCnt == 0` and due within 2 days (KST defaults).

## Runtime & Config
- Wrangler config in `packages/backend/wrangler.toml` (compatibility_date `2024-11-01`).
- D1 binding name: `DB`; secrets: `LIBRARY_USER_ID`, `LIBRARY_PASSWORD`, `ALADIN_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- Cron: `0 3 * * *` (note broadcast, 12:00 KST); route `book.kadragon.work/*`.
- Observability: logs on; traces enabled with 0.1 sampling.

## Patterns & Tooling
- API clients (LibraryClient/AladinClient), repository pattern for D1 (Book/Note/PlannedLoan).
- Scheduled handlers wrap work in `ctx.waitUntil`.
- Vitest uses `--configLoader runner` with backend + frontend projects.
## Workflows & Commands
- Dev: `bun run dev` (backend), `bun run dev:frontend` (frontend).
- Build: `bun run build` (all), `bun run build:frontend`, `bun run build:backend`.
- Deploy: `bun run deploy` (backend worker).
- DB migrations: `bun run db:migrate` (backend D1).
- Tests: `bun run test` (vitest runner).
- Lint/format: `bun run lint`, `bun run lint:fix`, `bun run format`, `bun run typecheck`.
- Pre-commit hook runs: `bunx lint-staged`, `bun run typecheck`, `bun run test`.

## Governance Notes
- Governance/spec/task folders were compacted into this AGENTS.md; SDD/spec references removed.
- Package management standardized on Bun (bun.lock, CI, Dependabot).
- Read status storage: `is_read` 0 = unread, 1 = finished, 2 = abandoned; API uses `ReadStatus`.

## Tasks
Active/Backlog: None

## Ownership & Review
- Maintainer: see OWNERS or repository settings
