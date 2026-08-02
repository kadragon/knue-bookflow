## Deferred: feat/aladin-book-request (PR #134) — P3 out-of-scope items

- [ ] `SearchBooksPage.tsx` — Isolate 신청 pending state per Aladin card (track the in-flight `isbn13`) so clicking one card does not disable every other card's button. Currently all cards share `isRequestPending` (matches the bookshelf read-status disable-all pattern). [agy P3]
- [ ] `SearchBooksPage.tsx` — Two `FeedbackSnackbar`s (대출 예정 + 신청) can overlap if both open at once. In practice mutually exclusive (대출 예정 shows only when KNUE has results, 신청 only when it has none), and the pattern predates this PR. Consider a single shared feedback/toast queue. [pr-review P3]
