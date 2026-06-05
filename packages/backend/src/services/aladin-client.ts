/**
 * Aladin Open API Client
 * Fetches book metadata from Aladin's ItemLookUp API
 *
 * Trace: spec_id: SPEC-bookinfo-001, SPEC-backend-refactor-001, task_id: TASK-005, TASK-032, TASK-072, TASK-079
 */

import type {
  AladinItemLookupResponse,
  AladinItemSearchResponse,
  AladinSearchItem,
  BookInfo,
  Charge,
  ChargeWithBookInfo,
} from '../types';
import {
  ALADIN_CACHE_TTL_MS,
  ALADIN_LOOKUP_CONCURRENCY,
  ALADIN_LOOKUP_TIMEOUT_MS,
  ALADIN_SEARCH_CACHE_TTL_MS,
  ALADIN_SEARCH_TIMEOUT_MS,
  isToday,
} from '../utils';

// Use HTTPS to protect API key in transit
const BASE_URL = 'https://www.aladin.co.kr/ttb/api';

// Module-level cache shared across all AladinClient instances in the same isolate.
// Deduplicates repeat lookups within a cron run and across HTTP requests.
// Only definitive results (successful lookup, not-found) are cached for the full TTL.
// Transient failures (HTTP errors, timeouts, network errors) are not cached so the
// next request retries immediately.
const isbnCache = new Map<
  string,
  { value: BookInfo | null; expiresAt: number }
>();

/** Clear the module-level ISBN cache. Call this in test beforeEach to isolate tests. */
export function __clearAladinIsbnCache(): void {
  isbnCache.clear();
}

// Separate module-level cache for keyword search results. Keyword results drift
// over time (new releases), so a shorter TTL than the ISBN cache is used.
export interface AladinKeywordSearchResult {
  items: AladinSearchItem[];
  totalResults: number;
}

const keywordCache = new Map<
  string,
  { value: AladinKeywordSearchResult; expiresAt: number }
>();

/** Clear the module-level keyword cache. Call this in test beforeEach to isolate tests. */
export function __clearAladinKeywordCache(): void {
  keywordCache.clear();
}

export class AladinClient {
  constructor(
    private apiKey: string,
    private cacheTtlMs = ALADIN_CACHE_TTL_MS,
    private searchCacheTtlMs = ALADIN_SEARCH_CACHE_TTL_MS,
  ) {}

