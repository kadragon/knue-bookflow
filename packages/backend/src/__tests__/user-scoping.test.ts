/// <reference types="node" />

/**
 * Per-user data separation, end to end: real Access JWT verification, the
 * Worker router, handlers and repositories over the migrated schema.
 */

import type { DatabaseSync } from 'node:sqlite';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import worker from '../index';
import {
  BookRepository,
  BookRequestRepository,
  clearAccessSigningKeyCache,
  createNoteSelectionRepository,
  NoteRepository,
  PlannedLoanDismissalRepository,
  PlannedLoanRepository,
  UserRepository,
} from '../services';
import type { Env } from '../types';
import {
  certsFetch,
  generateSigningKey,
  type SigningKey,
  signToken,
} from './helpers/access-jwt';
import { createMigratedDatabase, createSqliteD1 } from './helpers/sqlite-d1';

const TEAM_ORIGIN = 'https://bookflow-test.cloudflareaccess.com';
const AUD = 'bookflow-aud';
const ADMIN = 'admin@example.com';
const MEMBER = 'member@example.com';
const OWNER_ID = 1;
const MEMBER_ID = 2;
const ctx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext;

let signingKey: SigningKey;
let db: DatabaseSync;
let env: Env;

beforeAll(async () => {
  signingKey = await generateSigningKey('kid-1');
});

function seed(database: DatabaseSync): void {
  database.exec(`
    INSERT INTO users (id, email, access_sub) VALUES (2, '${MEMBER}', 'sub-2');

    INSERT INTO books (id, user_id, charge_id, isbn, title, author, charge_date, due_date, renew_count, is_renewable)
    VALUES
      (1, 1, 'c-1', '111', 'Owner Book', 'A', '2026-11-01', '2026-11-30', 1, 0),
      (2, 2, 'c-1', '222', 'Member Book', 'B', '2026-11-02', '2026-11-30', 1, 0);

    INSERT INTO notes (id, book_id, page_number, content)
    VALUES (1, 1, 10, 'owner note'), (2, 2, 20, 'member note');

    INSERT INTO renewal_logs (charge_id, action, status, message)
    VALUES ('c-1', 'renewal_attempt', 'success', 'Renewed');

    INSERT INTO planned_loans (id, user_id, library_biblio_id, source, title, author)
    VALUES (1, 1, 100, 'request_book', 'Owner Plan', 'A'),
           (2, 2, 100, 'search', 'Member Plan', 'B');

    INSERT INTO planned_loan_dismissals (user_id, library_biblio_id) VALUES (1, 300);

    INSERT INTO book_requests (id, user_id, isbn13, title)
    VALUES (1, 1, '9780000000001', 'Owner Request'),
           (2, 2, '9780000000001', 'Member Request');
  `);
}

beforeEach(() => {
  clearAccessSigningKeyCache();
  vi.stubGlobal('fetch', certsFetch(TEAM_ORIGIN, signingKey));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  db = createMigratedDatabase();
  seed(db);
  env = {
    DB: createSqliteD1(db),
    ASSETS: {
      fetch: async () => new Response('Not Found', { status: 404 }),
    } as unknown as Fetcher,
    LIBRARY_USER_ID: 'library-user',
    LIBRARY_PASSWORD: 'library-pass',
    ALADIN_API_KEY: 'aladin',
    TELEGRAM_BOT_TOKEN: 'bot',
    TELEGRAM_CHAT_ID: 'chat',
    ENVIRONMENT: 'production',
    ACCESS_TEAM_DOMAIN: 'bookflow-test.cloudflareaccess.com',
    ACCESS_AUD: AUD,
    ADMIN_EMAIL: ADMIN,
  };
});

