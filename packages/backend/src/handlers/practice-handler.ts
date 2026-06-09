/**
 * Practice sheet handler
 * GET /api/practice/today  — returns today's practice note (idempotent per KST day)
 * ?force=1                 — re-draws and records a new note
 */

import { z } from 'zod';
import { drawPracticeNote } from '../services/note-selection';
import type { Env, NoteRecord, NoteViewModel } from '../types';

const QuerySchema = z.object({
  force: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true'),
});

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

export async function handlePracticeDraw(
  env: Env,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    force: url.searchParams.get('force') ?? undefined,
  });
  const force = parsed.success ? parsed.data.force : false;

  const candidate = await drawPracticeNote(env, { force });

  if (!candidate) {
    return new Response(JSON.stringify({ error: 'No notes available' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { note, book } = candidate;

  const body = {
    note: toNoteViewModel(note),
    book: {
      id: book.id,
      title: book.title,
      author: book.author,
      publisher: book.publisher ?? null,
    },
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
