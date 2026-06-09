/**
 * Note selection service tests
 */

import { describe, expect, it, vi } from 'vitest';
import type { BookRecord, NoteRecord } from '../../types';
import {
  drawPracticeNote,
  type NoteCandidate,
  type NoteSelectionDeps,
  type NoteSelectionRepository,
  selectNoteCandidate,
} from '../note-selection';

// KST = UTC+9
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kstDayStart(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+09:00`);
}

function createCandidate(
  overrides: Partial<{
    note: Partial<NoteRecord>;
    book: Partial<BookRecord>;
    sendCount: number;
    lastSentAt: string | null;
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
    lastSentAt: overrides.lastSentAt ?? null,
  };
}

function makeFakeRepo(
  candidates: NoteCandidate[],
): NoteSelectionRepository & { incrementCallCount: number } {
  let incrementCallCount = 0;
  return {
    getNoteCandidates: vi.fn().mockResolvedValue(candidates),
    incrementSendCount: vi.fn(async () => {
      incrementCallCount++;
    }),
    get incrementCallCount() {
      return incrementCallCount;
    },
  };
}

// ── selectNoteCandidate (same logic as before, tests ported from note-broadcast.test.ts) ──

describe('selectNoteCandidate', () => {
  const NOW = new Date('2026-05-26T03:00:00Z');

  it('returns null when there are no candidates', () => {
    expect(selectNoteCandidate([])).toBeNull();
  });

  it('cooldown filter excludes notes sent within 7 days', () => {
    const recentAt = new Date(
      NOW.getTime() - 2 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const candidates: NoteCandidate[] = [
      createCandidate({ note: { id: 1 }, sendCount: 1, lastSentAt: recentAt }),
      createCandidate({ note: { id: 2 }, sendCount: 0, lastSentAt: null }),
      createCandidate({ note: { id: 3 }, sendCount: 0, lastSentAt: null }),
    ];

    const results = new Set<number>();
    for (let i = 0; i <= 100; i++) {
      const pick = selectNoteCandidate(candidates, () => i / 100, { now: NOW });
      if (pick?.note.id) results.add(pick.note.id);
    }

    expect(results.has(1)).toBe(false);
    expect(results.has(2)).toBe(true);
    expect(results.has(3)).toBe(true);
  });

  it('falls back to all candidates when all are within cooldown window', () => {
    const recentAt = new Date(
      NOW.getTime() - 1 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const candidates: NoteCandidate[] = [
      createCandidate({ note: { id: 1 }, sendCount: 2, lastSentAt: recentAt }),
      createCandidate({ note: { id: 2 }, sendCount: 3, lastSentAt: recentAt }),
    ];

    const pick = selectNoteCandidate(candidates, () => 0, { now: NOW });

    expect(pick).not.toBeNull();
    expect([1, 2]).toContain(pick?.note.id);
  });

  it('weighted random favors lower sendCount', () => {
    const candidates: NoteCandidate[] = [
      createCandidate({ note: { id: 1 }, sendCount: 0, lastSentAt: null }),
      createCandidate({ note: { id: 2 }, sendCount: 4, lastSentAt: null }),
    ];

    const pickLow = selectNoteCandidate(candidates, () => 0.5, { now: NOW });
    const pickHigh = selectNoteCandidate(candidates, () => 0.95, { now: NOW });

    expect(pickLow?.note.id).toBe(1);
    expect(pickHigh?.note.id).toBe(2);
  });

  it('boundary: randomFn()=0 always picks first pool entry', () => {
    const candidates: NoteCandidate[] = [
      createCandidate({ note: { id: 1 }, sendCount: 0, lastSentAt: null }),
      createCandidate({ note: { id: 2 }, sendCount: 0, lastSentAt: null }),
    ];
    expect(
      selectNoteCandidate(candidates, () => 0, { now: NOW })?.note.id,
    ).toBe(1);
  });

  it('boundary: randomFn()=1 exercises pool fallback', () => {
    const candidates: NoteCandidate[] = [
      createCandidate({ note: { id: 7 }, sendCount: 0, lastSentAt: null }),
    ];
    expect(
      selectNoteCandidate(candidates, () => 1, { now: NOW })?.note.id,
    ).toBe(7);
  });

  it('invalid lastSentAt (NaN) excluded from eligible; cooldown fallback returns it', () => {
    const candidates: NoteCandidate[] = [
      createCandidate({
        note: { id: 1 },
        sendCount: 0,
        lastSentAt: 'not-a-date',
      }),
    ];
    expect(
      selectNoteCandidate(candidates, () => 0, { now: NOW })?.note.id,
    ).toBe(1);
  });
});

// ── drawPracticeNote ──

describe('drawPracticeNote', () => {
  // KST today: 2026-06-09, use UTC noon to be safely within that KST day
  const KST_TODAY_UTC = new Date('2026-06-09T03:00:00Z'); // 12:00 KST

  const baseEnv = {
    DB: {} as D1Database,
    ASSETS: {} as Fetcher,
    LIBRARY_USER_ID: '',
    LIBRARY_PASSWORD: '',
    ALADIN_API_KEY: '',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHAT_ID: '',
    ENVIRONMENT: 'test',
  };

  it('returns null when no candidates exist', async () => {
    const repo = makeFakeRepo([]);
    const deps: NoteSelectionDeps = { repository: repo, now: KST_TODAY_UTC };
    const result = await drawPracticeNote(baseEnv as never, deps);
    expect(result).toBeNull();
  });

  it('draws and records when no note was selected today', async () => {
    const yesterday = new Date(
      KST_TODAY_UTC.getTime() - 24 * 60 * 60 * 1000,
    ).toISOString();
    const candidates = [
      createCandidate({ note: { id: 1 }, sendCount: 0, lastSentAt: null }),
      createCandidate({ note: { id: 2 }, sendCount: 1, lastSentAt: yesterday }),
    ];
    const repo = makeFakeRepo(candidates);
    const deps: NoteSelectionDeps = {
      repository: repo,
      randomFn: () => 0,
      now: KST_TODAY_UTC,
    };

    const result = await drawPracticeNote(baseEnv as never, deps);

    expect(result).not.toBeNull();
    expect(repo.incrementSendCount).toHaveBeenCalledTimes(1);
    expect(repo.incrementSendCount).toHaveBeenCalledWith(
      result!.note.id,
      KST_TODAY_UTC,
    );
  });

  it('returns the already-drawn note without re-recording when called again today', async () => {
    // lastSentAt is within today KST (2026-06-09)
    const todayKSTIso = new Date(
      KST_TODAY_UTC.getTime() - KST_OFFSET_MS + 1000,
    ).toISOString();
    // Ensure it's today: 2026-06-09T00:00:01+09:00 = 2026-06-08T15:00:01Z → wait, let me just make it clearly today
    // KST today = 2026-06-09, so anything from 2026-06-08T15:00:00Z to 2026-06-09T14:59:59Z is "2026-06-09 KST"
    const clearlyTodayKST = '2026-06-09T00:00:00+09:00'; // midnight KST = 2026-06-08T15:00:00Z
    const alreadyDrawn = createCandidate({
      note: { id: 5 },
      sendCount: 3,
      lastSentAt: new Date(clearlyTodayKST).toISOString(),
    });
    const other = createCandidate({
      note: { id: 9 },
      sendCount: 0,
      lastSentAt: null,
    });
    const repo = makeFakeRepo([alreadyDrawn, other]);
    const deps: NoteSelectionDeps = {
      repository: repo,
      now: KST_TODAY_UTC,
    };

    const result = await drawPracticeNote(baseEnv as never, deps);

    expect(result?.note.id).toBe(5);
    expect(repo.incrementSendCount).not.toHaveBeenCalled();
  });

  it('force=true always draws a new note and records even when today note exists', async () => {
    const clearlyTodayKST = '2026-06-09T00:00:00+09:00';
    const alreadyDrawn = createCandidate({
      note: { id: 5 },
      sendCount: 3,
      lastSentAt: new Date(clearlyTodayKST).toISOString(),
    });
    const other = createCandidate({
      note: { id: 9 },
      sendCount: 0,
      lastSentAt: null,
    });
    const repo = makeFakeRepo([alreadyDrawn, other]);
    const deps: NoteSelectionDeps = {
      repository: repo,
      randomFn: () => 0,
      now: KST_TODAY_UTC,
      force: true,
    };

    const result = await drawPracticeNote(baseEnv as never, deps);

    expect(result).not.toBeNull();
    expect(repo.incrementSendCount).toHaveBeenCalledTimes(1);
  });

  it('yesterday note is NOT treated as today — draws fresh', async () => {
    // lastSentAt is yesterday KST: 2026-06-08T23:59:59+09:00 = 2026-06-08T14:59:59Z
    const yesterdayKSTEnd = new Date('2026-06-08T14:59:59Z').toISOString();
    const candidate = createCandidate({
      note: { id: 3 },
      sendCount: 1,
      lastSentAt: yesterdayKSTEnd,
    });
    const repo = makeFakeRepo([candidate]);
    const deps: NoteSelectionDeps = {
      repository: repo,
      randomFn: () => 0,
      now: KST_TODAY_UTC,
    };

    await drawPracticeNote(baseEnv as never, deps);

    // Must record because yesterday ≠ today
    expect(repo.incrementSendCount).toHaveBeenCalledTimes(1);
  });
});
