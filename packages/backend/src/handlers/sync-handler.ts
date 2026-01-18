/**
 * Library-DB Sync Handler
 * Synchronizes all currently borrowed books from library with D1 database
 *
 * Trace: spec_id: SPEC-sync-001, SPEC-return-001, SPEC-backend-refactor-001, task_id: TASK-021, TASK-034, TASK-073, TASK-074, TASK-081
 */

import {
  createAladinClient,
  createBookRecord,
  createBookRepository,
  createLibraryClient,
  createPlannedLoanRepository,
} from '../services';
import type { AladinClient } from '../services/aladin-client';
import type { BookRepository } from '../services/book-repository';
import type { LibraryClient } from '../services/library-client';
import { LibraryApiError } from '../services/library-client';
import type { PlannedLoanRepository } from '../services/planned-loan-repository';
import type {
  BookInfo,
  Charge,
  ChargeHistory,
  Env,
  SyncResponse,
  SyncSummary,
} from '../types';
import { ALADIN_LOOKUP_CONCURRENCY } from '../utils';

type SyncStatus = 'added' | 'updated' | 'unchanged' | 'returned';
type SyncErrorCode =
  | 'AUTH_FAILED'
  | 'LIBRARY_UNAVAILABLE'
  | 'LIBRARY_ERROR'
  | 'EXTERNAL_TIMEOUT'
  | 'UNKNOWN';

function classifySyncError(error: unknown): {
  code: SyncErrorCode;
  statusCode: number;
  message: string;
} {
  if (error instanceof LibraryApiError) {
    if (error.statusCode === 401) {
      return { code: 'AUTH_FAILED', statusCode: 401, message: error.message };
    }
    if (error.statusCode >= 500) {
      return {
        code: 'LIBRARY_UNAVAILABLE',
        statusCode: 503,
        message: error.message,
      };
    }
    return { code: 'LIBRARY_ERROR', statusCode: 502, message: error.message };
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return {
      code: 'EXTERNAL_TIMEOUT',
      statusCode: 504,
      message: 'External request timed out',
    };
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  return { code: 'UNKNOWN', statusCode: 500, message };
}

/**
 * Core sync logic - can be called from HTTP handler or cron
 */
export async function syncBooksCore(env: Env): Promise<SyncSummary> {
  const libraryClient = createLibraryClient();
  const aladinClient = createAladinClient(env.ALADIN_API_KEY);
  const bookRepository = createBookRepository(env.DB);
  const plannedLoanRepository = createPlannedLoanRepository(env.DB);

  const summary: SyncSummary = {
    total_charges: 0,
    added: 0,
    updated: 0,
    unchanged: 0,
    returned: 0,
  };

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
    return summary;
  }

  // Step 3: Compare with DB and sync each charge in parallel
  console.log(`[SyncHandler] Syncing ${charges.length} charges with DB...`);

  const results = await processChargesWithPlanningCleanup(
    charges,
    bookRepository,
    aladinClient,
    plannedLoanRepository,
  );

  // Aggregate results
  for (const status of results) {
    summary[status]++;
  }

  // Step 4: Fetch charge histories to mark returned books
  console.log('[SyncHandler] Fetching charge histories...');
  summary.returned = await fetchAndProcessReturns(
    libraryClient,
    bookRepository,
  );
  if (summary.returned > 0) {
    console.log(`[SyncHandler] Marked ${summary.returned} books as returned`);
  }

  return summary;
}

/**
 * Handle library-DB synchronization (HTTP endpoint)
 */
export async function handleSyncBooks(env: Env): Promise<Response> {
  try {
    const summary = await syncBooksCore(env);

    console.log('[SyncHandler] Sync completed with summary:', summary);

    const response: SyncResponse = {
      message:
        summary.total_charges === 0
          ? 'Sync completed - no books to sync'
          : 'Sync completed successfully',
      summary,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const { code, statusCode, message } = classifySyncError(error);
    console.error(`[SyncHandler] Sync failed (${code}):`, error);

    return new Response(JSON.stringify({ error: code, message }), {
      status: statusCode,
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

/**
 * Process charges and deduplicate planned loan deletions per biblio id
 */
export async function processChargesWithPlanningCleanup(
  charges: Charge[],
  bookRepository: BookRepository,
  aladinClient: AladinClient,
  plannedLoanRepository?: PlannedLoanRepository,
  options?: { concurrency?: number },
): Promise<SyncStatus[]> {
  const batchSize = Math.max(
    1,
    options?.concurrency ?? ALADIN_LOOKUP_CONCURRENCY,
  );
  const results: SyncStatus[] = [];

  for (let i = 0; i < charges.length; i += batchSize) {
    const batch = charges.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((charge) =>
        processCharge(charge, bookRepository, aladinClient),
      ),
    );
    results.push(...batchResults);
  }

  if (plannedLoanRepository) {
    const biblioIds = new Set<number>();
    for (const charge of charges) {
      biblioIds.add(charge.biblio.id);
    }

    await Promise.all(
      Array.from(biblioIds).map((biblioId) =>
        plannedLoanRepository.deleteByLibraryBiblioId(biblioId),
      ),
    );
  }

  return results;
}

/**
 * Fetches charge histories and processes returns
 * Consolidates the return processing logic used in both scheduled tasks and manual sync
 *
 * @param libraryClient - Authenticated library client
 * @param bookRepository - Database repository for books
 * @returns Number of books marked as returned
 */
export async function fetchAndProcessReturns(
  libraryClient: LibraryClient,
  bookRepository: BookRepository,
): Promise<number> {
  const histories = await libraryClient.getChargeHistories();

  if (histories.length === 0) {
    return 0;
  }

  const results = await Promise.all(
    histories.map((history) => processChargeHistory(history, bookRepository)),
  );

  return results.filter((status) => status === 'returned').length;
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
    // Trace: spec_id: SPEC-backend-refactor-001, task_id: TASK-076
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
