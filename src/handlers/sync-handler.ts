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
import type { Env } from '../types';

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

    // Step 3: Compare with DB and sync each charge
    console.log(`[SyncHandler] Syncing ${charges.length} charges with DB...`);

    for (const charge of charges) {
      const chargeId = String(charge.id);
      const existing = await bookRepository.findByChargeId(chargeId);

      if (!existing) {
        // Book not in DB - add with Aladin metadata
        console.log(`[SyncHandler] New book found: ${charge.volume.bib.title}`);

        const isbn = charge.volume.bib.isbn;
        let bookInfo = null;

        if (isbn) {
          console.log(`[SyncHandler] Looking up ISBN: ${isbn}`);
          bookInfo = await aladinClient.lookupByIsbn(isbn);
        }

        const record = createBookRecord(charge, bookInfo);
        await bookRepository.saveBook(record);
        summary.added++;
      } else {
        // Book exists - check if update needed
        const needsUpdate =
          existing.due_date !== charge.dueDate ||
          existing.renew_count !== charge.renewCnt;

        if (needsUpdate) {
          console.log(
            `[SyncHandler] Updating book: ${charge.volume.bib.title}`,
          );

          const record = createBookRecord(charge);
          // Preserve existing Aladin metadata
          record.publisher = existing.publisher;
          record.cover_url = existing.cover_url;
          record.description = existing.description;

          await bookRepository.saveBook(record);
          summary.updated++;
        } else {
          summary.unchanged++;
        }
      }
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
