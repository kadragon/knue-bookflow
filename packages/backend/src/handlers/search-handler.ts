/**
 * Library Search API Handler
 * Handles requests for searching books in KNUE library
 *
 * Trace: spec_id: SPEC-search-001, SPEC-backend-refactor-001
 *        task_id: TASK-search, TASK-079
 */

import { createLibraryClient } from '../services';
import type { PlannedLoanAvailability, SearchBook } from '../types';
import {
  type AvailabilityFetcher,
  createCachedFetcher,
  normalizeBranchVolumes,
  parsePaginationParams,
  parsePublication,
  summarizeAvailability,
} from '../utils';

export { parsePublication } from '../utils';

function createAvailabilityFetcher(): AvailabilityFetcher {
  const client = createLibraryClient();
  return createCachedFetcher(async (libraryId: number) => {
    try {
      const items = await client.getBiblioItems(libraryId);
      return summarizeAvailability(items);
    } catch (error) {
      console.error(
        `[SearchHandler] Failed to fetch availability for ${libraryId}:`,
        error,
      );
      return null;
    }
  });
}

/**
 * Transform SearchBook to simplified frontend format
 */
function transformSearchBook(
  book: SearchBook,
  availability: PlannedLoanAvailability | null = null,
) {
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
    branchVolumes: normalizeBranchVolumes(book.branchVolumes),
    availability,
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

  // Trace: spec_id: SPEC-backend-refactor-001, task_id: TASK-077
  const pagination = parsePaginationParams(url.searchParams, {
    max: {
      default: 20,
      min: 1,
      max: 100,
      errorMessage: 'Invalid max parameter (1-100)',
    },
    offset: {
      default: 0,
      min: 0,
      errorMessage: 'Invalid offset parameter (>= 0)',
    },
  });

  if ('response' in pagination) {
    return pagination.response;
  }

  const { max = 20, offset = 0 } = pagination.values;

  try {
    const libraryClient = createLibraryClient();
    const fetchAvailability = createAvailabilityFetcher();

    const searchResult = await libraryClient.searchBooks(
      query.trim(),
      max,
      offset,
    );

    // Fetch availability for all search results in parallel
    const itemsWithAvailability = await Promise.all(
      searchResult.data.list.map(async (book) => {
        try {
          const availability = await fetchAvailability(book.id);
          return transformSearchBook(book, availability);
        } catch (error) {
          console.error(
            `[SearchHandler] Failed to fetch availability for book ${book.id}:`,
            error,
          );
          return transformSearchBook(book, null);
        }
      }),
    );

    return new Response(
      JSON.stringify({
        items: itemsWithAvailability,
        meta: {
          count: itemsWithAvailability.length,
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
