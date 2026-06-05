/**
 * Book Request Handler (희망도서 신청 목록)
 * Manage locally-recorded requests for books the KNUE library does not hold.
 */

import { z } from 'zod';
import {
  type BookRequestRepository,
  createBookRequestRepository,
} from '../services/book-request-repository';
import type {
  BookRequestRecord,
  BookRequestViewModel,
  CreateBookRequestRequest,
  Env,
} from '../types';

type BookRequestRepo = Pick<
  BookRequestRepository,
  'findAll' | 'findByIsbn13' | 'create' | 'deleteById'
>;

const createBookRequestSchema = z.object({
  isbn13: z.string().trim().min(1, 'isbn13 is required'),
  isbn: z.string().nullable().optional(),
  title: z.string().trim().min(1, 'title is required'),
  author: z.string().nullable().optional(),
  publisher: z.string().nullable().optional(),
  pubDate: z.string().nullable().optional(),
  coverUrl: z.string().nullable().optional(),
  aladinLink: z.string().nullable().optional(),
});

function toViewModel(record: BookRequestRecord): BookRequestViewModel {
  return {
    id: record.id ?? 0,
    isbn13: record.isbn13,
    isbn: record.isbn,
    title: record.title,
    author: record.author,
    publisher: record.publisher,
    pubDate: record.pub_date,
    coverUrl: record.cover_url,
    aladinLink: record.aladin_link,
    createdAt: record.created_at ?? '',
  };
}

function validatePayload(body: unknown): {
  payload?: CreateBookRequestRequest;
  error?: string;
} {
  const parsed = createBookRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (!issue) return { error: 'Invalid request body' };
    const path = issue.path.length > 0 ? issue.path.join('.') : '';
    const message = path ? `${path}: ${issue.message}` : issue.message;
    return { error: message || 'Invalid request body' };
  }
  return { payload: parsed.data };
}

export async function handleCreateBookRequest(
  env: Env,
  request: Request,
  repo: BookRequestRepo = createBookRequestRepository(env.DB),
): Promise<Response> {
  try {
    const body = await request.json().catch(() => null);
    const { payload, error } = validatePayload(body);

    if (error || !payload) {
      return new Response(
        JSON.stringify({ code: 'INVALID_REQUEST', message: error }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const existing = await repo.findByIsbn13(payload.isbn13);
    if (existing) {
      return new Response(
        JSON.stringify({
          code: 'DUPLICATE_BOOK_REQUEST',
          message: '이미 신청한 도서입니다.',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const created = await repo.create({
      isbn13: payload.isbn13,
      isbn: payload.isbn ?? null,
      title: payload.title,
      author: payload.author ?? null,
      publisher: payload.publisher ?? null,
      pub_date: payload.pubDate ?? null,
      cover_url: payload.coverUrl ?? null,
      aladin_link: payload.aladinLink ?? null,
    });

    return new Response(JSON.stringify({ item: toViewModel(created) }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[BookRequest] Failed to create book request', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function handleGetBookRequests(
  env: Env,
  repo: BookRequestRepo = createBookRequestRepository(env.DB),
): Promise<Response> {
  try {
    const items = await repo.findAll();
    return new Response(JSON.stringify({ items: items.map(toViewModel) }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[BookRequest] Failed to list book requests', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function handleDeleteBookRequest(
  env: Env,
  id: number,
  repo: BookRequestRepo = createBookRequestRepository(env.DB),
): Promise<Response> {
  try {
    const deleted = await repo.deleteById(id);
    return new Response(JSON.stringify({ success: deleted }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[BookRequest] Failed to delete book request', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
