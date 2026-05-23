/**
 * Books API handler
 * Serves normalized book list for the bookshelf frontend
 *
 * Trace: spec_id: SPEC-frontend-001, SPEC-notes-002, SPEC-backend-refactor-001, task_id: TASK-019, TASK-023, TASK-079
 */

import { createBookRepository } from '../services/book-repository';
import {
  buildBookShelfView,
  deriveBookViewModel,
  sortBooks,
} from '../services/book-shelf';
import { createNoteRepository } from '../services/note-repository';
import type { BookViewModel, DueStatus, Env } from '../types';
import { isReadStatus } from '../utils/read-status';

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
  bookRepo: BookRepo = createBookRepository(env.DB),
  noteRepo: NoteRepo = createNoteRepository(env.DB),
): Promise<Response> {
  const records = await bookRepo.findAll();
  const view = await buildBookShelfView(records, noteRepo);
  return new Response(JSON.stringify({ items: view }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=30',
    },
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
