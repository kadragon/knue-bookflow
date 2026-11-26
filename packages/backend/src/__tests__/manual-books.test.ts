/// <reference types="node" />

/**
 * Manual book registration end to end: migration 0021, the Worker router with
 * a real Access JWT, the handler, and the repository over the migrated schema.
 * Manual books must never reach the due-date consumers (Telegram D-day,
 * calendar feed) or the return-sync ISBN + charge date fallback.
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
import { handleCreateManualBook } from '../handlers/books-handler';
import worker from '../index';
import {
  BookRepository,
  clearAccessSigningKeyCache,
  DuplicateManualBookError,
} from '../services';
import type { BookViewModel, Env } from '../types';
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
const NOW = new Date('2026-11-26T16:00:00Z');
const TODAY_KST = '2026-11-27';
const ctx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext;

const aladinBook = {
  isbn13: '9788966262472',
  isbn: '8966262473',
  title: '클린 코드',
  author: '로버트 마틴',
  publisher: '인사이트',
  pubDate: '2013-12-24',
  coverUrl: 'https://image.aladin.co.kr/1.jpg',
  description: 'desc',
};

let signingKey: SigningKey;
let db: DatabaseSync;
let env: Env;

beforeAll(async () => {
  signingKey = await generateSigningKey('kid-1');
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  clearAccessSigningKeyCache();
  vi.stubGlobal('fetch', certsFetch(TEAM_ORIGIN, signingKey));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  db = createMigratedDatabase();
  db.exec(
    `INSERT INTO users (id, email, access_sub) VALUES (2, '${MEMBER}', 'sub-2')`,
  );
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function call(
  path: string,
  options: { as: string; method?: string; body?: unknown; rawBody?: string },
): Promise<Response> {
  const headers: Record<string, string> = {
    'Cf-Access-Jwt-Assertion': await signToken(signingKey, {
      aud: [AUD],
      iss: TEAM_ORIGIN,
      exp: Math.floor(Date.now() / 1000) + 600,
      email: options.as,
      sub: `sub-${options.as}`,
    }),
    'Content-Type': 'application/json',
  };
  return worker.fetch(
    new Request(`https://book.example.com${path}`, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.rawBody ??
        (options.body === undefined ? undefined : JSON.stringify(options.body)),
    }),
    env,
    ctx,
  );
}

function register(body: unknown = aladinBook, as = MEMBER) {
  return call('/api/books/manual', { as, method: 'POST', body });
}

function setReadStatus(id: number, readStatus: string, as = MEMBER) {
  return call(`/api/books/${id}/read-status`, {
    as,
    method: 'PATCH',
    body: { readStatus },
  });
}

type Row = Record<string, unknown>;

function bookRows(): Row[] {
  return db
    .prepare(
      'SELECT id, user_id, charge_id, source, isbn, isbn13, title, charge_date, due_date, discharge_date, is_read, renew_count FROM books ORDER BY id',
    )
    .all() as Row[];
}

function dischargeDate(id: number): unknown {
  return (
    db.prepare('SELECT discharge_date FROM books WHERE id = ?').get(id) as Row
  ).discharge_date;
}

describe('migration 0021 books.source', () => {
  it('defaults rows to library and rejects unknown sources', () => {
    db.exec(
      `INSERT INTO books (id, user_id, charge_id, isbn, title, author, charge_date, due_date)
       VALUES (1, 1, 'c-1', '111', 'Library Book', 'A', '2026-11-01', '2026-11-30')`,
    );

    expect(db.prepare('SELECT source FROM books WHERE id = 1').get()).toEqual({
      source: 'library',
    });
    expect(() =>
      db.exec(
        `INSERT INTO books (user_id, charge_id, isbn, title, author, charge_date, due_date, source)
         VALUES (1, 'c-2', '222', 'Bad', 'B', '2026-11-01', '2026-11-30', 'other')`,
      ),
    ).toThrow(/CHECK constraint failed/);
  });
});

describe('POST /api/books/manual', () => {
  it('registers an on-loan manual book for the signed-in user', async () => {
    const response = await register();

    expect(response.status).toBe(201);
    const { item } = (await response.json()) as { item: BookViewModel };
    expect(item).toMatchObject({
      source: 'manual',
      title: '클린 코드',
      author: '로버트 마틴',
      isbn13: '9788966262472',
      chargeDate: TODAY_KST,
      dueDate: TODAY_KST,
      dischargeDate: null,
      loanState: 'on_loan',
      dueStatus: 'ok',
      daysLeft: 0,
      readStatus: 'unread',
    });
    expect(item.id).toMatch(/^manual:[0-9a-f-]{36}$/);

    expect(bookRows()).toEqual([
      {
        id: item.dbId,
        user_id: MEMBER_ID,
        charge_id: item.id,
        source: 'manual',
        isbn: '9788966262472',
        isbn13: '9788966262472',
        title: '클린 코드',
        charge_date: TODAY_KST,
        due_date: TODAY_KST,
        discharge_date: null,
        is_read: 0,
        renew_count: 0,
      },
    ]);

    const owner = (await (await call('/api/books', { as: ADMIN })).json()) as {
      items: unknown[];
    };
    expect(owner.items).toEqual([]);
  });

  it.each([
    ['a missing title', { isbn13: '9788966262472' }],
    ['a blank title', { ...aladinBook, title: '   ' }],
    ['a non-string field', { ...aladinBook, author: 42 }],
  ])('rejects %s with 400 and writes nothing', async (_label, body) => {
    const response = await register(body);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'INVALID_REQUEST' });
    expect(bookRows()).toEqual([]);
  });

  it('rejects a body that is not JSON with 400', async () => {
    const response = await call('/api/books/manual', {
      as: MEMBER,
      method: 'POST',
      rawBody: 'not json',
    });

    expect(response.status).toBe(400);
    expect(bookRows()).toEqual([]);
  });

  it('refuses a second on-loan copy of the same ISBN until the first is done', async () => {
    const first = (await (await register()).json()) as { item: BookViewModel };

    const duplicate = await register();
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({
      code: 'DUPLICATE_MANUAL_BOOK',
    });

    expect((await register(aladinBook, ADMIN)).status).toBe(201);

    expect((await setReadStatus(first.item.dbId, 'finished')).status).toBe(200);
    expect((await register()).status).toBe(201);
  });

  it('answers 409 when a concurrent registration wins the insert race', async () => {
    expect((await register()).status).toBe(201);
    const repo = new BookRepository(env.DB);
    const raced = {
      findOnLoanManualBookByIsbn: async () => null,
      saveBook: repo.saveBook.bind(repo),
      findByChargeId: repo.findByChargeId.bind(repo),
    };

    const response = await handleCreateManualBook(
      env,
      MEMBER_ID,
      new Request('https://book.example.com/api/books/manual', {
        method: 'POST',
        body: JSON.stringify(aladinBook),
      }),
      raced,
      TODAY_KST,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'DUPLICATE_MANUAL_BOOK',
    });
    expect(bookRows()).toHaveLength(1);
  });

  it('keeps a manual copy beside a library loan of the same ISBN on the shelf', async () => {
    db.exec(
      `INSERT INTO books (id, user_id, charge_id, isbn, title, author, charge_date, due_date)
       VALUES (1, 2, 'c-1', '9788966262472', '클린 코드', 'A', '2026-11-20', '2026-11-28')`,
    );
    expect((await register()).status).toBe(201);

    const response = await call('/api/books', { as: MEMBER });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const { items } = (await response.json()) as { items: BookViewModel[] };

    expect(
      items.map(({ source, dueStatus, loanOrdinal }) => ({
        source,
        dueStatus,
        loanOrdinal,
      })),
    ).toEqual([
      { source: 'manual', dueStatus: 'ok', loanOrdinal: 1 },
      { source: 'library', dueStatus: 'due_soon', loanOrdinal: 1 },
    ]);
  });
});

describe('read status of a manual book', () => {
  it('discharges it when finished or abandoned and restores it when unread', async () => {
    const { item } = (await (await register()).json()) as {
      item: BookViewModel;
    };

    await setReadStatus(item.dbId, 'finished');
    expect(dischargeDate(item.dbId)).toBe(TODAY_KST);

    const books = (await (await call('/api/books', { as: MEMBER })).json()) as {
      items: BookViewModel[];
    };
    expect(books.items[0]).toMatchObject({
      loanState: 'returned',
      readStatus: 'finished',
    });

    vi.setSystemTime(new Date('2026-11-28T03:00:00Z'));
    await setReadStatus(item.dbId, 'abandoned');
    expect(dischargeDate(item.dbId)).toBe(TODAY_KST);

    await setReadStatus(item.dbId, 'unread');
    expect(dischargeDate(item.dbId)).toBeNull();

    await setReadStatus(item.dbId, 'abandoned');
    expect(dischargeDate(item.dbId)).toBe('2026-11-28');
  });

  it('refuses to reopen a copy while another copy of its ISBN is on loan', async () => {
    const first = (await (await register()).json()) as { item: BookViewModel };
    await setReadStatus(first.item.dbId, 'finished');
    expect((await register()).status).toBe(201);

    const reopen = await setReadStatus(first.item.dbId, 'unread');

    expect(reopen.status).toBe(409);
    expect(await reopen.json()).toMatchObject({
      code: 'DUPLICATE_MANUAL_BOOK',
    });
    expect(
      db
        .prepare('SELECT is_read, discharge_date FROM books WHERE id = ?')
        .get(first.item.dbId),
    ).toEqual({ is_read: 1, discharge_date: TODAY_KST });
  });

  it('rejects a second on-loan manual ISBN in the database itself', async () => {
    const repo = new BookRepository(env.DB);
    const manual = (chargeId: string) => ({
      charge_id: chargeId,
      source: 'manual' as const,
      isbn: '111',
      isbn13: '111',
      title: 'T',
      author: 'A',
      publisher: null,
      cover_url: null,
      description: null,
      pub_date: null,
      charge_date: TODAY_KST,
      due_date: TODAY_KST,
      renew_count: 0,
    });
    await repo.saveBook(MEMBER_ID, manual('manual:a'), null);

    await expect(
      repo.saveBook(MEMBER_ID, manual('manual:b'), null),
    ).rejects.toBeInstanceOf(DuplicateManualBookError);
    await expect(
      repo.saveBook(MEMBER_ID, { ...manual('manual:c'), isbn: '' }, null),
    ).resolves.toBeUndefined();
    await expect(
      repo.saveBook(MEMBER_ID, { ...manual('manual:d'), isbn: '' }, null),
    ).resolves.toBeUndefined();
  });

  it('leaves a library book discharge date to the library sync', async () => {
    db.exec(
      `INSERT INTO books (id, user_id, charge_id, isbn, title, author, charge_date, due_date, discharge_date)
       VALUES (1, 2, 'c-1', '111', 'On loan', 'A', '2026-11-01', '2026-11-30', NULL),
              (2, 2, 'c-2', '222', 'Returned', 'B', '2026-10-01', '2026-10-30', '2026-10-20')`,
    );

    await setReadStatus(1, 'finished');
    await setReadStatus(2, 'unread');

    expect(dischargeDate(1)).toBeNull();
    expect(dischargeDate(2)).toBe('2026-10-20');
  });
});

describe('due-date consumers skip manual books', () => {
  let repo: BookRepository;

  beforeEach(() => {
    repo = new BookRepository(env.DB);
    db.exec(
      `INSERT INTO books (id, user_id, charge_id, isbn, title, author, charge_date, due_date, renew_count, is_renewable, source)
       VALUES (1, 1, 'c-1', '111', 'Library', 'A', '2026-11-20', '2026-11-28', 0, 0, 'library'),
              (2, 1, 'manual:x', '111', 'Manual', 'A', '2026-11-20', '2026-11-28', 0, 0, 'manual')`,
    );
  });

  it('Telegram due-soon query', async () => {
    const books = await repo.findDueSoonBooks(
      OWNER_ID,
      '2026-11-27',
      '2026-11-30',
    );
    expect(books.map((book) => book.title)).toEqual(['Library']);
  });

  it('calendar feed query', async () => {
    const loans = await repo.findLoansDueForReturn(OWNER_ID, 1);
    expect(loans.map((loan) => loan.title)).toEqual(['Library']);
  });

  it('return-sync ISBN + charge date fallback', async () => {
    db.exec("DELETE FROM books WHERE source = 'library'");
    expect(
      await repo.findByIsbnAndChargeDate(OWNER_ID, '111', '2026-11-20'),
    ).toBeNull();
  });
});
