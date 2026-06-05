/**
 * External search handler tests (Aladin keyword search)
 */

import { describe, expect, it, vi } from 'vitest';
import type { AladinSearchItem, Env } from '../../types';
import { handleExternalSearch } from '../external-search-handler';

function makeEnv(): Env {
  return {
    DB: null as unknown as D1Database,
    ASSETS: { fetch: async () => new Response('') } as unknown as Fetcher,
    LIBRARY_USER_ID: '',
    LIBRARY_PASSWORD: '',
    ALADIN_API_KEY: 'test-key',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHAT_ID: '',
    ENVIRONMENT: 'test',
  };
}

const item: AladinSearchItem = {
  title: '클린 코드',
  link: 'https://www.aladin.co.kr/shop/1',
  author: '로버트 마틴',
  pubDate: '2013-12-24',
  description: 'desc',
  isbn: '8966262473',
  isbn13: '9788966262472',
  itemId: 1,
  priceSales: 0,
  priceStandard: 0,
  stockStatus: '',
  cover: 'https://image.aladin.co.kr/1.jpg',
  categoryId: 0,
  categoryName: '',
  publisher: '인사이트',
};

describe('handleExternalSearch', () => {
  it('returns 400 when query is missing', async () => {
    const search = vi.fn();
    const req = new Request('http://localhost/api/external-search');
    const res = await handleExternalSearch(makeEnv(), req, search);

    expect(res.status).toBe(400);
    expect(search).not.toHaveBeenCalled();
  });

  it('returns mapped Aladin items and the real totalResults', async () => {
    const search = vi
      .fn()
      .mockResolvedValue({ items: [item], totalResults: 42 });
    const req = new Request(
      'http://localhost/api/external-search?query=클린 코드',
    );
    const res = await handleExternalSearch(makeEnv(), req, search);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Record<string, unknown>[];
      meta: Record<string, unknown>;
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      isbn13: '9788966262472',
      isbn: '8966262473',
      title: '클린 코드',
      author: '로버트 마틴',
      publisher: '인사이트',
      pubDate: '2013-12-24',
      coverUrl: 'https://image.aladin.co.kr/1.jpg',
      aladinLink: 'https://www.aladin.co.kr/shop/1',
    });
    expect(body.meta.totalResults).toBe(42);
    expect(search).toHaveBeenCalledWith('클린 코드', 10, 0);
  });

  it('filters out items without isbn13', async () => {
    const search = vi.fn().mockResolvedValue({
      items: [item, { ...item, isbn13: '' }],
      totalResults: 2,
    });
    const req = new Request('http://localhost/api/external-search?query=x');
    const res = await handleExternalSearch(makeEnv(), req, search);

    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(1);
  });

  it('returns 200 with empty items when Aladin has no results', async () => {
    const search = vi.fn().mockResolvedValue({ items: [], totalResults: 0 });
    const req = new Request('http://localhost/api/external-search?query=zzz');
    const res = await handleExternalSearch(makeEnv(), req, search);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  it('returns 502 with an UPSTREAM_ERROR code when the Aladin upstream fails', async () => {
    const search = vi.fn().mockRejectedValue(new Error('boom'));
    const req = new Request('http://localhost/api/external-search?query=x');
    const res = await handleExternalSearch(makeEnv(), req, search);

    expect(res.status).toBe(502);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('UPSTREAM_ERROR');
  });

  it('returns 400 on invalid max without calling search', async () => {
    const search = vi.fn();
    const req = new Request(
      'http://localhost/api/external-search?query=x&max=999',
    );
    const res = await handleExternalSearch(makeEnv(), req, search);

    expect(res.status).toBe(400);
    expect(search).not.toHaveBeenCalled();
  });
});
