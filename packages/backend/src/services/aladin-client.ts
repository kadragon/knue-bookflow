/**
 * Aladin Open API Client
 * Fetches book metadata from Aladin's ItemLookUp API
 *
 * Trace: spec_id: SPEC-bookinfo-001, SPEC-backend-refactor-001, task_id: TASK-005, TASK-032, TASK-072
 */

import type {
  AladinItemLookupResponse,
  BookInfo,
  Charge,
  ChargeWithBookInfo,
} from '../types';
import { isToday } from '../utils';

// Use HTTPS to protect API key in transit
const BASE_URL = 'https://www.aladin.co.kr/ttb/api';

export class AladinClient {
  constructor(private apiKey: string) {}

  /**
   * Look up book information by ISBN
   * @param isbn - Book ISBN (10 or 13 digits)
   * @param timeoutMs - Abort timeout in milliseconds
   * @returns Book information or null if not found
   */
  async lookupByIsbn(
    isbn: string,
    timeoutMs = 3000,
  ): Promise<BookInfo | null> {
    if (!isbn) {
      console.log('[AladinClient] No ISBN provided, skipping lookup');
      return null;
    }

    // Clean ISBN (remove hyphens)
    const cleanIsbn = isbn.replace(/-/g, '');

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

      if (!response.ok) {
        console.error(`[AladinClient] API error: ${response.status}`);
        return null;
      }

      const data: AladinItemLookupResponse = await response.json();

      if (!data.item || data.item.length === 0) {
        console.log(`[AladinClient] No results found for ISBN: ${cleanIsbn}`);
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

      console.log(`[AladinClient] Found book: ${bookInfo.title}`);
      return bookInfo;
    } catch (error) {
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
  concurrency = 10,
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
