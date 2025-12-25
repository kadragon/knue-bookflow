/**
 * Aladin Open API Client
 * Fetches book metadata from Aladin's ItemLookUp API
 *
 * Trace: spec_id: SPEC-bookinfo-001, SPEC-backend-refactor-001, task_id: TASK-005, TASK-032, TASK-072, TASK-079
 */

import type {
  AladinItemLookupResponse,
  BookInfo,
  Charge,
  ChargeWithBookInfo,
} from '../types';
import {
  ALADIN_CACHE_TTL_MS,
  ALADIN_LOOKUP_CONCURRENCY,
  ALADIN_LOOKUP_TIMEOUT_MS,
  isToday,
} from '../utils';

// Use HTTPS to protect API key in transit
const BASE_URL = 'https://www.aladin.co.kr/ttb/api';

export class AladinClient {
  // Cache ISBN lookups for the lifetime of the instance
  private readonly cache = new Map<
    string,
    { value: BookInfo | null; expiresAt: number }
  >();

  constructor(
    private apiKey: string,
    private cacheTtlMs = ALADIN_CACHE_TTL_MS,
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

    const cached = this.cache.get(cleanIsbn);
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
        this.cache.set(cleanIsbn, {
          value: null,
          expiresAt: now + this.cacheTtlMs,
        });
        return null;
      }

      const data: AladinItemLookupResponse = await response.json();

      if (!data.item || data.item.length === 0) {
        console.log(`[AladinClient] No results found for ISBN: ${cleanIsbn}`);
        this.cache.set(cleanIsbn, {
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

      this.cache.set(cleanIsbn, {
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
        this.cache.set(cleanIsbn, {
          value: null,
          expiresAt: now + this.cacheTtlMs,
        });
        return null;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `[AladinClient] Lookup failed for ISBN ${cleanIsbn}: ${errorMessage}`,
      );
      this.cache.set(cleanIsbn, {
        value: null,
        expiresAt: now + this.cacheTtlMs,
      });
      return null;
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
