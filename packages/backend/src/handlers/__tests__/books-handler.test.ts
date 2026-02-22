import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookRecord, Env } from '../../types';
import {
  deriveBookViewModel,
  handleBooksApi,
  handleGetBook,
  sortBooks,
} from '../books-handler';

// Trace: spec_id: SPEC-frontend-001, task_id: TASK-019

describe('deriveBookViewModel', () => {
  const base: BookRecord = {
    id: 1,
    charge_id: '1',
    isbn: '9781234567890',
    isbn13: null,
    title: 'Sample Book',
    author: 'Author A',
    publisher: null,
    cover_url: null,
    description: null,
    pub_date: null,
    charge_date: '2025-11-20',
    due_date: '2025-11-25',
    renew_count: 1,
    is_read: 0,
  };

  it('flags overdue when due date is in the past (KST aware)', () => {
    const view = deriveBookViewModel(base, 0, new Date('2025-11-27T00:00:00Z'));
    expect(view.dueStatus).toBe('overdue');
    expect(view.daysLeft).toBeLessThan(0);
  });

  it('flags due_soon when due date is within 3 days', () => {
    const view = deriveBookViewModel(base, 0, new Date('2025-11-23T00:00:00Z'));
    expect(view.dueStatus).toBe('due_soon');
    expect(view.daysLeft).toBe(2);
  });

  it('flags ok when due date is beyond 3 days', () => {
    const view = deriveBookViewModel(base, 0, new Date('2025-11-21T00:00:00Z'));
    expect(view.dueStatus).toBe('ok');
    expect(view.daysLeft).toBeGreaterThan(3);
  });

  it('sets noteState to in_progress when noteCount > 0', () => {
    const view = deriveBookViewModel(base, 5, new Date('2025-11-21T00:00:00Z'));
    expect(view.noteCount).toBe(5);
    expect(view.noteState).toBe('in_progress');
  });

  it('maps abandoned when is_read is 2', () => {
    const view = deriveBookViewModel({ ...base, is_read: 2 }, 0);
    expect(view.readStatus).toBe('abandoned');
  });

  it('includes dbId from record', () => {
    const view = deriveBookViewModel(base, 0);
    expect(view.dbId).toBe(1);
  });

  it('marks loanState as returned and daysLeft zero when discharge_date exists', () => {
    const returned: BookRecord = {
      ...base,
      discharge_date: '2025-11-22 00:00:00',
      due_date: '2025-11-25 00:00:00',
    };

    const view = deriveBookViewModel(
      returned,
      0,
      new Date('2025-11-24T00:00:00Z'),
    );

    expect(view.loanState).toBe('returned');
    expect(view.daysLeft).toBe(0);
    expect(view.dueStatus).toBe('ok');
    expect(view.dischargeDate).toBe('2025-11-22 00:00:00');
  });
});

describe('sortBooks', () => {
  const records: BookRecord[] = [
    {
      charge_id: '1',
      isbn: 'a',
      isbn13: null,
      title: 'Older',
      author: 'A',
      publisher: null,
      cover_url: null,
      description: null,
      pub_date: null,
      charge_date: '2025-10-01',
      due_date: '2025-10-10',
      renew_count: 0,
      is_read: 0,
    },
    {
      charge_id: '2',
      isbn: 'b',
      isbn13: null,
      title: 'Newer',
      author: 'B',
      publisher: null,
      cover_url: null,
      description: null,
      pub_date: null,
      charge_date: '2025-11-01',
      due_date: '2025-11-10',
      renew_count: 1,
      is_read: 0,
    },
  ];

  it('sorts by charge_date descending', () => {
    const sorted = sortBooks(records);
    expect(sorted[0].charge_date).toBe('2025-11-01');
    expect(sorted[1].charge_date).toBe('2025-10-01');
  });
});

