/**
 * Aladin API Handler
 * Provides book information lookup via Aladin API
 * Trace: spec_id: SPEC-bookinfo-001
 */

import { createAladinClient } from '../services';
import type { BookInfo, Env } from '../types';

/**
 * Handle GET /api/aladin/isbn/:isbn
 * Fetches book details from Aladin API
 */
export async function handleGetBookByIsbn(
  env: Env,
  isbn: string,
): Promise<Response> {
  try {
    const aladinClient = createAladinClient(env.ALADIN_API_KEY);
    const bookInfo = await aladinClient.lookupByIsbn(isbn);

    if (!bookInfo) {
      return new Response(JSON.stringify({ error: 'Book not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ book: bookInfo }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[AladinHandler] Failed to fetch book: ${message}`);

    return new Response(
      JSON.stringify({ error: 'Failed to fetch book information' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
