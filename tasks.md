## Sprint: feat/cron-observability

Done-when:
- [x] `GET /api/cron-runs?limit=N` returns rows from `cron_runs` D1 table
- [x] `GET /api/cron-runs/latest` returns one row per phase (most recent)
- [x] Each of the 4 cron phases (`note_broadcast`, `renewal`, `sync`, `due_soon_broadcast`) writes a row on every invocation
- [x] `bun run typecheck` passes
- [x] `bun run test` passes (new repo + handler tests added)
- [x] `limit` query param validated with Zod; non-numeric input → 400