describe('handleBooksApi', () => {
  const createEnv = (): Env => ({
    DB: null as unknown as D1Database,
    ASSETS: { fetch: async () => new Response('') } as unknown as Fetcher,
    LIBRARY_USER_ID: '',
    LIBRARY_PASSWORD: '',
    ALADIN_API_KEY: '',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHAT_ID: '',
    ENVIRONMENT: 'test',
  });

  let env: Env;

  beforeEach(() => {
    env = createEnv();
  });

  it('returns sorted items with derived fields', async () => {
    const fakeBookRepo = {
      findAll: async () =>
        [
          {
            id: 2,
            charge_id: '2',
            isbn: 'b',
            isbn13: null,
            title: 'Newer',
            author: 'B',
            publisher: null,
            cover_url: null,
            description: null,
            pub_date: null,
            charge_date: '2025-11-02',
            due_date: '2025-11-12',
            renew_count: 0,
            is_read: 0,
          },
          {
            id: 1,
            charge_id: '1',
            isbn: 'a',
            isbn13: null,
            title: 'Older',
            author: 'A',
            publisher: null,
            cover_url: null,
            description: null,
            pub_date: null,
            charge_date: '2025-10-01',
            due_date: '2025-10-10',
            renew_count: 1,
            is_read: 0,
          },
        ] satisfies BookRecord[],
      updateReadStatus: async () => {},
    } as const;

    const fakeNoteRepo = {
      countNotesForBookIds: async () => new Map<number, number>(),
    } as const;

    const response = await handleBooksApi(env, fakeBookRepo, fakeNoteRepo);
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=30');
    const body = (await response.json()) as {
      items: Record<string, unknown>[];
    };
    const first = body.items[0];

    expect(first.id).toBe('2');
    expect(first.dbId).toBe(2);
    expect(first).toHaveProperty('dueStatus');
    expect(first).toHaveProperty('daysLeft');
    expect(first).toHaveProperty('noteCount', 0);
    expect(first).toHaveProperty('noteState', 'not_started');
  });

  it('returns noteCount from note repository', async () => {
    const fakeBookRepo = {
      findAll: async () =>
        [
          {
            id: 1,
            charge_id: '1',
            isbn: 'a',
            isbn13: null,
            title: 'Book',
            author: 'A',
            publisher: null,
            cover_url: null,
            description: null,
            pub_date: null,
            charge_date: '2025-11-02',
            due_date: '2025-11-12',
            renew_count: 0,
            is_read: 0,
          },
        ] satisfies BookRecord[],
      updateReadStatus: async () => {},
    } as const;

    const fakeNoteRepo = {
      countNotesForBookIds: async () => new Map<number, number>([[1, 3]]),
    } as const;

    const response = await handleBooksApi(env, fakeBookRepo, fakeNoteRepo);
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=30');
    const body = (await response.json()) as {
      items: Record<string, unknown>[];
    };
    const first = body.items[0];

    expect(first.noteCount).toBe(3);
    expect(first.noteState).toBe('in_progress');
  });

  it('returns cache headers for single book endpoint', async () => {
    const fakeBookRepo = {
      findById: async () =>
        ({
          id: 1,
          charge_id: '1',
          isbn: 'a',
          isbn13: null,
          title: 'Book',
          author: 'A',
          publisher: null,
          cover_url: null,
          description: null,
          pub_date: null,
          charge_date: '2025-11-02',
          due_date: '2025-11-12',
          renew_count: 0,
          is_read: 0,
        }) satisfies BookRecord,
      updateReadStatus: async () => {},
    } as const;

    const fakeNoteRepo = {
      findByBookId: async () => [],
    } as const;

    const response = await handleGetBook(env, 1, fakeBookRepo, fakeNoteRepo);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=30');
  });

  it('deduplicates repeated loans by ISBN and returns loanOrdinal', async () => {
    const fakeBookRepo = {
      findAll: async () =>
        [
          {
            id: 100,
            charge_id: 'charge-100',
            isbn: '978-1-4028-9462-6',
            isbn13: null,
            title: 'Clean Code',
            author: 'Robert C. Martin',
            publisher: null,
            cover_url: null,
            description: null,
            pub_date: null,
            charge_date: '2025-01-02',
            due_date: '2025-01-12',
            renew_count: 0,
            is_read: 0,
          },
          {
            id: 200,
            charge_id: 'charge-200',
            isbn: '9781402894626',
            isbn13: null,
            title: 'Clean Code',
            author: 'Robert C. Martin',
            publisher: null,
            cover_url: null,
            description: null,
            pub_date: null,
            charge_date: '2025-02-02',
            due_date: '2025-02-12',
            renew_count: 0,
            is_read: 0,
          },
          {
            id: 300,
            charge_id: 'charge-300',
            isbn: '9780321146533',
            isbn13: null,
            title: 'Refactoring',
            author: 'Martin Fowler',
            publisher: null,
            cover_url: null,
            description: null,
            pub_date: null,
            charge_date: '2025-03-02',
            due_date: '2025-03-12',
            renew_count: 0,
            is_read: 0,
          },
        ] satisfies BookRecord[],
      updateReadStatus: async () => {},
    } as const;

    const countNotesForBookIds = vi.fn(async () => new Map<number, number>());
    const fakeNoteRepo = {
      countNotesForBookIds,
    } as const;

    const response = await handleBooksApi(env, fakeBookRepo, fakeNoteRepo);
    const body = (await response.json()) as {
      items: Array<{ title: string; dbId: number; loanOrdinal: number }>;
    };

    expect(body.items).toHaveLength(2);
    expect(countNotesForBookIds).toHaveBeenCalledWith([300, 200]);

    const cleanCode = body.items.find((item) => item.title === 'Clean Code');
    expect(cleanCode).toEqual(
      expect.objectContaining({
        dbId: 200,
        loanOrdinal: 2,
      }),
    );
  });

  it('deduplicates by normalized title and author when ISBN is missing', async () => {
    const fakeBookRepo = {
      findAll: async () =>
        [
          {
            id: 11,
            charge_id: 'charge-11',
            isbn: '',
            isbn13: null,
            title: '  Deep   Work  ',
            author: 'Cal   Newport',
            publisher: null,
            cover_url: null,
            description: null,
            pub_date: null,
            charge_date: '2025-01-01',
            due_date: '2025-01-10',
            renew_count: 0,
            is_read: 0,
          },
          {
            id: 12,
            charge_id: 'charge-12',
            isbn: '',
            isbn13: null,
            title: 'deep work',
            author: '  cal newport ',
            publisher: null,
            cover_url: null,
            description: null,
            pub_date: null,
            charge_date: '2025-01-05',
            due_date: '2025-01-14',
            renew_count: 0,
            is_read: 0,
          },
        ] satisfies BookRecord[],
      updateReadStatus: async () => {},
    } as const;

    const fakeNoteRepo = {
      countNotesForBookIds: async () => new Map<number, number>(),
    } as const;

    const response = await handleBooksApi(env, fakeBookRepo, fakeNoteRepo);
    const body = (await response.json()) as {
      items: Array<{ dbId: number; loanOrdinal: number }>;
    };

    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toEqual(
      expect.objectContaining({
        dbId: 12,
        loanOrdinal: 2,
      }),
    );
  });

  it('does not deduplicate when ISBN differs even if title and author are same', async () => {
    const fakeBookRepo = {
      findAll: async () =>
        [
          {
            id: 21,
            charge_id: 'charge-21',
            isbn: '9780000000001',
            isbn13: null,
            title: 'Same Title',
            author: 'Same Author',
            publisher: null,
            cover_url: null,
            description: null,
            pub_date: null,
            charge_date: '2025-01-01',
            due_date: '2025-01-10',
            renew_count: 0,
            is_read: 0,
          },
          {
            id: 22,
            charge_id: 'charge-22',
            isbn: '9780000000002',
            isbn13: null,
            title: 'Same Title',
            author: 'Same Author',
            publisher: null,
            cover_url: null,
            description: null,
            pub_date: null,
            charge_date: '2025-01-05',
            due_date: '2025-01-14',
            renew_count: 0,
            is_read: 0,
          },
        ] satisfies BookRecord[],
      updateReadStatus: async () => {},
    } as const;

    const fakeNoteRepo = {
      countNotesForBookIds: async () => new Map<number, number>(),
    } as const;

    const response = await handleBooksApi(env, fakeBookRepo, fakeNoteRepo);
    const body = (await response.json()) as {
      items: Array<{ isbn13: string | null; loanOrdinal: number }>;
    };

    expect(body.items).toHaveLength(2);
    expect(body.items.every((item) => item.loanOrdinal === 1)).toBe(true);
  });

  it('selects stable representative by id when charge_date ties', async () => {
    const fakeBookRepo = {
      findAll: async () =>
        [
          {
            id: 31,
            charge_id: 'charge-31',
            isbn: '9781234567890',
            isbn13: null,
            title: 'Stable Book',
            author: 'Author',
            publisher: null,
            cover_url: null,
            description: null,
            pub_date: null,
            charge_date: '2025-02-01',
            due_date: '2025-02-10',
            renew_count: 0,
            is_read: 0,
          },
          {
            id: 32,
            charge_id: 'charge-32',
            isbn: '9781234567890',
            isbn13: null,
            title: 'Stable Book',
            author: 'Author',
            publisher: null,
            cover_url: null,
            description: null,
            pub_date: null,
            charge_date: '2025-02-01',
            due_date: '2025-02-11',
            renew_count: 0,
            is_read: 0,
          },
        ] satisfies BookRecord[],
      updateReadStatus: async () => {},
    } as const;

    const fakeNoteRepo = {
      countNotesForBookIds: async () => new Map<number, number>(),
    } as const;

    const response = await handleBooksApi(env, fakeBookRepo, fakeNoteRepo);
    const body = (await response.json()) as {
      items: Array<{ dbId: number; loanOrdinal: number }>;
    };

    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toEqual(
      expect.objectContaining({
        dbId: 32,
        loanOrdinal: 2,
      }),
    );
  });
});