  /**
   * Look up book information by ISBN
   * @param isbn - Book ISBN (10 or 13 digits)
   * @param timeoutMs - Abort timeout in milliseconds
   * @returns Book information or null if not found
   */
  async lookupByIsbn(
    isbn: string,
    timeoutMs = ALADIN_LOOKUP_TIMEOUT_MS,
  ): Promise<BookInfo | null> {
    if (!isbn) {
      console.log('[AladinClient] No ISBN provided, skipping lookup');
      return null;
    }

    // Clean ISBN (remove hyphens)
    const cleanIsbn = isbn.replace(/-/g, '');

    const cached = isbnCache.get(cleanIsbn);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const params = new URLSearchParams({
      ttbkey: this.apiKey,
      itemIdType: 'ISBN',
      ItemId: cleanIsbn,
      output: 'js',
      Version: '20131101',
      OptResult: 'previewImgList,Toc',
      Cover: 'Big',
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${BASE_URL}/ItemLookUp.aspx?${params}`, {
        signal: controller.signal,
      });

      const now = Date.now();

      if (!response.ok) {
        console.error(`[AladinClient] API error: ${response.status}`);
        return null;
      }

      const data: AladinItemLookupResponse = await response.json();

      if (!data.item || data.item.length === 0) {
        console.log(`[AladinClient] No results found for ISBN: ${cleanIsbn}`);
        isbnCache.set(cleanIsbn, {
          value: null,
          expiresAt: now + this.cacheTtlMs,
        });
        return null;
      }

      const item = data.item[0];

      const bookInfo: BookInfo = {
        isbn: item.isbn,
        isbn13: item.isbn13,
        title: item.title,
        author: item.author,
        publisher: item.publisher,
        pubDate: item.pubDate,
        description: item.description,
        coverUrl: item.cover,
        tableOfContents: item.bookDtlContents,
      };

      isbnCache.set(cleanIsbn, {
        value: bookInfo,
        expiresAt: now + this.cacheTtlMs,
      });

      console.log(`[AladinClient] Found book: ${bookInfo.title}`);
      return bookInfo;
    } catch (error) {
      const now = Date.now();
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.error(
          `[AladinClient] Lookup timeout after ${timeoutMs}ms for ISBN ${cleanIsbn}`,
        );
        return null;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `[AladinClient] Lookup failed for ISBN ${cleanIsbn}: ${errorMessage}`,
      );
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Keyword search via Aladin ItemSearch.aspx.
   * Unlike lookupByIsbn, this THROWS on upstream failure (non-ok, timeout,
   * network) so the caller can surface a 502 instead of an empty result.
   * @param query - Keyword query (title/author/etc.)
   * @param max - Page size (1-50)
   * @param offset - Item offset; mapped to Aladin's 1-based `start` page
   * @param timeoutMs - Abort timeout in milliseconds
   * @returns Aladin search items plus the total match count
   */
  async searchByKeyword(
    query: string,
    max = 10,
    offset = 0,
    timeoutMs = ALADIN_SEARCH_TIMEOUT_MS,
  ): Promise<AladinKeywordSearchResult> {
    const trimmed = query.trim();
    if (!trimmed) {
      return { items: [], totalResults: 0 };
    }

    // Aladin paginates by 1-based page number, not byte offset.
    const start = Math.floor(offset / max) + 1;
    // Key includes apiKey: the cache is module-level and shared across all
    // AladinClient instances in the isolate, so results must not bleed across keys.
    const cacheKey = `${this.apiKey}|${trimmed}|${max}|${start}`;

    const cached = keywordCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const params = new URLSearchParams({
      ttbkey: this.apiKey,
      Query: trimmed,
      QueryType: 'Keyword',
      SearchTarget: 'Book',
      MaxResults: String(max),
      start: String(start),
      output: 'js',
      Version: '20131101',
      Cover: 'Big',
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${BASE_URL}/ItemSearch.aspx?${params}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Aladin ItemSearch error: ${response.status}`);
      }

      const data: AladinItemSearchResponse = await response.json();

      // Aladin signals failures (expired key, quota, bad params) with HTTP 200
      // and an errorCode in the body — treat that as an error, not empty results.
      if (data.errorCode) {
        throw new Error(
          `Aladin ItemSearch error: ${data.errorMessage ?? 'unknown'} (code: ${data.errorCode})`,
        );
      }

      const items = data.item ?? [];
      const result: AladinKeywordSearchResult = {
        items,
        totalResults: data.totalResults ?? items.length,
      };

      keywordCache.set(cacheKey, {
        value: result,
        expiresAt: Date.now() + this.searchCacheTtlMs,
      });

      console.log(
        `[AladinClient] Keyword "${trimmed}" returned ${items.length} items`,
      );
      return result;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`Aladin ItemSearch timeout after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Identify newly borrowed books (charged today)
 * @param charges - List of current charges
 * @returns Books that were borrowed today
 */
export function identifyNewBooks(
  charges: Charge[],
  offsetMinutes?: number,
): Charge[] {
  const newBooks = charges.filter((charge) =>
    isToday(charge.chargeDate, offsetMinutes),
  );

  console.log(`[AladinClient] Found ${newBooks.length} newly borrowed books`);
  return newBooks;
}

/**
 * Fetch book information for new charges
 * @param client - Aladin API client
 * @param charges - New book charges
 * @returns Array of book info with charge data
 */
export async function fetchNewBooksInfo(
  client: AladinClient,
  charges: Charge[],
  concurrency = ALADIN_LOOKUP_CONCURRENCY,
): Promise<ChargeWithBookInfo[]> {
  const results: ChargeWithBookInfo[] = [];

  for (let i = 0; i < charges.length; i += concurrency) {
    const batch = charges.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (charge) => {
        try {
          const isbn = charge.biblio.isbn;
          const bookInfo = await client.lookupByIsbn(isbn);
          return { charge, bookInfo };
        } catch (error) {
          console.error(
            `[AladinClient] Lookup failed for charge ${charge.id}:`,
            error,
          );
          return { charge, bookInfo: null };
        }
      }),
    );

    results.push(...batchResults);
  }

  const foundCount = results.filter((r) => r.bookInfo !== null).length;
  console.log(
    `[AladinClient] Retrieved info for ${foundCount}/${charges.length} books`,
  );

  return results;
}

/**
 * Create an Aladin client instance
 * @param apiKey - Aladin TTB API key
 */
export function createAladinClient(apiKey: string): AladinClient {
  return new AladinClient(apiKey);
}
