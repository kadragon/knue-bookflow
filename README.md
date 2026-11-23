# knue-bookflow

Cloudflare Workers-based automatic book renewal system for Korea National University of Education library.

## Architecture

- **Monorepo**: `packages/backend` (Worker + D1), `packages/frontend` (React/Vite), `packages/shared` (types)
- **Platform**: Cloudflare Workers + D1 + Cron; frontend assets served via Worker `ASSETS`
- **External APIs**: KNUE Pyxis (login/charges/renew/items), Aladin ItemLookUp (metadata)
- **Core flow**: sync/manual job → LibraryClient → BookRepository; AladinClient enriches by ISBN; frontend uses `/api/books`
- **Renewal eligibility**: `renewCnt == 0` and due within 2 days (KST defaults)

## Runtime & Config

- Wrangler config: `packages/backend/wrangler.toml` (compatibility_date `2024-11-01`)
- D1 binding: `DB`
- Secrets: `LIBRARY_USER_ID`, `LIBRARY_PASSWORD`, `ALADIN_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `CALENDAR_FEED_TOKEN` (optional)
- Cron: `0 3 * * *` (note broadcast, 12:00 KST)
- Route: `book.kadragon.work/*`
- Observability: logs on; traces enabled with 0.1 sampling

## Loan due date calendar

The feed groups active loans that have used their renewal allowance into all-day `N권 반납` events by due date in Korea Standard Time. Each event lists the book titles from the latest library sync.

```bash
openssl rand -hex 32
bun run --cwd packages/backend wrangler secret put CALENDAR_FEED_TOKEN
```

Paste the generated token at the Wrangler prompt. In Google Calendar on the web, choose **Other calendars → + → From URL** and enter `https://book.kadragon.work/api/calendar.ics?token=<CALENDAR_FEED_TOKEN>`. Keep the full subscription URL private.

Production Cloudflare Access needs an exception for the feed path so Google can fetch it. See the [runbook](docs/runbook.md#loan-due-date-calendar). Google refreshes subscriptions on its own schedule, so changes can take hours to appear.

## Patterns

- API clients (LibraryClient/AladinClient), repository pattern for D1 (Book/Note/PlannedLoan)
- Scheduled handlers wrap work in `ctx.waitUntil`
- Read status: `is_read` 0 = unread, 1 = finished, 2 = abandoned; API uses `ReadStatus`
- Package management: Bun

## Development

```bash
bun run dev            # backend
bun run dev:frontend   # frontend
bun run build          # all
bun run deploy         # backend worker
bun run db:migrate     # D1 migrations
bun run test           # vitest (--configLoader runner)
bun run lint           # lint
bun run lint:fix       # lint + fix
bun run format         # format
bun run typecheck      # type check
```

Pre-commit hook runs: `bunx lint-staged`, `bun run typecheck`, `bun run test`.
