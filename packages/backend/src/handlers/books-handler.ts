/**
 * Books API handler
 * Serves normalized book list for the bookshelf frontend
 *
 * Trace: spec_id: SPEC-frontend-001, SPEC-notes-002, SPEC-backend-refactor-001, task_id: TASK-019, TASK-023, TASK-079
 */

import { z } from 'zod';
import { createBookRepository } from '../services/book-repository';
import {
  buildBookShelfView,
  deriveBookViewModel,
  sortBooks,
} from '../services/book-shelf';
import { createNoteRepository } from '../services/note-repository';
import type { BookRecord, BookViewModel, DueStatus, Env } from '../types';
import { getTodayString } from '../utils/date';
import { isReadStatus } from '../utils/read-status';
import { jsonResponse } from '../utils/response';

export type { BookViewModel, DueStatus };

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
  userId: number,
  bookRepo: BookRepo = createBookRepository(env.DB),
  noteRepo: NoteRepo = createNoteRepository(env.DB),
): Promise<Response> {
  const records = await bookRepo.findAll(userId);
  const view = await buildBookShelfView(userId, records, noteRepo);
  return new Response(JSON.stringify({ items: view }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=30',
    },
  });
}

export async function handleUpdateReadStatus(
  env: Env,
  userId: number,
  bookId: number,
  request: Request,
  bookRepo: BookRepo = createBookRepository(env.DB),
): Promise<Response> {
  try {
    const body = (await request.json()) as { readStatus?: unknown };

    if (!isReadStatus(body.readStatus)) {
      return new Response('Invalid request body', { status: 400 });
    }

    const updated = await bookRepo.updateReadStatus(
      userId,
      bookId,
      body.readStatus,
    );
    if (!updated) {
      return new Response(JSON.stringify({ error: 'Book not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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
  userId: number,
  bookId: number,
  bookRepo: FullBookRepo = createBookRepository(env.DB),
  noteRepo: FullNoteRepo = createNoteRepository(env.DB),
): Promise<Response> {
  try {
    const record = await bookRepo.findById(userId, bookId);

    if (!record) {
      return new Response(JSON.stringify({ error: 'Book not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const notes = await noteRepo.findByBookId(userId, bookId);
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
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, max-age=30',
        },
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

type ManualBookRepo = Pick<
  ReturnType<typeof createBookRepository>,
  'findOnLoanManualBookByIsbn' | 'saveBook' | 'findByChargeId'
>;

const optionalText = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value) => value || null);

const createManualBookSchema = z.object({
  isbn13: optionalText,
  isbn: optionalText,
  title: z.string().trim().min(1, 'title is required'),
  author: optionalText,
  publisher: optionalText,
  pubDate: optionalText,
  coverUrl: optionalText,
  description: optionalText,
});

/**
 * Register a book by hand from an Aladin search result. It starts on loan
 * (unread, no discharge date) with charge_date = due_date = registration date,
 * and leaves the on-loan list once it is finished or abandoned.
 */
export async function handleCreateManualBook(
  env: Env,
  userId: number,
  request: Request,
  bookRepo: ManualBookRepo = createBookRepository(env.DB),
  today: string = getTodayString(),
): Promise<Response> {
  const parsed = createManualBookSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join('.') ?? '';
    const message = issue
      ? path
        ? `${path}: ${issue.message}`
        : issue.message
      : 'Invalid request body';
    return jsonResponse(
      { code: 'INVALID_REQUEST', message },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const payload = parsed.data;
  const isbn = payload.isbn13 ?? payload.isbn ?? '';

  try {
    if (isbn && (await bookRepo.findOnLoanManualBookByIsbn(userId, isbn))) {
      return jsonResponse(
        { code: 'DUPLICATE_MANUAL_BOOK', message: '이미 등록한 도서입니다.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const record: BookRecord = {
      charge_id: `manual:${crypto.randomUUID()}`,
      source: 'manual',
      isbn,
      isbn13: payload.isbn13,
      title: payload.title,
      author: payload.author ?? '',
      publisher: payload.publisher,
      cover_url: payload.coverUrl,
      description: payload.description,
      pub_date: payload.pubDate,
      charge_date: today,
      due_date: today,
      discharge_date: null,
      renew_count: 0,
      is_renewable: null,
      is_read: 0,
    };
    await bookRepo.saveBook(userId, record, null);

    const saved = await bookRepo.findByChargeId(userId, record.charge_id);
    if (!saved) {
      throw new Error(`manual book ${record.charge_id} missing after insert`);
    }

    return jsonResponse(
      { item: deriveBookViewModel(saved) },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[BooksHandler] Failed to register manual book', error);
    return jsonResponse(
      { error: 'Internal Server Error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