afterEach(() => {
  db.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function call(
  path: string,
  options: {
    as?: string;
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<Response> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.as) {
    headers['Cf-Access-Jwt-Assertion'] = await signToken(signingKey, {
      aud: [AUD],
      iss: TEAM_ORIGIN,
      exp: Math.floor(Date.now() / 1000) + 600,
      email: options.as,
      sub: `sub-${options.as}`,
    });
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  return worker.fetch(
    new Request(`https://book.example.com${path}`, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
    env,
    ctx,
  );
}

function scalar(sql: string): unknown {
  const row = db.prepare(sql).get() as Record<string, unknown> | undefined;
  return row ? Object.values(row)[0] : undefined;
}

describe('Access authentication at the Worker boundary', () => {
  it.each([
    ['GET', '/api/books'],
    ['PUT', '/api/notes/1'],
    ['GET', '/api/search?query=x'],
    ['GET', '/api/new-books'],
    ['GET', '/api/aladin/isbn/9780000000001'],
    ['GET', '/api/external-search?query=x'],
    ['POST', '/trigger'],
    ['GET', '/api/unknown'],
  ])('rejects %s %s without an Access JWT', async (method, path) => {
    const response = await call(path, { method });
    expect(response.status).toBe(401);
  });

  it('ignores the unsigned Cf-Access-Authenticated-User-Email header', async () => {
    const response = await call('/api/books', {
      headers: { 'Cf-Access-Authenticated-User-Email': ADMIN },
    });
    expect(response.status).toBe(401);
  });

  it('serves the calendar feed without an Access JWT', async () => {
    const response = await call('/api/calendar.ics?token=nope');
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).not.toContain('json');
  });

  it('creates a user on first sign-in', async () => {
    const response = await call('/api/books', { as: 'New@Example.com' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [] });
    expect(
      db
        .prepare("SELECT id, email FROM users WHERE email = 'new@example.com'")
        .all(),
    ).toEqual([{ id: 3, email: 'new@example.com' }]);
  });
});

describe('data is scoped to the signed-in user', () => {
  it('lists each user own books', async () => {
    const member = (await (
      await call('/api/books', { as: MEMBER })
    ).json()) as {
      items: { dbId: number }[];
    };
    const admin = (await (await call('/api/books', { as: ADMIN })).json()) as {
      items: { dbId: number }[];
    };

    expect(member.items.map((b) => b.dbId)).toEqual([2]);
    expect(admin.items.map((b) => b.dbId)).toEqual([1]);
  });

  it("returns 404 for another user's book and leaves it untouched", async () => {
    expect((await call('/api/books/1', { as: MEMBER })).status).toBe(404);
    expect((await call('/api/books/1/notes', { as: MEMBER })).status).toBe(404);

    const patch = await call('/api/books/1/read-status', {
      as: MEMBER,
      method: 'PATCH',
      body: { readStatus: 'finished' },
    });
    expect(patch.status).toBe(404);
    expect(scalar('SELECT is_read FROM books WHERE id = 1')).toBe(0);

    const create = await call('/api/books/1/notes', {
      as: MEMBER,
      method: 'POST',
      body: { page_number: 1, content: 'sneaky' },
    });
    expect(create.status).toBe(404);
    expect(scalar('SELECT COUNT(*) FROM notes WHERE book_id = 1')).toBe(1);

    expect((await call('/api/books/1', { as: ADMIN })).status).toBe(200);
  });

  it("returns 404 for another user's note and leaves it untouched", async () => {
    const update = await call('/api/notes/1', {
      as: MEMBER,
      method: 'PUT',
      body: { content: 'overwritten' },
    });
    expect(update.status).toBe(404);

    const remove = await call('/api/notes/1', { as: MEMBER, method: 'DELETE' });
    expect(remove.status).toBe(404);

    expect(scalar('SELECT content FROM notes WHERE id = 1')).toBe('owner note');

    const own = await call('/api/notes/2', {
      as: MEMBER,
      method: 'PUT',
      body: { content: 'edited' },
    });
    expect(own.status).toBe(200);
  });

  it("does not delete another user's planned loan or book request", async () => {
    const planned = await call('/api/planned-loans/1', {
      as: MEMBER,
      method: 'DELETE',
    });
    expect(await planned.json()).toEqual({ success: false });
    expect(scalar('SELECT COUNT(*) FROM planned_loans WHERE id = 1')).toBe(1);

    const request = await call('/api/book-requests/1', {
      as: MEMBER,
      method: 'DELETE',
    });
    expect(await request.json()).toEqual({ success: false });
    expect(scalar('SELECT COUNT(*) FROM book_requests WHERE id = 1')).toBe(1);
  });

  it('lists each user own planned loans and book requests', async () => {
    const planned = (await (
      await call('/api/planned-loans', { as: MEMBER })
    ).json()) as { items: { title: string }[] };
    expect(planned.items.map((i) => i.title)).toEqual(['Member Plan']);

    const requests = (await (
      await call('/api/book-requests', { as: MEMBER })
    ).json()) as { items: { title: string }[] };
    expect(requests.items.map((i) => i.title)).toEqual(['Member Request']);
  });

  it('lets each user keep the same library book or isbn13 once', async () => {
    const duplicate = await call('/api/book-requests', {
      as: MEMBER,
      method: 'POST',
      body: { isbn13: '9780000000001', title: 'Again' },
    });
    expect(duplicate.status).toBe(409);

    const fresh = await call('/api/book-requests', {
      as: 'third@example.com',
      method: 'POST',
      body: { isbn13: '9780000000001', title: 'Third' },
    });
    expect(fresh.status).toBe(201);
  });

  it('draws practice notes from the user own notes only', async () => {
    const response = await call('/api/practice/today', { as: MEMBER });
    const body = (await response.json()) as { note: { id: number } };

    expect(body.note.id).toBe(2);
    expect(scalar('SELECT note_id FROM note_send_stats ORDER BY note_id')).toBe(
      2,
    );
  });
});

describe('admin-only routes', () => {
  it.each([
    ['POST', '/trigger'],
    ['POST', '/api/books/sync'],
    ['GET', '/api/cron-runs'],
    ['GET', '/api/cron-runs/latest'],
  ])('returns 403 for a member on %s %s', async (method, path) => {
    const response = await call(path, { as: MEMBER, method });
    expect(response.status).toBe(403);
  });

  it('serves cron runs to the admin', async () => {
    const response = await call('/api/cron-runs', { as: ADMIN });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ runs: [] });
  });
});

describe('repositories scope every query by user', () => {
  let d1: D1Database;

  beforeEach(() => {
    d1 = createSqliteD1(db);
  });

  it('books', async () => {
    const repo = new BookRepository(d1);

    expect((await repo.findByChargeId(MEMBER_ID, 'c-1'))?.id).toBe(2);
    expect((await repo.findByChargeId(OWNER_ID, 'c-1'))?.id).toBe(1);
    expect(await repo.findById(MEMBER_ID, 1)).toBeNull();
    expect(await repo.updateReadStatus(MEMBER_ID, 1, 'finished')).toBe(false);
    expect(await repo.updateReadStatus(OWNER_ID, 1, 'finished')).toBe(true);
    expect(
      (await repo.findByIsbnAndChargeDate(MEMBER_ID, '111', '2026-11-01')) ??
        null,
    ).toBeNull();
    expect((await repo.findByIsbn(OWNER_ID, '111')).map((b) => b.id)).toEqual([
      1,
    ]);
    expect(
      (await repo.findDueSoonBooks(MEMBER_ID, '2026-11-01', '2026-12-31')).map(
        (b) => b.id,
      ),
    ).toEqual([2]);
    expect(await repo.findLoansDueForReturn(OWNER_ID, 1)).toEqual([
      { dueDate: '2026-11-30', title: 'Owner Book' },
    ]);
    expect(await repo.getRenewalLogs(3, 'c-1')).toEqual([]);
    expect(await repo.getRenewalLogs(OWNER_ID, 'c-1')).toHaveLength(1);
  });

  it('saveBook updates only the user own row for a shared charge id', async () => {
    const repo = new BookRepository(d1);
    const memberBook = await repo.findByChargeId(MEMBER_ID, 'c-1');
    if (!memberBook) throw new Error('seed missing');

    await repo.saveBook(MEMBER_ID, { ...memberBook, due_date: '2026-12-31' });

    expect(scalar('SELECT due_date FROM books WHERE id = 2')).toBe(
      '2026-12-31',
    );
    expect(scalar('SELECT due_date FROM books WHERE id = 1')).toBe(
      '2026-11-30',
    );
  });

  it('notes and note send stats', async () => {
    const notes = new NoteRepository(d1);

    expect(await notes.findById(MEMBER_ID, 1)).toBeNull();
    expect(await notes.findByBookId(MEMBER_ID, 1)).toEqual([]);
    expect(await notes.countByBookId(MEMBER_ID, 1)).toBe(0);
    expect(
      await notes.create(MEMBER_ID, {
        book_id: 1,
        page_number: 1,
        content: 'x',
      }),
    ).toBeNull();
    expect(await notes.update(MEMBER_ID, 1, { content: 'x' })).toBeNull();
    expect(await notes.delete(MEMBER_ID, 1)).toBe(false);
    expect(
      Object.fromEntries(await notes.countNotesForBookIds(MEMBER_ID, [1, 2])),
    ).toEqual({ 2: 1 });

    const selection = createNoteSelectionRepository(d1);
    expect(
      (await selection.getNoteCandidates(MEMBER_ID)).map((c) => c.note.id),
    ).toEqual([2]);
    await selection.incrementSendCount(MEMBER_ID, 1);
    expect(scalar('SELECT COUNT(*) FROM note_send_stats')).toBe(0);
    await selection.incrementSendCount(OWNER_ID, 1);
    expect(
      scalar('SELECT send_count FROM note_send_stats WHERE note_id = 1'),
    ).toBe(1);
  });

  it('planned loans and dismissals', async () => {
    const planned = new PlannedLoanRepository(d1);
    const dismissals = new PlannedLoanDismissalRepository(d1);

    expect(await planned.findById(MEMBER_ID, 1)).toBeNull();
    expect((await planned.findByLibraryBiblioId(MEMBER_ID, 100))?.id).toBe(2);
    expect(await planned.findAllLibraryBiblioIds(MEMBER_ID)).toEqual([100]);
    expect(await planned.deleteById(MEMBER_ID, 1)).toBe(false);
    expect(await planned.deleteByLibraryBiblioIds(MEMBER_ID, [100])).toBe(1);
    expect(scalar('SELECT COUNT(*) FROM planned_loans WHERE user_id = 1')).toBe(
      1,
    );
    expect(await planned.deleteByLibraryBiblioId(OWNER_ID, 100)).toBe(true);

    expect(await dismissals.findAllLibraryBiblioIds(MEMBER_ID)).toEqual([]);
    await dismissals.markDismissed(MEMBER_ID, 300);
    await dismissals.markDismissed(MEMBER_ID, 300);
    expect(await dismissals.findAllLibraryBiblioIds(MEMBER_ID)).toEqual([300]);
    expect(await dismissals.findAllLibraryBiblioIds(OWNER_ID)).toEqual([300]);
  });

  it('book requests', async () => {
    const requests = new BookRequestRepository(d1);

    expect((await requests.findByIsbn13(MEMBER_ID, '9780000000001'))?.id).toBe(
      2,
    );
    expect(await requests.deleteById(MEMBER_ID, 1)).toBe(false);
    await expect(
      requests.create(MEMBER_ID, {
        isbn13: '9780000000001',
        isbn: null,
        title: 'dup',
        author: null,
        publisher: null,
        pub_date: null,
        cover_url: null,
        aladin_link: null,
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_BOOK_REQUEST' });
  });

  it('users', async () => {
    const users = new UserRepository(d1);

    expect(await users.findOrCreateByEmail(MEMBER, 'sub-2')).toBe(MEMBER_ID);
    expect(await users.findOrCreateByEmail(MEMBER, 'sub-rotated')).toBe(
      MEMBER_ID,
    );
    expect(scalar('SELECT access_sub FROM users WHERE id = 2')).toBe(
      'sub-rotated',
    );

    const created = await users.findOrCreateByEmail('new@example.com', null);
    expect(created).toBe(3);
    expect(await users.findOrCreateByEmail('new@example.com', null)).toBe(3);
  });
});
