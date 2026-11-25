# Backlog

## Now

(none)

## Next

- [ ] [ux] Hide the manual trigger and sync actions from non-admin users, who now get 403 from `/trigger` and `/api/books/sync`; expose the caller's admin flag to the frontend (for example `GET /api/me`) (source: per-user separation phase 1) — `packages/frontend/src/App.tsx`

## Someday

## Review Backlog

### PR #178 — Separate user data per Cloudflare Access identity (2026-11-25)

- [ ] [debt] Per-user API responses still send `Cache-Control: private, max-age=30` (books) and `max-age=15` (notes), so after switching Access accounts in one browser the previous user's shelf or notes can be reused from cache; send `no-store` for user-scoped responses (source: codex) — `packages/backend/src/handlers/books-handler.ts:40` (introduced here)
- [ ] [debt] A JWT segment whose length is 4k+1 makes `atob` throw a DOMException instead of AccessTokenError, so a malformed signature gets 503 and an error log instead of 401; reject that length as malformed (source: agy) — `packages/backend/src/services/access-auth.ts:106` (introduced here)
- [ ] [debt] `getRenewalLogs` scopes owner-only `renewal_logs` through `charge_id`, so a non-owner book with the same charge id would see the owner's logs; restrict it to `OWNER_USER_ID` (latent: no caller today) (source: agy) — `packages/backend/src/services/book-repository.ts:295` (introduced here)
- [ ] [debt] Rename `SIGNING_KEYS_MIN_REFRESH_MS` so the name says it is the unknown-kid refetch cooldown (source: comments) — `packages/backend/src/services/access-auth.ts:21`
- [ ] [debt] Extract the owner-row guard in `authenticateRequest` (`id === OWNER_USER_ID` for a non-admin) into a named predicate (source: comments) — `packages/backend/src/services/access-auth.ts:338`

### PR #175 — Subscribable loan due date calendar (2026-11-23)

- [ ] [debt] Reconcile outstanding D1 loans against the current charge list when their returns are older than the most recent 20 histories (source: codex) — `packages/backend/src/services/library-client.ts:133`
