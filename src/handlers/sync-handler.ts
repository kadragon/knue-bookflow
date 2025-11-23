/**
 * Library-DB Sync Handler
 * Synchronizes all currently borrowed books from library with D1 database
 *
 * Trace: spec_id: SPEC-sync-001, task_id: TASK-021
 */

import {
  createAladinClient,
  createBookRecord,
  createBookRepository,
  createLibraryClient,
} from '../services';
import type { AladinClient } from '../services/aladin-client';
import type { BookRepository } from '../services/book-repository';
import type { BookInfo, Charge, Env } from '../types';

type SyncStatus = 'added' | 'updated' | 'unchanged';

/**
 * Sync summary response
 */
export interface SyncSummary {
  total_charges: number;
  added: number;
  updated: number;
  unchanged: number;
}

export interface SyncResponse {
  message: string;
  summary: SyncSummary;
}

/**
 * Handle library-DB synchronization
 */
export async function handleSyncBooks(env: Env): Promise<Response> {
  const libraryClient = createLibraryClient();
  const aladinClient = createAladinClient(env.ALADIN_API_KEY);
  const bookRepository = createBookRepository(env.DB);

  const summary: SyncSummary = {
    total_charges: 0,
    added: 0,
    updated: 0,
    unchanged: 0,
  };

  try {
    // Step 1: Authenticate with library API
    console.log('[SyncHandler] Authenticating with library...');
    await libraryClient.login({
      loginId: env.LIBRARY_USER_ID,
      password: env.LIBRARY_PASSWORD,
    });

    // Step 2: Fetch all current charges
    console.log('[SyncHandler] Fetching all charges...');
    const charges = await libraryClient.getCharges();
    summary.total_charges = charges.length;

    if (charges.length === 0) {
      console.log('[SyncHandler] No borrowed books found');
      return new Response(
        JSON.stringify({
          message: 'Sync completed - no books to sync',
          summary,
        } as SyncResponse),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Step 3: Compare with DB and sync each charge in parallel
    console.log(`[SyncHandler] Syncing ${charges.length} charges with DB...`);

    const results = await Promise.all(
      charges.map((charge) =>
        processCharge(charge, bookRepository, aladinClient),
      ),
    );

    // Aggregate results
    for (const status of results) {
      summary[status]++;
    }

    console.log('[SyncHandler] === Sync Summary ===');
    console.log(`[SyncHandler] Total charges: ${summary.total_charges}`);
    console.log(`[SyncHandler] Added: ${summary.added}`);
    console.log(`[SyncHandler] Updated: ${summary.updated}`);
    console.log(`[SyncHandler] Unchanged: ${summary.unchanged}`);

    const response: SyncResponse = {
      message: 'Sync completed successfully',
      summary,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`[SyncHandler] Sync failed: ${errorMessage}`);

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Fetch book metadata from Aladin with error handling
 */
async function fetchBookInfo(
  isbn: string | null,
  aladinClient: AladinClient,
  context: string,
): Promise<BookInfo | null> {
  if (!isbn) {
    return null;
  }

  try {
    console.log(`[SyncHandler] Looking up ISBN: ${isbn} (${context})`);
    return await aladinClient.lookupByIsbn(isbn);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(
      `[SyncHandler] Aladin lookup failed for ${isbn}: ${errorMessage}`,
    );
    return null;
  }
}

/**
 * Process a single charge and return sync status
 */
export async function processCharge(
  charge: Charge,
  bookRepository: BookRepository,
  aladinClient: AladinClient,
): Promise<SyncStatus> {
  const chargeId = String(charge.id);
  const existing = await bookRepository.findByChargeId(chargeId);
  const isbn = charge.biblio.isbn;

  if (!existing) {
    // Book not in DB - add with Aladin metadata
    console.log(
      `[SyncHandler] New book found: ${charge.biblio.titleStatement}`,
    );

    const bookInfo = await fetchBookInfo(isbn, aladinClient, 'new book');
    const record = createBookRecord(charge, bookInfo);
    await bookRepository.saveBook(record);
    return 'added';
  }

  // Check if cover refresh is needed
  const coverMissing = !existing.cover_url;
  let bookInfo: BookInfo | null = null;

  if (coverMissing) {
    console.log(
      `[SyncHandler] Cover missing for ${charge.biblio.titleStatement}, fetching from Aladin`,
    );
    bookInfo = await fetchBookInfo(isbn, aladinClient, 'cover refresh');
  }

  const coverRefreshed = coverMissing && !!bookInfo?.coverUrl;

  // Book exists - check if update needed
  const needsUpdate =
    coverRefreshed ||
    existing.due_date !== charge.dueDate ||
    existing.renew_count !== charge.renewCnt;

  if (needsUpdate) {
    console.log(`[SyncHandler] Updating book: ${charge.biblio.titleStatement}`);

    const record = createBookRecord(charge, bookInfo || undefined);
    await bookRepository.saveBook(record);
    return 'updated';
  }

  return 'unchanged';
}
