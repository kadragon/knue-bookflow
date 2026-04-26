# Conventions

Only what Biome / TypeScript / Vitest don't already enforce.

## Naming

| Element | Pattern | Example |
|---------|---------|---------|
| Source files | `kebab-case.ts` | `note-broadcast.ts`, `library-client.ts` |
| React components | `PascalCase.tsx` | `BookCard.tsx`, `App.tsx` |
| Test files | `*.test.ts` / `*.test.tsx` | `filterBooks.test.ts` |
| Handler functions | `handle{Verb}{Resource}` | `handleGetBook`, `handleCreateNote` |
| Repository factories | `create{Resource}Repository` | `createBookRepository(db)` |
| Migration files | `NNNN_description.sql` (zero-padded, 4 digits) | `0011_add_planned_loan_dismissals.sql` |
| D1 columns | `snake_case` | `read_status`, `discharge_date`, `isbn13` |
| TypeScript fields | `camelCase`; map at the repo boundary | `readStatus`, `dischargeDate` |
| Env vars / secrets | `SCREAMING_SNAKE_CASE` | `TELEGRAM_BOT_TOKEN` |
| Cron handler branches | switch on `event.cron === NOTE_BROADCAST_CRON` | constants in `services/note-broadcast.ts` |

## Code Style

### Backend handler shape

```ts
export async function handleCreateNote(req: Request, env: Env): Promise<Response> {
  const body = createNoteSchema.safeParse(await req.json());
  if (!body.success) return jsonError(400, body.error);
  const repo = createNoteRepository(env.DB);
  const note = await repo.insert(body.data);
  return jsonResponse(201, note);
}
```

- Parse + validate (`zod`) before any side effect.
- Build repos / clients inside the handler — they're cheap and keep `env` local.
- Return via `utils/response.ts` helpers; do not new up `Response` ad hoc.

### Repository shape

```ts
export function createBookRepository(db: D1Database) {
  return {
    async findByIsbn(isbn: string): Promise<Book | null> { ... },
    async upsert(book: Book): Promise<void> { ... },
  };
}
```

- One factory per table (or aggregate). Keep methods small and typed.
- Map `snake_case` rows → `camelCase` domain objects inside the repo.
- No business logic here — just SQL + mapping.

### Scheduled pipelines

- All durable work goes inside `ctx.waitUntil(...)`.
- One `waitUntil` per logical task (e.g. broadcast vs. renewal). Keep them independent.
- Top-level `scheduled()` switches on `event.cron`; unknown cron logs and returns.

### Error handling

- External fetch failures: wrap with a domain error and log structured context (`{ source: 'library-client', op: 'login' }`).
- Never swallow with empty `catch`. Either rethrow, log + degrade explicitly, or convert to a typed result.
- Repository errors propagate; handlers convert to `5xx` via `jsonError`.

## API Conventions

### Response shape

JSON envelopes match the existing `/api/books`-style responses — keep `{ data, meta }` patterns consistent across endpoints. Pagination uses `utils/pagination.ts` (cursor or `{page, perPage}` — match neighbours when adding).

### Status codes

| Scenario | Code |
|----------|------|
| Success (read) | 200 |
| Success (create) | 201 |
| Validation error (Zod) | 400 |
| Telegram secret mismatch / auth | 401 / 403 |
| Not found | 404 |
| Upstream (Pyxis/Aladin) failure | 502 |
| Server error | 500 |

## Migrations

- One concern per file. Reversible-by-design when feasible (additive columns, new tables) — destructive ops require a follow-up migration, never in-place edits.
- Index changes go in dedicated migrations (`0009_add_query_performance_indexes.sql` is the model).
- Test locally with `wrangler d1 migrations apply knue-bookflow-db --local` before `bun run db:migrate`.

## Frontend

- Data fetching uses `@tanstack/react-query`; never call `fetch` from a component directly — go through `src/api.ts`.
- MUI components only — no inline styles for layout, no styled-components/CSS modules.
- Tests use `@testing-library/react` + `jsdom` (already configured in `vitest.config.ts`).

## Git

### Commit messages

```
[TYPE] short imperative description

TYPE ∈ FEAT | FIX | REFACTOR | DOCS | DEPS | STRUCTURAL | CONSTRAINT | HARNESS | PLAN | codex
```

Existing log: `[FEAT]`, `[FIX]`, `[DEPS]`, `[STRUCTURAL]`, `[codex]` are observed. Match neighbours.

### Branch policy

- **Never commit directly to `main`.** Create a branch (`feat/...`, `fix/...`, `chore/...`, `harness/...`) before the first edit.
- One logical change per branch. Pre-commit hook runs lint + typecheck + tests — do not bypass with `--no-verify`.
- PRs target `main`. CI must be green before merge.

### Counter-examples

| Don't | Do |
|-------|-----|
| `await env.DB.prepare("SELECT ...").first()` in a handler | Call a repository method |
| Edit `migrations/0007_*.sql` to fix a typo | Add `migrations/0012_*.sql` with the correction |
| `process.env.TELEGRAM_BOT_TOKEN` | Use the typed `env: Env` parameter |
| Hardcode `"Bearer ..."` for tests | Use `.dev.vars` or test fixtures |
