# Backlog

## Now

(none)

## Next

- [ ] [ux] Hide the manual trigger and sync actions from non-admin users, who now get 403 from `/trigger` and `/api/books/sync`; expose the caller's admin flag to the frontend (for example `GET /api/me`) (source: per-user separation phase 1) — `packages/frontend/src/App.tsx`

## Someday

## Review Backlog

### PR #175 — Subscribable loan due date calendar (2026-11-23)

- [ ] [debt] Reconcile outstanding D1 loans against the current charge list when their returns are older than the most recent 20 histories (source: codex) — `packages/backend/src/services/library-client.ts:133`
