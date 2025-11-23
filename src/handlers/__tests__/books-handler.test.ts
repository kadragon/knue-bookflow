import { describe, expect, it } from 'vitest';
import type { BookRecord, Env } from '../../types';
import {
  deriveBookViewModel,
  handleBooksApi,
  sortBooks,
} from '../books-handler';

// Trace: spec_id: SPEC-frontend-001, task_id: TASK-019

describe('deriveBookViewModel', () => {
  const base: BookRecord = {
    id: 1,
    charge_id: '1',
    isbn: '9781234567890',
    title: 'Sample Book',
    author: 'Author A',
    publisher: null,
    cover_url: null,
    description: null,
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

  it('includes dbId from record', () => {
    const view = deriveBookViewModel(base, 0);
    expect(view.dbId).toBe(1);
  });
});

describe('sortBooks', () => {
  const records: BookRecord[] = [
    {
      charge_id: '1',
      isbn: 'a',
      title: 'Older',
      author: 'A',
      publisher: null,
      cover_url: null,
      description: null,
      charge_date: '2025-10-01',
      due_date: '2025-10-10',
      renew_count: 0,
      is_read: 0,
    },
    {
      charge_id: '2',
      isbn: 'b',
      title: 'Newer',
      author: 'B',
      publisher: null,
      cover_url: null,
      description: null,
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
  it('returns sorted items with derived fields', async () => {
    const fakeBookRepo = {
      findAll: async () =>
        [
          {
            id: 2,
            charge_id: '2',
            isbn: 'b',
            title: 'Newer',
            author: 'B',
            publisher: null,
            cover_url: null,
            description: null,
            charge_date: '2025-11-02',
            due_date: '2025-11-12',
            renew_count: 0,
            is_read: 0,
          },
          {
            id: 1,
            charge_id: '1',
            isbn: 'a',
            title: 'Older',
            author: 'A',
            publisher: null,
            cover_url: null,
            description: null,
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

    const env: Env = {
      DB: null as unknown as D1Database,
      ASSETS: { fetch: async () => new Response('') } as unknown as Fetcher,
      LIBRARY_USER_ID: '',
      LIBRARY_PASSWORD: '',
      ALADIN_API_KEY: '',
      ENVIRONMENT: 'test',
    };

    const response = await handleBooksApi(env, fakeBookRepo, fakeNoteRepo);
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
            title: 'Book',
            author: 'A',
            publisher: null,
            cover_url: null,
            description: null,
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

    const env: Env = {
      DB: null as unknown as D1Database,
      ASSETS: { fetch: async () => new Response('') } as unknown as Fetcher,
      LIBRARY_USER_ID: '',
      LIBRARY_PASSWORD: '',
      ALADIN_API_KEY: '',
      ENVIRONMENT: 'test',
    };

    const response = await handleBooksApi(env, fakeBookRepo, fakeNoteRepo);
    const body = (await response.json()) as {
      items: Record<string, unknown>[];
    };
    const first = body.items[0];

    expect(first.noteCount).toBe(3);
    expect(first.noteState).toBe('in_progress');
  });
});
