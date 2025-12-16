# Design Patterns

## API Client Pattern
External API interactions should use a client wrapper class:
```typescript
class LibraryClient {
  private session: SessionData;

  async login(credentials: Credentials): Promise<void>
  async getCharges(): Promise<Charge[]>
  async renewCharge(chargeId: string): Promise<RenewalResult>
}
```

## Result Type Pattern
Use discriminated unions for operation results:
```typescript
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };
```

## Repository Pattern
D1 database access through repository classes:
```typescript
class BookRepository {
  constructor(private db: D1Database)
  async save(book: Book): Promise<void>
  async findByIsbn(isbn: string): Promise<Book | null>
}
```

## Cron Handler Pattern
Scheduled tasks follow this structure:
```typescript
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleScheduledTask(env));
  }
}
```

## Vitest Projects Pattern
Run multiple package configs from the repo root via `test.projects` (Vitest 4), and prefer `--configLoader runner` when configs import ESM-only dependencies.
