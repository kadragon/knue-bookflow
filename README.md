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
- Secrets: `LIBRARY_USER_ID`, `LIBRARY_PASSWORD`, `ALADIN_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- Cron: `0 3 * * *` (note broadcast, 12:00 KST)
- Route: `book.kadragon.work/*`
- Observability: logs on; traces enabled with 0.1 sampling

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
