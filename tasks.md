## Review Backlog

### PR #140 — fix/practice-sheet-no-repeat (2026-06-16)

- [ ] [doc] Update stale JSX comment "repeated to fill one page, clipped past it" → now rendered as-is (source: review) — `packages/frontend/src/pages/PracticePage.tsx:496`
- [ ] [debt] Guide lines/grid only span text rows for short notes; no filler to cover the rest of the A4 sheet (source: codex) — `packages/frontend/src/pages/PracticePage.tsx`
- [ ] [debt] `fillPracticeContent` accepts `_fontSize` but never uses it; callers in PracticePage.tsx still pass `fontSize` unnecessarily — remove param and update call sites, or add API stability comment (source: review) — `packages/frontend/src/pages/practiceFill.ts:2`

### PR #138 — feat/practice-edit-single-page (2026-06-12)

- [ ] [debt] Invalidate `['notes', bookId]` / `['book', bookId]` / `['books']` after practice-page note edit; other note edit flows do, so detail/list views stay stale until staleTime expires (source: codex) — `packages/frontend/src/pages/PracticePage.tsx:174`
- [ ] [debt] Disable 다시 뽑기 while `editing || saving`: redraw during pending save lets the stale captured `data` overwrite the fresh draw (race), and redraw mid-edit silently discards the draft (source: codex, agy) — `packages/frontend/src/pages/PracticePage.tsx:316`
- [ ] [debt] Move `setQueryData`/`setEditing(false)` out of the try block in `handleEditSave`; a post-PUT throw shows "저장에 실패했습니다" even though the save persisted (source: pr-review-toolkit:review-pr) — `packages/frontend/src/pages/PracticePage.tsx:174`
- [ ] [debt] Harden single-page print against browser default margins: add `page-break-inside: avoid` / `break-inside: avoid` on `.practice-sheet` (source: agy) — `packages/frontend/src/pages/PracticePage.tsx:530`
- [ ] [constraint] Missing tests: saveError display path (PUT failure keeps editor open + shows error), 저장 disabled on blank draft, redraw closes editor (source: pr-review-toolkit:review-pr) — `packages/frontend/src/pages/PracticePage.edit.test.tsx`
- [ ] [debt] `autoFocus` on the edit TextField so the editor is immediately typable (source: agy) — `packages/frontend/src/pages/PracticePage.tsx:351`
- [ ] [debt] (pre-existing, surfaced by review) 인쇄 button lacks `disabled={isLoading || !data}` — printing with no data yields a blank page (source: agy, verifier: pre-existing on main) — `packages/frontend/src/pages/PracticePage.tsx:321`
- [ ] [debt] (pre-existing, surfaced by review) `handleRedraw` has no try/catch; failed redraw is a silent no-op (source: pr-review-toolkit:review-pr, verifier: pre-existing on main) — `packages/frontend/src/pages/PracticePage.tsx:155`

### PR #137 — feat/practice-yeonsung-grid (2026-06-11)

- [ ] [debt] GridSheet right-of-text empty area shows only the container `borderTop`, no cell borders — visual inconsistency when a row has fewer chars than the responsive column count (source: agy) — `packages/frontend/src/pages/PracticePage.tsx:65`
- [ ] [debt] `content.split('\n')` has no null guard; `<pre>` path renders nothing on null but GridSheet would throw. TS prevents today (source: pr-review-toolkit:review-pr) — `packages/frontend/src/pages/PracticePage.tsx:63`
- [ ] [debt] `Array.from(line)` splits grapheme clusters (ZWJ/flag/skin-tone emoji) into separate cells; consider `Intl.Segmenter` (source: pr-review-toolkit:review-pr) — `packages/frontend/src/pages/PracticePage.tsx:79`
- [ ] [debt] NBSP substitution `ch === ' ' ? ' ' : ch` is redundant in a fixed-width centered flex cell; could render `{ch}` directly (source: pr-review-toolkit:review-pr) — `packages/frontend/src/pages/PracticePage.tsx:100`
- [ ] [debt] `guideBackground` grid branch is dead code — grid routes to GridSheet before the fn is called; could add a `never` exhaustive check (source: pr-review-toolkit:review-pr) — `packages/frontend/src/pages/PracticePage.tsx:43`
- [ ] [wontfix] Merge the two Google Fonts `<link>` requests into one URL — intentionally kept standalone per maintainer request (source: pr-review-toolkit:review-pr) — `packages/frontend/index.html:12,14`

### PR #136 — feat/practice-sheet (2026-06-09)

- [ ] [debt] Migration 0004 header comment says "for Telegram broadcast" and references SPEC-notes-telegram-001; table is now used by practice sheet draw tracker (source: pr-review-toolkit:review-pr) — `packages/backend/migrations/0004_note_send_stats.sql`
- [ ] [debt] `D1NoteSelectionRepository` not exported — cannot be directly unit-tested without going through factory (source: pr-review-toolkit:review-pr) — `packages/backend/src/services/note-selection.ts:93`

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
