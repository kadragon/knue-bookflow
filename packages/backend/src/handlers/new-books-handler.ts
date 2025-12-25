/**
 * New Books API Handler
 * Handles requests for fetching new books from KNUE library
 *
 * Trace: spec_id: SPEC-new-books-001
 *        task_id: TASK-new-books
 */

import { createLibraryClient } from '../services';
import type { NewBook } from '../types';
import { normalizeBranchVolumes, parsePaginationParams } from '../utils';

/**
 * Format date to YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

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
 * Transform NewBook to simplified frontend format
 */
function transformNewBook(book: NewBook) {
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
  };
}

export interface NewBooksQuery {
  days?: number;
  max?: number;
  offset?: number;
}

/**
 * Handle GET /api/new-books
 * Fetches new books from the library within the specified date range
 *
 * Query parameters:
 * - days: Number of days to look back (default: 30)
 * - max: Maximum number of results per page (default: 50)
 * - offset: Offset for pagination (default: 0)
 */
export async function handleNewBooksApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  // Trace: spec_id: SPEC-backend-refactor-001, task_id: TASK-077
  const pagination = parsePaginationParams(url.searchParams, {
    days: {
      default: 30,
      min: 1,
      max: 365,
      errorMessage: 'Invalid days parameter (1-365)',
    },
    max: {
      default: 50,
      min: 1,
      max: 100,
      errorMessage: 'Invalid max parameter (1-100)',
    },
    offset: {
      default: 0,
      min: 0,
      errorMessage: 'Invalid offset parameter (must be >= 0)',
    },
  });

  if ('response' in pagination) {
    return pagination.response;
  }

  const { days = 30, max = 50, offset = 0 } = pagination.values;

  try {
    const libraryClient = createLibraryClient();

    // Calculate date range
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const response = await libraryClient.getNewBooks(
      formatDate(fromDate),
      formatDate(toDate),
      max,
      offset,
    );

    const items = response.data.list.map(transformNewBook);
    const totalCount = response.data.totalCount;
    const hasMore = offset + items.length < totalCount;

    return new Response(
      JSON.stringify({
        items,
        meta: {
          count: items.length,
          totalCount,
          offset,
          max,
          hasMore,
          days,
          fromDate: formatDate(fromDate),
          toDate: formatDate(toDate),
        },
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[NewBooksHandler] Failed to fetch new books: ${message}`);

    return new Response(
      JSON.stringify({ error: 'Failed to fetch new books' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
