/**
 * Book request handler tests
 */

import { describe, expect, it } from 'vitest';
import type { BookRequestRecord, Env } from '../../types';
import {
  handleCreateBookRequest,
  handleDeleteBookRequest,
  handleGetBookRequests,
} from '../book-request-handler';

const USER_ID = 7;
const OTHER_USER_ID = 8;

// Scopes rows by user_id like the D1 repository does.
class FakeBookRequestRepo {
  items: BookRequestRecord[] = [];

  async findAll(userId: number): Promise<BookRequestRecord[]> {
    return this.items.filter((i) => i.user_id === userId);
  }

  async findByIsbn13(
    userId: number,
    isbn13: string,
  ): Promise<BookRequestRecord | null> {
    return (
      this.items.find((i) => i.user_id === userId && i.isbn13 === isbn13) ||
      null
    );
  }

  async create(
    userId: number,
    record: Omit<
      BookRequestRecord,
      'id' | 'user_id' | 'created_at' | 'updated_at'
    >,
  ): Promise<BookRequestRecord> {
    const now = new Date().toISOString();
    const created: BookRequestRecord = {
      ...record,
      user_id: userId,
      id: this.items.length + 1,
      created_at: now,
      updated_at: now,
    };
    this.items.push(created);
    return created;
  }

  async deleteById(userId: number, id: number): Promise<boolean> {
    const before = this.items.length;
    this.items = this.items.filter(
      (i) => !(i.id === id && i.user_id === userId),
    );
    return this.items.length !== before;
  }
}

function makeEnv(): Env {
  return {
    DB: null as unknown as D1Database,
    ASSETS: { fetch: async () => new Response('') } as unknown as Fetcher,
    LIBRARY_USER_ID: '',
    LIBRARY_PASSWORD: '',
    ALADIN_API_KEY: '',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHAT_ID: '',
    ENVIRONMENT: 'test',
  };
}

const payload = {
  isbn13: '9788966262472',
  isbn: '8966262473',
  title: '클린 코드',
  author: '로버트 마틴',
  publisher: '인사이트',
  pubDate: '2013-12-24',
  coverUrl: 'https://image.aladin.co.kr/1.jpg',
  aladinLink: 'https://www.aladin.co.kr/shop/1',
};

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/book-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('handleCreateBookRequest', () => {
  it('creates a request and returns the view model (201)', async () => {
    const repo = new FakeBookRequestRepo();
    const res = await handleCreateBookRequest(
      makeEnv(),
      USER_ID,
      postReq(payload),
      repo,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { item: Record<string, unknown> };
    expect(body.item).toMatchObject({
      isbn13: payload.isbn13,
      title: payload.title,
      author: payload.author,
      pubDate: payload.pubDate,
      coverUrl: payload.coverUrl,
      aladinLink: payload.aladinLink,
    });
    expect(body.item.id).toBeGreaterThan(0);
  });

  it('returns 400 when isbn13 is missing', async () => {
    const repo = new FakeBookRequestRepo();
    const { isbn13: _omit, ...rest } = payload;
    const res = await handleCreateBookRequest(
      makeEnv(),
      USER_ID,
      postReq(rest),
      repo,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 when title is missing', async () => {
    const repo = new FakeBookRequestRepo();
    const { title: _omit, ...rest } = payload;
    const res = await handleCreateBookRequest(
      makeEnv(),
      USER_ID,
      postReq(rest),
      repo,
    );

    expect(res.status).toBe(400);
  });

  it('returns 409 on duplicate isbn13', async () => {
    const repo = new FakeBookRequestRepo();
    await handleCreateBookRequest(makeEnv(), USER_ID, postReq(payload), repo);
    const res = await handleCreateBookRequest(
      makeEnv(),
      USER_ID,
      postReq(payload),
      repo,
    );

    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('DUPLICATE_BOOK_REQUEST');
  });

  it('returns 409 when create loses the isbn13 UNIQUE race', async () => {
    // findByIsbn13 pre-check passes (empty), but a concurrent insert already
    // committed, so create hits the UNIQUE constraint and tags the error.
    const repo = new FakeBookRequestRepo();
    repo.create = async () => {
      throw Object.assign(
        new Error('UNIQUE constraint failed: book_requests.isbn13'),
        { code: 'DUPLICATE_BOOK_REQUEST' },
      );
    };

    const res = await handleCreateBookRequest(
      makeEnv(),
      USER_ID,
      postReq(payload),
      repo,
    );

    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('DUPLICATE_BOOK_REQUEST');
  });

  it('returns 400 on invalid JSON body', async () => {
    const repo = new FakeBookRequestRepo();
    const req = new Request('http://localhost/api/book-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const res = await handleCreateBookRequest(makeEnv(), USER_ID, req, repo);

    expect(res.status).toBe(400);
  });
});

describe('handleGetBookRequests', () => {
  it('returns the list of requests (200)', async () => {
    const repo = new FakeBookRequestRepo();
    await handleCreateBookRequest(makeEnv(), USER_ID, postReq(payload), repo);

    const res = await handleGetBookRequests(makeEnv(), USER_ID, repo);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(1);
  });
});

describe('handleDeleteBookRequest', () => {
  it('returns success true when the row exists', async () => {
    const repo = new FakeBookRequestRepo();
    const created = await handleCreateBookRequest(
      makeEnv(),
      USER_ID,
      postReq(payload),
      repo,
    );
    const { item } = (await created.json()) as { item: { id: number } };

    const res = await handleDeleteBookRequest(
      makeEnv(),
      USER_ID,
      item.id,
      repo,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('returns success false when the row is missing', async () => {
    const repo = new FakeBookRequestRepo();
    const res = await handleDeleteBookRequest(makeEnv(), USER_ID, 999, repo);

    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(false);
  });
});

describe('book requests are scoped per user', () => {
  it('lists only the caller own requests', async () => {
    const repo = new FakeBookRequestRepo();
    await handleCreateBookRequest(makeEnv(), USER_ID, postReq(payload), repo);

    const res = await handleGetBookRequests(makeEnv(), OTHER_USER_ID, repo);

    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(0);
  });

  it('lets another user request the same isbn13', async () => {
    const repo = new FakeBookRequestRepo();
    await handleCreateBookRequest(makeEnv(), USER_ID, postReq(payload), repo);

    const res = await handleCreateBookRequest(
      makeEnv(),
      OTHER_USER_ID,
      postReq(payload),
      repo,
    );

    expect(res.status).toBe(201);
  });

  it('does not delete another user request by id', async () => {
    const repo = new FakeBookRequestRepo();
    const created = await handleCreateBookRequest(
      makeEnv(),
      USER_ID,
      postReq(payload),
      repo,
    );
    const { item } = (await created.json()) as { item: { id: number } };

    const res = await handleDeleteBookRequest(
      makeEnv(),
      OTHER_USER_ID,
      item.id,
      repo,
    );

    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(false);
    expect(await repo.findAll(USER_ID)).toHaveLength(1);
  });
});
