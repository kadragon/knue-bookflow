/**
 * Practice handler tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';
import { handlePracticeDraw } from '../practice-handler';

const mockDrawPracticeNote = vi.fn();

vi.mock('../../services/note-selection', () => ({
  drawPracticeNote: (...args: unknown[]) => mockDrawPracticeNote(...args),
}));

const baseEnv = {
  DB: {},
  ASSETS: {},
} as unknown as Env;

function makeRequest(path = '/api/practice/today'): Request {
  return new Request(`http://localhost${path}`);
}

describe('handlePracticeDraw', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with note and book when candidate found', async () => {
    const candidate = {
      note: {
        id: 1,
        book_id: 10,
        page_number: 42,
        content: '좋은 문장입니다.',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      book: {
        id: 10,
        title: '책 제목',
        author: '저자',
        publisher: '출판사',
        charge_id: 'c10',
        isbn: '9780000000010',
        charge_date: '2026-01-01',
        due_date: '2026-01-15',
        renew_count: 0,
        is_read: 0,
      },
      sendCount: 2,
      lastSentAt: null,
    };
    mockDrawPracticeNote.mockResolvedValue(candidate);

    const response = await handlePracticeDraw(baseEnv, makeRequest());

    expect(response.status).toBe(200);
    const body = await response.json<{ note: unknown; book: unknown }>();
    expect(body).toHaveProperty('note');
    expect(body).toHaveProperty('book');
    // note is camelCase NoteViewModel
    expect((body.note as Record<string, unknown>).bookId).toBe(10);
    expect((body.note as Record<string, unknown>).pageNumber).toBe(42);
    expect((body.note as Record<string, unknown>).content).toBe(
      '좋은 문장입니다.',
    );
    // book fields
    expect((body.book as Record<string, unknown>).title).toBe('책 제목');
  });

  it('returns 404 when no notes available', async () => {
    mockDrawPracticeNote.mockResolvedValue(null);

    const response = await handlePracticeDraw(baseEnv, makeRequest());

    expect(response.status).toBe(404);
    const body = await response.json<{ error: string }>();
    expect(body.error).toBeTruthy();
  });

  it('passes force=true when ?force=1 query param present', async () => {
    mockDrawPracticeNote.mockResolvedValue(null);

    await handlePracticeDraw(
      baseEnv,
      makeRequest('/api/practice/today?force=1'),
    );

    const [, deps] = mockDrawPracticeNote.mock.calls[0] as [
      unknown,
      { force?: boolean },
    ];
    expect(deps?.force).toBe(true);
  });

  it('passes force=false when query param absent', async () => {
    mockDrawPracticeNote.mockResolvedValue(null);

    await handlePracticeDraw(baseEnv, makeRequest('/api/practice/today'));

    const [, deps] = mockDrawPracticeNote.mock.calls[0] as [
      unknown,
      { force?: boolean },
    ];
    expect(deps?.force).toBe(false);
  });
});
