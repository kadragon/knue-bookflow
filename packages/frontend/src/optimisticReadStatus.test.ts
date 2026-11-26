import { describe, expect, it } from 'vitest';
import type { ApiResponse, BookDetailResponse, BookItem } from './api';
import {
  patchBookDetailReadStatus,
  patchBooksReadStatus,
} from './optimisticReadStatus';

const makeBook = (overrides: Partial<BookItem> = {}): BookItem => ({
  id: 'charge-1',
  dbId: 1,
  title: 'T',
  author: 'A',
  publisher: null,
  coverUrl: null,
  description: null,
  isbn13: null,
  pubDate: null,
  chargeDate: '2025-02-01',
  dueDate: '2099-02-10',
  dischargeDate: null,
  renewCount: 0,
  daysLeft: 5,
  dueStatus: 'ok',
  loanState: 'on_loan',
  noteCount: 0,
  noteState: 'not_started',
  readStatus: 'unread',
  source: 'library',
  loanOrdinal: 1,
  ...overrides,
});

describe('patchBooksReadStatus', () => {
  it('updates only the matching book and keeps others untouched', () => {
    const data: ApiResponse = {
      items: [makeBook({ dbId: 1 }), makeBook({ dbId: 2, id: 'charge-2' })],
    };

    const next = patchBooksReadStatus(data, 1, 'finished');

    expect(next?.items[0].readStatus).toBe('finished');
    expect(next?.items[1].readStatus).toBe('unread');
  });

  it('does not mutate the input data', () => {
    const data: ApiResponse = { items: [makeBook({ dbId: 1 })] };

    const next = patchBooksReadStatus(data, 1, 'abandoned');

    expect(data.items[0].readStatus).toBe('unread');
    expect(next).not.toBe(data);
    expect(next?.items).not.toBe(data.items);
  });

  it('passes undefined through unchanged', () => {
    expect(patchBooksReadStatus(undefined, 1, 'finished')).toBeUndefined();
  });

  it('moves a manual book off loan when done and back when unread', () => {
    const data: ApiResponse = {
      items: [
        makeBook({ dbId: 1, source: 'manual' }),
        makeBook({ dbId: 2, id: 'charge-2' }),
      ],
    };

    const finished = patchBooksReadStatus(data, 1, 'finished');
    expect(finished?.items[0].loanState).toBe('returned');

    const abandoned = patchBooksReadStatus(data, 1, 'abandoned');
    expect(abandoned?.items[0].loanState).toBe('returned');

    const reopened = patchBooksReadStatus(finished, 1, 'unread');
    expect(reopened?.items[0].loanState).toBe('on_loan');
  });

  it('keeps a library book loan state for the library sync', () => {
    const data: ApiResponse = { items: [makeBook({ dbId: 2 })] };

    const next = patchBooksReadStatus(data, 2, 'finished');

    expect(next?.items[0].loanState).toBe('on_loan');
  });
});

describe('patchBookDetailReadStatus', () => {
  it('updates the detail book read status immutably', () => {
    const data: BookDetailResponse = { book: makeBook({ dbId: 7 }), notes: [] };

    const next = patchBookDetailReadStatus(data, 'finished');

    expect(next?.book.readStatus).toBe('finished');
    expect(data.book.readStatus).toBe('unread');
    expect(next).not.toBe(data);
  });

  it('passes undefined through unchanged', () => {
    expect(patchBookDetailReadStatus(undefined, 'finished')).toBeUndefined();
  });

  it('moves a manual detail book off loan when finished', () => {
    const data: BookDetailResponse = {
      book: makeBook({ dbId: 7, source: 'manual' }),
      notes: [],
    };

    expect(patchBookDetailReadStatus(data, 'finished')?.book.loanState).toBe(
      'returned',
    );
  });
});
