/**
 * Due-soon broadcast tests
 * (Note broadcast tests moved to note-selection.test.ts)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookRecord, Env } from '../../types';
import { broadcastDueSoonBooks, formatDueSoonMessage } from '../note-broadcast';

describe('formatDueSoonMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T14:30:00Z')); // 23:30 KST = 2025-01-15 KST
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty string for empty array', () => {
    expect(formatDueSoonMessage([])).toBe('');
  });

  it('formats header and book items with MarkdownV2 escaping', () => {
    const books: BookRecord[] = [
      {
        id: 1,
        charge_id: 'c1',
        isbn: '9780000000001',
        title: 'Clean Code',
        author: 'Robert C. Martin',
        publisher: null,
        cover_url: null,
        description: null,
        charge_date: '2025-01-01',
        due_date: '2025-01-17', // 2 days from today
        renew_count: 0,
        is_read: 0,
        isbn13: null,
        pub_date: null,
      },
    ];

    const msg = formatDueSoonMessage(books);

    expect(msg).toContain('📅 반납 예정 도서');
    expect(msg).toContain('─────────────');
    expect(msg).toContain('Clean Code');
    expect(msg).toContain('2025\\-01\\-17'); // hyphens escaped
    expect(msg).toContain('\\(2일 남음\\)'); // parentheses escaped
    expect(msg).toContain('연장 가능 1회');
  });

  it('shows 오늘 for due_date equal to today', () => {
    const books: BookRecord[] = [
      {
        id: 1,
        charge_id: 'c1',
        isbn: '9780000000001',
        title: '책',
        author: '저자',
        publisher: null,
        cover_url: null,
        description: null,
        charge_date: '2025-01-01',
        due_date: '2025-01-15', // today
        renew_count: 0,
        is_read: 0,
        isbn13: null,
        pub_date: null,
      },
    ];

    const msg = formatDueSoonMessage(books);

    expect(msg).toContain('오늘');
  });

  it('escapes special characters in book titles', () => {
    const books: BookRecord[] = [
      {
        id: 1,
        charge_id: 'c1',
        isbn: '9780000000001',
        title: 'A_B (C)',
        author: '저자',
        publisher: null,
        cover_url: null,
        description: null,
        charge_date: '2025-01-01',
        due_date: '2025-01-16',
        renew_count: 0,
        is_read: 0,
        isbn13: null,
        pub_date: null,
      },
    ];

    const msg = formatDueSoonMessage(books);

    expect(msg).toContain('A\\_B \\(C\\)');
  });

  it('shows zero remaining renewals when the renewal limit is already used', () => {
    const books: BookRecord[] = [
      {
        id: 1,
        charge_id: 'c1',
        isbn: '9780000000001',
        title: '연장 완료',
        author: '저자',
        publisher: null,
        cover_url: null,
        description: null,
        charge_date: '2025-01-01',
        due_date: '2025-01-16',
        renew_count: 1,
        is_read: 0,
        isbn13: null,
        pub_date: null,
      },
    ];

    const msg = formatDueSoonMessage(books);

    expect(msg).toContain('연장 가능 0회');
  });

  it('clamps remaining renewals at zero when stored renew count exceeds the limit', () => {
    const books: BookRecord[] = [
      {
        id: 1,
        charge_id: 'c1',
        isbn: '9780000000001',
        title: '예외 케이스',
        author: '저자',
        publisher: null,
        cover_url: null,
        description: null,
        charge_date: '2025-01-01',
        due_date: '2025-01-16',
        renew_count: 3,
        is_read: 0,
        isbn13: null,
        pub_date: null,
      },
    ];

    const msg = formatDueSoonMessage(books);

    expect(msg).toContain('연장 가능 0회');
  });

  it('includes all books in order', () => {
    const books: BookRecord[] = [
      {
        id: 1,
        charge_id: 'c1',
        isbn: '9780000000001',
        title: 'First',
        author: '저자',
        publisher: null,
        cover_url: null,
        description: null,
        charge_date: '2025-01-01',
        due_date: '2025-01-16',
        renew_count: 0,
        is_read: 0,
        isbn13: null,
        pub_date: null,
      },
      {
        id: 2,
        charge_id: 'c2',
        isbn: '9780000000002',
        title: 'Second',
        author: '저자',
        publisher: null,
        cover_url: null,
        description: null,
        charge_date: '2025-01-01',
        due_date: '2025-01-20',
        renew_count: 0,
        is_read: 0,
        isbn13: null,
        pub_date: null,
      },
    ];

    const msg = formatDueSoonMessage(books);

    const firstIdx = msg.indexOf('First');
    const secondIdx = msg.indexOf('Second');
    expect(firstIdx).toBeLessThan(secondIdx);
  });
});

describe('broadcastDueSoonBooks', () => {
  const baseEnv = {
    TELEGRAM_BOT_TOKEN: 'token',
    TELEGRAM_CHAT_ID: 'chat',
    DB: {} as D1Database,
    ASSETS: {} as Fetcher,
    LIBRARY_USER_ID: '',
    LIBRARY_PASSWORD: '',
    ALADIN_API_KEY: '',
    ENVIRONMENT: 'test',
  } as Env;

  it('sends a Telegram message for due-soon books', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ result: { message_id: 100 } }),
    });

    const dueSoonBook: BookRecord = {
      id: 99,
      charge_id: 'cx',
      isbn: '9780000000099',
      title: '반납 예정',
      author: '저자',
      publisher: null,
      cover_url: null,
      description: null,
      charge_date: '2025-01-01',
      due_date: '2025-01-18',
      renew_count: 0,
      is_read: 0,
      isbn13: null,
      pub_date: null,
    };
    const bookRepository = {
      findDueSoonBooks: vi.fn().mockResolvedValue([dueSoonBook]),
    };

    const sent = await broadcastDueSoonBooks(baseEnv, {
      fetchFn: mockFetch,
      bookRepository,
    });

    expect(sent).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(callBody.text).toContain('반납 예정');
  });

  it('queries due-soon books using a five-day inclusive window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T00:00:00Z'));

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ result: { message_id: 100 } }),
    });

    const bookRepository = {
      findDueSoonBooks: vi.fn().mockResolvedValue([]),
    };

    await broadcastDueSoonBooks(baseEnv, {
      fetchFn: mockFetch,
      bookRepository,
    });

    expect(bookRepository.findDueSoonBooks).toHaveBeenCalledWith(
      '2025-01-15',
      '2025-01-20',
    );

    vi.useRealTimers();
  });

  it('returns false when no books are due soon', async () => {
    const mockFetch = vi.fn();
    const bookRepository = {
      findDueSoonBooks: vi.fn().mockResolvedValue([]),
    };

    const sent = await broadcastDueSoonBooks(baseEnv, {
      fetchFn: mockFetch,
      bookRepository,
    });

    expect(sent).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns false when Telegram credentials are missing', async () => {
    const envNoCreds = {
      ...baseEnv,
      TELEGRAM_BOT_TOKEN: '',
      TELEGRAM_CHAT_ID: '',
    };

    const sent = await broadcastDueSoonBooks(envNoCreds);

    expect(sent).toBe(false);
  });

  it('returns false when Telegram send fails (non-ok response)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: vi.fn().mockResolvedValue('Internal Server Error'),
      json: async () => ({}),
    });

    const dueSoonBook: BookRecord = {
      id: 99,
      charge_id: 'cx',
      isbn: '9780000000099',
      title: '반납 예정',
      author: '저자',
      publisher: null,
      cover_url: null,
      description: null,
      charge_date: '2025-01-01',
      due_date: '2025-01-18',
      renew_count: 0,
      is_read: 0,
      isbn13: null,
      pub_date: null,
    };
    const bookRepository = {
      findDueSoonBooks: vi.fn().mockResolvedValue([dueSoonBook]),
    };

    const sent = await broadcastDueSoonBooks(baseEnv, {
      fetchFn: mockFetch,
      bookRepository,
    });

    expect(sent).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws on failure', async () => {
    const bookRepository = {
      findDueSoonBooks: vi.fn().mockRejectedValue(new Error('DB error')),
    };

    await expect(
      broadcastDueSoonBooks(baseEnv, { bookRepository }),
    ).rejects.toThrow('DB error');
  });
});
