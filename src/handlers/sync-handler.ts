/**
 * Library-DB Sync Handler
 * Synchronizes all currently borrowed books from library with D1 database
 *
 * Trace: spec_id: SPEC-sync-001, SPEC-return-001, task_id: TASK-021, TASK-034
 */

import {
  createAladinClient,
  createBookRecord,
  createBookRepository,
  createLibraryClient,
} from '../services';
import type { AladinClient } from '../services/aladin-client';
import type { BookRepository } from '../services/book-repository';
import type { BookInfo, Charge, ChargeHistory, Env } from '../types';

type SyncStatus = 'added' | 'updated' | 'unchanged' | 'returned';

/**
 * Sync summary response
 */
export interface SyncSummary {
  total_charges: number;
  added: number;
  updated: number;
  unchanged: number;
  returned: number;
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
    returned: 0,
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

    // Step 4: Fetch charge histories to mark returned books
    console.log('[SyncHandler] Fetching charge histories...');
    const histories = await libraryClient.getChargeHistories();

    if (histories.length > 0) {
      console.log(
        `[SyncHandler] Processing ${histories.length} charge histories...`,
      );
      const historyResults = await Promise.all(
        histories.map((history) =>
          processChargeHistory(history, bookRepository),
        ),
      );

      for (const status of historyResults) {
        if (status === 'returned') {
          summary.returned++;
        }
      }
    }

    console.log('[SyncHandler] === Sync Summary ===');
    console.log(`[SyncHandler] Total charges: ${summary.total_charges}`);
    console.log(`[SyncHandler] Added: ${summary.added}`);
    console.log(`[SyncHandler] Updated: ${summary.updated}`);
    console.log(`[SyncHandler] Unchanged: ${summary.unchanged}`);
    console.log(`[SyncHandler] Marked returned: ${summary.returned}`);

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

  // Check if metadata recovery is needed (cover_url is null)
  const needsMetadataRecovery = !existing.cover_url;
  let bookInfo: BookInfo | null = null;

  if (needsMetadataRecovery) {
    console.log(
      `[SyncHandler] Metadata missing for ${charge.biblio.titleStatement}, fetching from Aladin`,
    );
    bookInfo = await fetchBookInfo(isbn, aladinClient, 'metadata recovery');
  }

  const metadataRecovered = needsMetadataRecovery && !!bookInfo?.coverUrl;

  // Book exists - check if update needed
  const needsUpdate =
    metadataRecovered ||
    existing.due_date !== charge.dueDate ||
    existing.renew_count !== charge.renewCnt;

  if (needsUpdate) {
    console.log(`[SyncHandler] Updating book: ${charge.biblio.titleStatement}`);

    const record = createBookRecord(charge, bookInfo || undefined);

    // Preserve existing metadata when Aladin lookup was not attempted or failed
    if (!bookInfo) {
      record.publisher = existing.publisher;
      record.cover_url = existing.cover_url;
      record.description = existing.description;
      record.isbn13 = existing.isbn13;
      record.pub_date = existing.pub_date;
    }

    await bookRepository.saveBook(record);
    return 'updated';
  }

  return 'unchanged';
}

export async function processChargeHistory(
  history: ChargeHistory,
  bookRepository: BookRepository,
): Promise<SyncStatus> {
  const chargeId = String(history.id);
  const dischargeDate = history.dischargeDate;

  if (!dischargeDate) {
    return 'unchanged';
  }

  let existing = await bookRepository.findByChargeId(chargeId);

  // ISBN fallback with chargeDate comparison for data consistency
  if (!existing && history.biblio.isbn) {
    const matches = await bookRepository.findByIsbn(history.biblio.isbn);
    // Find exact match by chargeDate to avoid matching different loan cycles
    existing =
      matches.find((m) => m.charge_date === history.chargeDate) ?? null;
    if (existing) {
      console.log(
        `[SyncHandler] Matched return ${chargeId} via ISBN fallback: ${history.biblio.isbn}`,
      );
    }
  }

  if (!existing) {
    console.log(
      `[SyncHandler] Return history ${chargeId} has no matching book; skipping`,
    );
    return 'unchanged';
  }

  if (existing.discharge_date) {
    return 'unchanged';
  }

  const recordToUpdate = {
    ...existing,
    discharge_date: dischargeDate,
    due_date: history.dueDate,
    renew_count: existing.renew_count ?? history.renewCnt ?? 0,
  };

  try {
    await bookRepository.saveBook(recordToUpdate);
    return 'returned';
  } catch (error) {
    console.error(
      `[SyncHandler] Failed to mark ${chargeId} as returned:`,
      error,
    );
    return 'unchanged';
  }
}
