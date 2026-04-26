# knue-bookflow Agent Rules

Cloudflare Workers + D1 monorepo for KNUE library auto-renewal, Aladin metadata enrichment, and Telegram broadcast. Bun workspaces: `packages/backend` (Worker + D1 + Cron), `packages/frontend` (React 19 + MUI 7), `packages/shared` (types).

## Docs Index (read on demand)

| File | When to read |
|------|--------------|
| `docs/architecture.md` | Before changing source layout, adding a package, or crossing layer boundaries |
| `docs/conventions.md` | Before writing a handler, repository, client, or migration |
| `docs/workflows.md` | At the start of every implementation cycle |
| `docs/delegation.md` | Before spawning a sub-agent or splitting work |
| `docs/eval-criteria.md` | Before declaring a feature done |
| `docs/runbook.md` | For build, test, deploy, secrets, and Wrangler commands |

## Golden Principles

Invariants. Violations block commits or fail review.

1. **D1 access only through `services/*-repository.ts`** — Handlers and clients call repositories; no raw `env.DB.prepare(...)` outside the repository layer. Enforced by code review + sweep grep.
2. **D1 migrations are append-only** — Never edit a committed migration; add the next-numbered file under `packages/backend/migrations/`. Enforced by review.
3. **Secrets only via Wrangler env binding** — `LIBRARY_USER_ID`, `LIBRARY_PASSWORD`, `ALADIN_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET` come from `wrangler secret put`. Hardcoded values rejected by review; `.dev.vars` is gitignored.
4. **Zod validation at API boundaries** — Every handler that parses JSON body or query params validates with a Zod schema before touching repositories. Enforced by review.
5. **Pre-commit gate is non-negotiable** — `bunx lint-staged && bun run typecheck && bun run test` runs on every commit (simple-git-hooks). Never `--no-verify`. Enforced mechanically by hook.

## Delegation

Single-maintainer project — most edits are direct. Delegate only when an objective trigger fires.

| Trigger (objective) | Delegate to | Model |
|---------------------|-------------|-------|
| First edit of session in `packages/backend/src/` | Explore agent | sonnet |
| Change touches ≥3 directories or ≥5 files | Explore + Plan | sonnet |
| Modifying `migrations/`, `wrangler.toml`, or `.github/workflows/` | Plan agent (impact review first) | sonnet |
| Same failure x2 | `codex:rescue` for second opinion | (codex) |
| Pre-merge sanity check on a diff | `/codex:review` | (codex) |

See `docs/delegation.md` for the Spawn Prompt Contract and full routing.

## Token Economy

1. Do not re-read a file already read in this session. Re-read only the diff/region.
2. Do not call tools just to confirm what you already know.
3. Run independent tool calls in parallel.
4. Delegate any analysis that would produce >20 lines of output; return only the conclusion.
5. Do not restate the user's message back to them.

Prefer **context resets over compaction** for multi-session work. Write `handoff-{feature}.md` at the start of long work — not after context degrades.

## Working with Existing Code

- D1 schema lives in numbered SQL migrations; apply remote with `bun run db:migrate`.
- Cron `0 3 * * *` UTC (12:00 KST) drives the daily note broadcast and renewal pipeline. Sync runs are also exposed manually via `POST /trigger`.
- `read_status`: `0` = unread, `1` = finished, `2` = abandoned (`packages/backend/src/utils/read-status.ts`, `ReadStatus` in `shared`).
- Frontend assets are served by the Worker via `[assets] binding = ASSETS` from `packages/frontend/dist/`. Run `bun run build` (full chain) before `bun run deploy`.
- Renewal eligibility: `renewCnt == 0` AND due within 2 days, KST defaults.

## Language Policy

- Code, commits, repo artifacts, comments, doc files: English.
- User-facing chat with maintainer: Korean.

## Maintenance

Update this file **only** when ALL of the following are true:

1. Information is not directly discoverable from code / config / manifests / docs
2. It is operationally significant — affects build, test, deploy, or runtime safety
3. It would likely cause mistakes if left undocumented
4. It is stable and not task-specific

**Never add:** architecture summaries, directory overviews, style conventions already enforced by tooling, anything already visible in the repo, or temporary / task-specific instructions.

Prefer modifying or removing outdated entries over appending. When unsure, add a short inline `TODO:` comment rather than inventing guidance.

Size budget: target ≤100 lines, hard warn >200. Move long content to `docs/*.md` and leave a pointer line here.
