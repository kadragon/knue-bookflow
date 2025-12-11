/**
 * New Books API Handler
 * Handles requests for fetching new books from KNUE library
 *
 * Trace: spec_id: SPEC-new-books-001
 *        task_id: TASK-new-books
 */

import { createLibraryClient } from '../services';
import type { NewBook } from '../types';

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
function parsePublication(publication: string): {
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
  };
}

export interface NewBooksQuery {
  days?: number;
  max?: number;
}

/**
 * Handle GET /api/new-books
 * Fetches new books from the library within the specified date range
 *
 * Query parameters:
 * - days: Number of days to look back (default: 90)
 * - max: Maximum number of results (default: 50)
 */
export async function handleNewBooksApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const daysParam = url.searchParams.get('days');
  const maxParam = url.searchParams.get('max');

  const days = daysParam ? parseInt(daysParam, 10) : 90;
  const max = maxParam ? parseInt(maxParam, 10) : 50;

  // Validate parameters
  if (isNaN(days) || days < 1 || days > 365) {
    return new Response(
      JSON.stringify({ error: 'Invalid days parameter (1-365)' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  if (isNaN(max) || max < 1 || max > 100) {
    return new Response(
      JSON.stringify({ error: 'Invalid max parameter (1-100)' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  try {
    const libraryClient = createLibraryClient();

    // Calculate date range
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const newBooks = await libraryClient.getNewBooks(
      formatDate(fromDate),
      formatDate(toDate),
      max,
    );

    const items = newBooks.map(transformNewBook);

    return new Response(
      JSON.stringify({
        items,
        meta: {
          count: items.length,
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
