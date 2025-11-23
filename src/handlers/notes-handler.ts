/**
 * Notes API handler
 * Handles CRUD operations for book notes
 *
 * Trace: spec_id: SPEC-notes-002, task_id: TASK-023
 */

import { createBookRepository, createNoteRepository } from '../services';
import type {
  CreateNoteRequest,
  Env,
  NoteRecord,
  NoteViewModel,
  UpdateNoteRequest,
} from '../types';

/**
 * Convert NoteRecord to NoteViewModel
 */
function toNoteViewModel(record: NoteRecord): NoteViewModel {
  return {
    id: record.id ?? 0,
    bookId: record.book_id,
    pageNumber: record.page_number,
    content: record.content,
    createdAt: record.created_at || new Date().toISOString(),
    updatedAt: record.updated_at || new Date().toISOString(),
  };
}

/**
 * GET /api/books/:id/notes
 * Returns all notes for a book sorted by page number
 */
export async function handleGetNotes(
  env: Env,
  bookId: number,
): Promise<Response> {
  const noteRepository = createNoteRepository(env.DB);
  const bookRepository = createBookRepository(env.DB);

  // Check if book exists by looking up via database id
  const book = await bookRepository.findById(bookId);

  if (!book) {
    return new Response(JSON.stringify({ error: 'Book not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const notes = await noteRepository.findByBookId(bookId);
  const viewModels = notes.map(toNoteViewModel);

  return new Response(JSON.stringify({ notes: viewModels }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * POST /api/books/:id/notes
 * Creates a new note for a book
 */
export async function handleCreateNote(
  env: Env,
  bookId: number,
  body: CreateNoteRequest,
): Promise<Response> {
  // Validate request body
  if (!body.page_number || !body.content) {
    return new Response(
      JSON.stringify({ error: 'page_number and content are required' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  if (typeof body.page_number !== 'number' || body.page_number < 1) {
    return new Response(
      JSON.stringify({ error: 'page_number must be a positive number' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  if (typeof body.content !== 'string' || body.content.trim() === '') {
    return new Response(
      JSON.stringify({ error: 'content must be a non-empty string' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const noteRepository = createNoteRepository(env.DB);
  const bookRepository = createBookRepository(env.DB);

  // Check if book exists
  const book = await bookRepository.findById(bookId);

  if (!book) {
    return new Response(JSON.stringify({ error: 'Book not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const note = await noteRepository.create({
    book_id: bookId,
    page_number: body.page_number,
    content: body.content.trim(),
  });

  return new Response(JSON.stringify({ note: toNoteViewModel(note) }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * PUT /api/notes/:id
 * Updates an existing note
 */
export async function handleUpdateNote(
  env: Env,
  noteId: number,
  body: UpdateNoteRequest,
): Promise<Response> {
  // Validate request body
  if (!body.page_number && !body.content) {
    return new Response(
      JSON.stringify({ error: 'page_number or content is required' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  if (body.page_number !== undefined) {
    if (typeof body.page_number !== 'number' || body.page_number < 1) {
      return new Response(
        JSON.stringify({ error: 'page_number must be a positive number' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  }

  if (body.content !== undefined) {
    if (typeof body.content !== 'string' || body.content.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'content must be a non-empty string' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  }

  const noteRepository = createNoteRepository(env.DB);

  // Check if note exists
  const existing = await noteRepository.findById(noteId);
  if (!existing) {
    return new Response(JSON.stringify({ error: 'Note not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const updates: Partial<Pick<NoteRecord, 'page_number' | 'content'>> = {};
  if (body.page_number !== undefined) {
    updates.page_number = body.page_number;
  }
  if (body.content !== undefined) {
    updates.content = body.content.trim();
  }

  const updated = await noteRepository.update(noteId, updates);

  if (!updated) {
    return new Response(JSON.stringify({ error: 'Failed to update note' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ note: toNoteViewModel(updated) }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * DELETE /api/notes/:id
 * Deletes a note
 */
export async function handleDeleteNote(
  env: Env,
  noteId: number,
): Promise<Response> {
  const noteRepository = createNoteRepository(env.DB);

  // Check if note exists
  const existing = await noteRepository.findById(noteId);
  if (!existing) {
    return new Response(JSON.stringify({ error: 'Note not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const deleted = await noteRepository.delete(noteId);

  return new Response(JSON.stringify({ success: deleted }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
