## Deferred: feat/aladin-book-request (PR #134) — P3 out-of-scope items

- [ ] `SearchBooksPage.tsx` — Isolate 신청 pending state per Aladin card (track the in-flight `isbn13`) so clicking one card does not disable every other card's button. Currently all cards share `isRequestPending` (matches the bookshelf read-status disable-all pattern). [agy P3]
- [ ] `SearchBooksPage.tsx` — Two `FeedbackSnackbar`s (대출 예정 + 신청) can overlap if both open at once. In practice mutually exclusive (대출 예정 shows only when KNUE has results, 신청 only when it has none), and the pattern predates this PR. Consider a single shared feedback/toast queue. [pr-review P3]

## Deferred: feat/diverse-note-selection (PR #130) — P3 out-of-scope items

- [x] `note-broadcast.ts:178` — Log when cooldown fallback triggers (`[NoteBroadcast] All candidates in cooldown; bypassing filter`)
- [x] `note-broadcast.ts:180` — Add comment explaining inverse-rank weighting policy (`1/(sendCount+1)`)
- [x] `note-broadcast.ts:299` — Plumb `now`/`cooldownDays` through `NoteBroadcastDeps` for integration-test clock injection
- [x] `note-broadcast.test.ts` — Add test with `lastSentAt: 'not-a-date'` to pin NaN behavior
- [x] `note-broadcast.test.ts:101-126` — Add boundary tests: `randomFn() => 0` and `randomFn() => 0.9999`

## Sprint: feat/cron-observability

Done-when:
- [x] `GET /api/cron-runs?limit=N` returns rows from `cron_runs` D1 table
- [x] `GET /api/cron-runs/latest` returns one row per phase (most recent)
- [x] Each of the 4 cron phases (`note_broadcast`, `renewal`, `sync`, `due_soon_broadcast`) writes a row on every invocation
- [x] `bun run typecheck` passes
- [x] `bun run test` passes (new repo + handler tests added)
- [x] `limit` query param validated with Zod; non-numeric input → 400
