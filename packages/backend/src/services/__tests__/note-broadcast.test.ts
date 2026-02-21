/**
 * Note broadcast tests
 * Trace: spec_id: SPEC-notes-telegram-002, task_id: TASK-037
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookRecord, Env, NoteRecord } from '../../types';
import {
  broadcastDailyNote,
  formatDueSoonMessage,
  formatNoteMessage,
  type NoteBroadcastDeps,
  type NoteBroadcastRepository,
  type NoteCandidate,
  selectNoteCandidate,
} from '../note-broadcast';

function createCandidate(
  overrides: Partial<{
    note: NoteRecord;
    book: BookRecord;
    sendCount: number;
  }> = {},
): NoteCandidate {
  const book: BookRecord = {
    id: 1,
    charge_id: 'c1',
    isbn: '9780000000001',
    title: '테스트 북',
    author: '홍길동',
    publisher: '테스트 출판사',
    cover_url: null,
    description: null,
    charge_date: '2025-01-01',
    due_date: '2025-01-10',
    renew_count: 0,
    is_read: 0,
    ...overrides.book,
  } as BookRecord;

  const note: NoteRecord = {
    id: 1,
    book_id: book.id ?? 1,
    page_number: 12,
    content: '메모 내용',
    ...overrides.note,
  } as NoteRecord;

  return {
    book,
    note,
    sendCount: overrides.sendCount ?? 0,
  };
}

describe('selectNoteCandidate', () => {
  it('picks randomly among notes with the lowest sendCount', () => {
    const candidates: NoteCandidate[] = [
      createCandidate({
        note: { id: 1, book_id: 1, page_number: 5, content: 'A' },
        sendCount: 3,
      }),
      createCandidate({
        note: { id: 2, book_id: 1, page_number: 6, content: 'B' },
        sendCount: 1,
      }),
      createCandidate({
        note: { id: 3, book_id: 1, page_number: 7, content: 'C' },
        sendCount: 1,
      }),
    ];

    const pick = selectNoteCandidate(candidates, () => 0.8); // Should select the second candidate in the lowest tier

    expect([2, 3]).toContain(pick?.note.id);
    expect(pick?.sendCount).toBe(1);
  });

  it('returns null when there are no candidates', () => {
    expect(selectNoteCandidate([])).toBeNull();
  });
});

describe('formatNoteMessage', () => {
  it('formats with MarkdownV2, bold title, italic author, page, and quote', () => {
    const candidate = createCandidate({
      book: { title: 'Clean Code', author: 'Robert C. Martin' } as BookRecord,
      note: {
        page_number: 42,
        content: 'Meaningful names matter.',
      } as NoteRecord,
    });

    const message = formatNoteMessage(candidate);

    expect(message).toBe(
      '📚 *Clean Code*\n_Robert C\\. Martin_\np\\.42\n\n> Meaningful names matter\\.',
    );
  });

  it('escapes MarkdownV2 reserved characters in fields', () => {
    const candidate = createCandidate({
      book: { title: 'A_B (C)', author: 'D-E.F' } as BookRecord,
      note: {
        page_number: 7,
        content: 'G+H#I|J!K',
      } as NoteRecord,
    });

    const message = formatNoteMessage(candidate);

    expect(message).toBe(
      '📚 *A\\_B \\(C\\)*\n_D\\-E\\.F_\np\\.7\n\n> G\\+H\\#I\\|J\\!K',
    );
  });

  it('quotes multi-line content correctly', () => {
    const candidate = createCandidate({
      book: { title: 'Book', author: 'Author' } as BookRecord,
      note: {
        page_number: 1,
        content: 'Line 1\nLine 2\nLine 3',
      } as NoteRecord,
    });

    const message = formatNoteMessage(candidate);

    expect(message).toContain('> Line 1\n> Line 2\n> Line 3');
  });

  it('handles missing page numbers with placeholder', () => {
    const candidate = createCandidate({
      book: { title: 'Missing Page', author: 'Author' } as BookRecord,
      note: {
        // Simulate nullable page_number edge case
        page_number: undefined as unknown as number,
        content: 'Content',
      } as NoteRecord,
    });

    const message = formatNoteMessage(candidate);

    expect(message).toContain('p\\.?');
  });

  it('omits content section when note content is empty', () => {
    const candidate = createCandidate({
      book: { title: 'Empty Content', author: 'Author' } as BookRecord,
      note: {
        page_number: 5,
        content: '',
      } as NoteRecord,
    });

    const message = formatNoteMessage(candidate);

    expect(message).not.toContain('> ');
    expect(message).toBe('📚 *Empty Content*\n_Author_\np\\.5');
  });
});

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

describe('sendTelegramMessage (via broadcastDailyNote)', () => {
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

  it('returns message_id on successful Telegram API call', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ result: { message_id: 42 } }),
    });

    const candidate = createCandidate({ note: { id: 1 } as NoteRecord });
    const repository: NoteBroadcastRepository = {
      getNoteCandidates: vi.fn().mockResolvedValue([candidate]),
      incrementSendCount: vi.fn(),
    };
    const telegramMessageRepository = {
      save: vi.fn().mockResolvedValue(undefined),
    };

    const sent = await broadcastDailyNote(baseEnv, {
      repository,
      fetchFn: mockFetch,
      randomFn: () => 0,
      telegramMessageRepository,
    });

    expect(sent).toBe(true);
  });

  it('returns false when Telegram 2xx response has missing message_id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ result: {} }), // no message_id
    });

    const candidate = createCandidate({ note: { id: 1 } as NoteRecord });
    const repository: NoteBroadcastRepository = {
      getNoteCandidates: vi.fn().mockResolvedValue([candidate]),
      incrementSendCount: vi.fn(),
    };
    const telegramMessageRepository = {
      save: vi.fn().mockResolvedValue(undefined),
    };

    const sent = await broadcastDailyNote(baseEnv, {
      repository,
      fetchFn: mockFetch,
      randomFn: () => 0,
      telegramMessageRepository,
    });

    expect(sent).toBe(false);
  });

  it('returns null (false) when Telegram API call fails', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'error',
      text: async () => 'fail',
    });

    const candidate = createCandidate({ note: { id: 1 } as NoteRecord });
    const repository: NoteBroadcastRepository = {
      getNoteCandidates: vi.fn().mockResolvedValue([candidate]),
      incrementSendCount: vi.fn(),
    };

    const sent = await broadcastDailyNote(baseEnv, {
      repository,
      fetchFn: mockFetch,
      randomFn: () => 0,
    });

    expect(sent).toBe(false);
  });
});

describe('broadcastDailyNote', () => {
  const baseEnv = {
    TELEGRAM_BOT_TOKEN: 'token',
    TELEGRAM_CHAT_ID: 'chat',
    // Unused bindings for this test
    DB: {} as D1Database,
    ASSETS: {} as Fetcher,
    LIBRARY_USER_ID: '',
    LIBRARY_PASSWORD: '',
    ALADIN_API_KEY: '',
    ENVIRONMENT: 'test',
  } as Env;

  it('skips sending when there are no notes', async () => {
    const mockFetch = vi.fn();
    const repository: NoteBroadcastRepository = {
      getNoteCandidates: vi.fn().mockResolvedValue([]),
      incrementSendCount: vi.fn(),
    };

    const sent = await broadcastDailyNote(baseEnv, {
      repository,
      fetchFn: mockFetch,
      randomFn: () => 0.5,
    });

    expect(sent).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(repository.incrementSendCount).not.toHaveBeenCalled();
  });

  it('handles Telegram failure without throwing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'error',
      text: async () => 'fail',
    });

    const candidate = createCandidate({ note: { id: 10 } as NoteRecord });
    const repository: NoteBroadcastRepository = {
      getNoteCandidates: vi.fn().mockResolvedValue([candidate]),
      incrementSendCount: vi.fn(),
    };

    const sent = await broadcastDailyNote(baseEnv, {
      repository,
      fetchFn: mockFetch,
      randomFn: () => 0,
    });

    expect(sent).toBe(false);
    expect(repository.incrementSendCount).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('sends note with MarkdownV2 payload and increments send count on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ result: { message_id: 999 } }),
    });

    const candidate = createCandidate({
      note: { id: 42, book_id: 1, page_number: 100, content: 'Test content' },
      book: { title: 'Test Book', author: 'Test Author' } as BookRecord,
    });
    const repository: NoteBroadcastRepository = {
      getNoteCandidates: vi.fn().mockResolvedValue([candidate]),
      incrementSendCount: vi.fn(),
    };
    const telegramMessageRepository = {
      save: vi.fn().mockResolvedValue(undefined),
    };

    const sent = await broadcastDailyNote(baseEnv, {
      repository,
      fetchFn: mockFetch,
      randomFn: () => 0,
      telegramMessageRepository,
    });

    expect(sent).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body as string);

    expect(body.parse_mode).toBe('MarkdownV2');
    expect(body.disable_web_page_preview).toBe(true);
    expect(body.text).toBe(formatNoteMessage(candidate));
    expect(body.text).toContain('📚 *Test Book*');
    expect(body.text).toContain('_Test Author_');
    expect(repository.incrementSendCount).toHaveBeenCalledWith(42);
  });

  it('does not increment send count when mapping save fails', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ result: { message_id: 1234 } }),
    });

    const candidate = createCandidate({
      note: { id: 10, book_id: 1, page_number: 1, content: 'test' },
    });
    const repository: NoteBroadcastRepository = {
      getNoteCandidates: vi.fn().mockResolvedValue([candidate]),
      incrementSendCount: vi.fn(),
    };
    const telegramMessageRepository = {
      save: vi.fn().mockRejectedValue(new Error('D1 error')),
      findNoteIdByMessageId: vi.fn(),
    };

    const sent = await broadcastDailyNote(baseEnv, {
      repository,
      fetchFn: mockFetch,
      randomFn: () => 0,
      telegramMessageRepository,
    });

    expect(sent).toBe(false);
    expect(repository.incrementSendCount).not.toHaveBeenCalled();
  });

  it('sends a second Telegram message for due-soon books after successful note send', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ result: { message_id: 100 } }),
    });

    const candidate = createCandidate({
      note: { id: 42, book_id: 1, page_number: 1, content: 'Content' },
    });
    const repository: NoteBroadcastRepository = {
      getNoteCandidates: vi.fn().mockResolvedValue([candidate]),
      incrementSendCount: vi.fn(),
    };
    const telegramMessageRepository = {
      save: vi.fn().mockResolvedValue(undefined),
    };
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

    const sent = await broadcastDailyNote(baseEnv, {
      repository,
      fetchFn: mockFetch,
      randomFn: () => 0,
      telegramMessageRepository,
      bookRepository,
    });

    expect(sent).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // Second call should contain the due-soon book title
    const secondCallBody = JSON.parse(
      mockFetch.mock.calls[1][1].body as string,
    );
    expect(secondCallBody.text).toContain('반납 예정');
  });

  it('sends due-soon message even when no notes are available', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ result: { message_id: 100 } }),
    });

    const repository: NoteBroadcastRepository = {
      getNoteCandidates: vi.fn().mockResolvedValue([]),
      incrementSendCount: vi.fn(),
    };
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

    const sent = await broadcastDailyNote(baseEnv, {
      repository,
      fetchFn: mockFetch,
      randomFn: () => 0,
      bookRepository,
    });

    expect(sent).toBe(false); // no note was sent
    expect(mockFetch).toHaveBeenCalledTimes(1); // due-soon message still sent
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(callBody.text).toContain('반납 예정');
  });

  it('does not send a second message when no books are due soon', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ result: { message_id: 200 } }),
    });

    const candidate = createCandidate({
      note: { id: 43, book_id: 1, page_number: 2, content: 'Content' },
    });
    const repository: NoteBroadcastRepository = {
      getNoteCandidates: vi.fn().mockResolvedValue([candidate]),
      incrementSendCount: vi.fn(),
    };
    const telegramMessageRepository = {
      save: vi.fn().mockResolvedValue(undefined),
    };
    const bookRepository = {
      findDueSoonBooks: vi.fn().mockResolvedValue([]),
    };

    const sent = await broadcastDailyNote(baseEnv, {
      repository,
      fetchFn: mockFetch,
      randomFn: () => 0,
      telegramMessageRepository,
      bookRepository,
    });

    expect(sent).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('stores telegram_message_id -> note_id mapping after successful send', async () => {
    const MESSAGE_ID = 7777;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ result: { message_id: MESSAGE_ID } }),
    });

    const candidate = createCandidate({
      note: { id: 55, book_id: 1, page_number: 10, content: 'Store test' },
    });
    const repository: NoteBroadcastRepository = {
      getNoteCandidates: vi.fn().mockResolvedValue([candidate]),
      incrementSendCount: vi.fn(),
    };
    const telegramMessageRepository = {
      save: vi.fn().mockResolvedValue(undefined),
      findNoteIdByMessageId: vi.fn(),
    };

    const deps: NoteBroadcastDeps = {
      repository,
      fetchFn: mockFetch,
      randomFn: () => 0,
      telegramMessageRepository,
    };

    await broadcastDailyNote(baseEnv, deps);

    expect(telegramMessageRepository.save).toHaveBeenCalledWith(MESSAGE_ID, 55);
  });
});
