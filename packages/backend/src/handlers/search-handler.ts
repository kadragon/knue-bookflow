/**
 * Library Search API Handler
 * Handles requests for searching books in KNUE library
 *
 * Trace: spec_id: SPEC-search-001, SPEC-backend-refactor-001
 *        task_id: TASK-search, TASK-079
 */

import { createLibraryClient } from '../services';
import type {
  LibraryItem,
  PlannedLoanAvailability,
  SearchBook,
} from '../types';
import {
  AVAILABILITY_TTL_MS,
  MAX_AVAILABILITY_CACHE_SIZE,
  normalizeBranchVolumes,
  parsePaginationParams,
} from '../utils';

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
 * Summarize availability for a biblio's items
 * Rules:
 * - Available if at least one item is not charged
 * - Loaned out if all items are charged, with earliest due date
 */
function summarizeAvailability(items: LibraryItem[]): PlannedLoanAvailability {
  const totalItems = items.length;
  const availableItems = items.filter((item) => {
    const code = item.circulationState?.code;
    const isCharged = item.circulationState?.isCharged;
    // Primary check: use isCharged boolean when present
    if (isCharged === false) return true;
    if (isCharged === true) return false;
    // Fallback: check status codes when isCharged is undefined
    return code === 'READY' || code === 'ON_SHELF' || code === 'AVAILABLE';
  }).length;

  const dueDates = items
    .filter((item) => {
      const code = item.circulationState?.code;
      const isCharged = item.circulationState?.isCharged;
      return (
        isCharged === true ||
        code === 'LOAN' ||
        code === 'CHARGED' ||
        code === 'CHARGE'
      );
    })
    .map((item) => item.dueDate)
    .filter((date): date is string => Boolean(date))
    .map((date) => date.substring(0, 10)) // Extract YYYY-MM-DD
    .sort();

  const earliestDueDate = availableItems > 0 ? null : (dueDates[0] ?? null);

  return {
    status: availableItems > 0 ? 'available' : 'loaned_out',
    totalItems,
    availableItems,
    earliestDueDate,
  };
}

// Module-level cache for availability data
const availabilityCache = new Map<
  number,
  { value: PlannedLoanAvailability | null; expiresAt: number }
>();

type AvailabilityFetcher = (
  libraryId: number,
) => Promise<PlannedLoanAvailability | null>;

function createAvailabilityFetcher(): AvailabilityFetcher {
  const client = createLibraryClient();

  return async (libraryId: number): Promise<PlannedLoanAvailability | null> => {
    const now = Date.now();
    const cached = availabilityCache.get(libraryId);

    // Return cached value if still valid (LRU: move to end)
    if (cached && cached.expiresAt > now) {
      availabilityCache.delete(libraryId);
      availabilityCache.set(libraryId, cached);
      return cached.value;
    }

    try {
      // Fetch fresh value
      const items = await client.getBiblioItems(libraryId);
      const value = summarizeAvailability(items);

      // Implement simple LRU: remove oldest entry if cache is full
      if (availabilityCache.size >= MAX_AVAILABILITY_CACHE_SIZE) {
        const oldestKey = availabilityCache.keys().next().value;
        if (oldestKey !== undefined) {
          availabilityCache.delete(oldestKey);
        }
      }

      availabilityCache.set(libraryId, {
        value,
        expiresAt: now + AVAILABILITY_TTL_MS,
      });
      return value;
    } catch (error) {
      console.error(
        `[SearchHandler] Failed to fetch availability for ${libraryId}:`,
        error,
      );
      return null;
    }
  };
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
