/**
 * Library Search API Handler
 * Handles requests for searching books in KNUE library
 *
 * Trace: spec_id: SPEC-search-001
 *        task_id: TASK-search
 */

import { createLibraryClient } from '../services';
import type { SearchBook } from '../types';

/**
 * Parse publication string to extract publisher and year
 * Examples:
 *   "서울 :진선아이,2024" -> { publisher: "진선아이", year: "2024" }
 *   "서울 :A, B출판사,2024" -> { publisher: "A, B출판사", year: "2024" }
 */
export function parsePublication(publication: string): {
  publisher: string | null;
  year: string | null;
} {
  if (!publication) {
    return { publisher: null, year: null };
  }

  // Match pattern: location :publisher,year
  // Use lazy quantifier (.+?) to capture publisher (may contain commas)
  // Anchor year at end of string to handle commas in publisher names
  const match = publication.match(/[^:]+:\s*(.+?),\s*(\d{4})\s*$/);
  if (match) {
    return {
      publisher: match[1]?.trim() || null,
      year: match[2] || null,
    };
  }

  // Fallback: try to extract just the publisher without year
  const publisherOnlyMatch = publication.match(/[^:]+:\s*(.+)$/);
  if (publisherOnlyMatch) {
    return {
      publisher: publisherOnlyMatch[1]?.trim() || null,
      year: null,
    };
  }

  return { publisher: null, year: null };
}

/**
 * Transform SearchBook to simplified frontend format
 */
function transformSearchBook(book: SearchBook) {
  const { publisher, year } = parsePublication(book.publication);

  return {
    id: book.id,
    title: book.titleStatement,
    author: book.author || '저자 미상',
    publisher,
    year,
    coverUrl: book.thumbnailUrl,
    isbn: book.isbn,
    materialType: book.biblioType?.name || null,
    publication: book.publication,
    branchVolumes: book.branchVolumes,
  };
}

export interface SearchBooksQuery {
  query?: string;
  max?: number;
  offset?: number;
}

/**
 * Handle GET /api/search
 * Searches for books in the library
 *
 * Query parameters:
 * - query: Search query (title, author, ISBN, etc.)
 * - max: Maximum number of results (default: 20)
 * - offset: Offset for pagination (default: 0)
 */
export async function handleSearchBooksApi(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get('query');
  const maxParam = url.searchParams.get('max');
  const offsetParam = url.searchParams.get('offset');

  // Validate query parameter
  if (!query || query.trim() === '') {
    return new Response(
      JSON.stringify({ error: 'Query parameter is required' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const max = maxParam ? parseInt(maxParam, 10) : 20;
  const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

  // Validate parameters
  if (Number.isNaN(max) || max < 1 || max > 100) {
    return new Response(
      JSON.stringify({ error: 'Invalid max parameter (1-100)' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  if (Number.isNaN(offset) || offset < 0) {
    return new Response(
      JSON.stringify({ error: 'Invalid offset parameter (>= 0)' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  try {
    const libraryClient = createLibraryClient();

    const searchResult = await libraryClient.searchBooks(
      query.trim(),
      max,
      offset,
    );

    const items = searchResult.data.list.map(transformSearchBook);

    return new Response(
      JSON.stringify({
        items,
        meta: {
          count: items.length,
          totalCount: searchResult.data.totalCount,
          offset,
          max,
          query: query.trim(),
          isFuzzy: searchResult.data.isFuzzy,
        },
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[SearchHandler] Failed to search books: ${message}`);

    return new Response(JSON.stringify({ error: 'Failed to search books' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
