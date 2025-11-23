/**
 * Note broadcast tests
 * Trace: spec_id: SPEC-notes-telegram-001, task_id: TASK-028
 */

import { describe, expect, it, vi } from 'vitest';
import type { BookRecord, Env, NoteRecord } from '../../types';
import {
  broadcastDailyNote,
  formatNoteMessage,
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
  it("formats as 'title - author\\np.xx\\ncontent'", () => {
    const candidate = createCandidate({
      book: { title: 'Clean Code', author: 'Robert C. Martin' } as BookRecord,
      note: {
        page_number: 42,
        content: 'Meaningful names matter.',
      } as NoteRecord,
    });

    const message = formatNoteMessage(candidate);

    expect(message).toBe(
      'Clean Code - Robert C. Martin\np.42\nMeaningful names matter.',
    );
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
});
