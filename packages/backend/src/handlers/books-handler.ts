/**
 * Books API handler
 * Serves normalized book list for the bookshelf frontend
 *
 * Trace: spec_id: SPEC-frontend-001, SPEC-notes-002, SPEC-backend-refactor-001, task_id: TASK-019, TASK-023, TASK-079
 */

import { createBookRepository } from '../services/book-repository';
import { createNoteRepository } from '../services/note-repository';
import type {
  BookRecord,
  BookViewModel,
  DueStatus,
  Env,
  NoteState,
  ReadStatus,
} from '../types';
import { DUE_SOON_DAYS, KST_OFFSET_MINUTES } from '../utils';

export type { BookViewModel, DueStatus };

function zoneDayNumber(ms: number, offsetMinutes: number): number {
  return Math.floor((ms + offsetMinutes * 60 * 1000) / (24 * 60 * 60 * 1000));
}

function computeDaysLeft(
  dueDate: string,
  now: Date,
  offsetMinutes: number,
): number {
  // Extract date part only (handles "2025-12-01 00:00:00" format)
  const dueDateOnly = dueDate.split(' ')[0];
  const dueDay = zoneDayNumber(
    Date.parse(`${dueDateOnly}T00:00:00Z`),
    offsetMinutes,
  );
  const today = zoneDayNumber(now.getTime(), offsetMinutes);
  return dueDay - today;
}

function toReadStatus(value?: number | null): ReadStatus {
  if (value === 1) {
    return 'finished';
  }
  if (value === 2) {
    return 'abandoned';
  }
  return 'unread';
}

function isReadStatus(value: unknown): value is ReadStatus {
  return value === 'unread' || value === 'finished' || value === 'abandoned';
}

export function deriveBookViewModel(
  record: BookRecord,
  noteCount = 0,
  now = new Date(),
  offsetMinutes = KST_OFFSET_MINUTES,
): BookViewModel {
  const isReturned = Boolean(record.discharge_date);
  const daysLeft = isReturned
    ? 0
    : computeDaysLeft(record.due_date, now, offsetMinutes);

  let dueStatus: DueStatus = 'ok';
  if (!isReturned) {
    if (daysLeft < 0) {
      dueStatus = 'overdue';
    } else if (daysLeft <= DUE_SOON_DAYS) {
      dueStatus = 'due_soon';
    }
  }

  // Determine note state based on count
  let noteState: NoteState = 'not_started';
  if (noteCount > 0) {
    noteState = 'in_progress';
  }

  return {
    id: record.charge_id,
    dbId: record.id || 0,
    title: record.title,
    author: record.author,
    publisher: record.publisher,
    coverUrl: record.cover_url,
    description: record.description,
    isbn13: record.isbn13,
    pubDate: record.pub_date,
    chargeDate: record.charge_date,
    dueDate: record.due_date,
    dischargeDate: record.discharge_date ?? null,
    renewCount: record.renew_count,
    daysLeft,
    dueStatus,
    loanState: isReturned ? 'returned' : 'on_loan',
    noteCount,
    noteState,
    readStatus: toReadStatus(record.is_read ?? 0),
  };
}

export function sortBooks(records: BookRecord[]): BookRecord[] {
  return [...records].sort((a, b) => {
    // Sort by read status (unread first)
    const readA = a.is_read ?? 0;
    const readB = b.is_read ?? 0;
    if (readA !== readB) {
      return readA - readB;
    }
    // Then by charge date (newest first)
    return b.charge_date.localeCompare(a.charge_date);
  });
}

type BookRepo = Pick<
  ReturnType<typeof createBookRepository>,
  'findAll' | 'updateReadStatus'
>;
type NoteRepo = Pick<
  ReturnType<typeof createNoteRepository>,
  'countNotesForBookIds'
>;

export async function handleBooksApi(
  env: Env,
  bookRepo: BookRepo = createBookRepository(env.DB),
  noteRepo: NoteRepo = createNoteRepository(env.DB),
): Promise<Response> {
  const records = await bookRepo.findAll();
  const sorted = sortBooks(records);

  // Fetch all note counts in a single query to avoid N+1 problem
  const bookIds = sorted
    .map((r) => r.id)
    .filter((id): id is number => id !== undefined);
  const noteCounts = await noteRepo.countNotesForBookIds(bookIds);

  const view = sorted.map((record) => {
    const noteCount = record.id ? noteCounts.get(record.id) || 0 : 0;
    return deriveBookViewModel(record, noteCount);
  });

  return new Response(JSON.stringify({ items: view }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleUpdateReadStatus(
  env: Env,
  bookId: number,
  request: Request,
  bookRepo: BookRepo = createBookRepository(env.DB),
): Promise<Response> {
  try {
    const body = (await request.json()) as { readStatus?: unknown };

    if (!isReadStatus(body.readStatus)) {
      return new Response('Invalid request body', { status: 400 });
    }

    await bookRepo.updateReadStatus(bookId, body.readStatus);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(`[BooksHandler] Failed to update read status: ${error}`);
    return new Response('Internal Server Error', { status: 500 });
  }
}

/**
 * Get a single book by ID with notes
 * Trace: spec_id: SPEC-book-detail-001, task_id: TASK-030
 */
type FullBookRepo = Pick<
  ReturnType<typeof createBookRepository>,
  'findById' | 'updateReadStatus'
>;
type FullNoteRepo = Pick<
  ReturnType<typeof createNoteRepository>,
  'findByBookId'
>;

export async function handleGetBook(
  env: Env,
  bookId: number,
  bookRepo: FullBookRepo = createBookRepository(env.DB),
  noteRepo: FullNoteRepo = createNoteRepository(env.DB),
): Promise<Response> {
  try {
    const record = await bookRepo.findById(bookId);

    if (!record) {
      return new Response(JSON.stringify({ error: 'Book not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get notes
    const notes = await noteRepo.findByBookId(bookId);
    const notesView = notes.map((note) => ({
      id: note.id ?? 0,
      bookId: note.book_id,
      pageNumber: note.page_number,
      content: note.content,
      createdAt: note.created_at ?? '',
      updatedAt: note.updated_at ?? '',
    }));

    const bookView = deriveBookViewModel(record, notes.length);

    return new Response(
      JSON.stringify({
        book: bookView,
        notes: notesView,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error(`[BooksHandler] Failed to get book: ${error}`);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
