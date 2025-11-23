/**
 * Aladin Open API Client
 * Fetches book metadata from Aladin's ItemLookUp API
 *
 * Trace: spec_id: SPEC-bookinfo-001, task_id: TASK-005, TASK-032
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
   * @returns Book information or null if not found
   */
  async lookupByIsbn(isbn: string): Promise<BookInfo | null> {
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
      OptResult: 'previewImgList',
      Cover: 'Big',
    });

    try {
      const response = await fetch(`${BASE_URL}/ItemLookUp.aspx?${params}`);

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
      };

      console.log(`[AladinClient] Found book: ${bookInfo.title}`);
      return bookInfo;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `[AladinClient] Lookup failed for ISBN ${cleanIsbn}: ${errorMessage}`,
      );
      return null;
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
): Promise<ChargeWithBookInfo[]> {
  const results: ChargeWithBookInfo[] = [];

  for (const charge of charges) {
    const isbn = charge.biblio.isbn;
    const bookInfo = await client.lookupByIsbn(isbn);

    results.push({ charge, bookInfo });
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
