/**
 * KNUE BookFlow - Cloudflare Worker Entry Point
 * Automatic book renewal system for Korea National University of Education library
 *
 * Trace: spec_id: SPEC-backend-refactor-001, task_id: TASK-001, TASK-007, TASK-012, TASK-016, TASK-023, TASK-079
 */

import { handleGetBookByIsbn } from './handlers/aladin-handler';
import {
  handleBooksApi,
  handleGetBook,
  handleUpdateReadStatus,
} from './handlers/books-handler';
import { handleNewBooksApi } from './handlers/new-books-handler';
import {
  handleCreateNote,
  handleDeleteNote,
  handleGetNotes,
  handleUpdateNote,
} from './handlers/notes-handler';
import {
  handleCreatePlannedLoan,
  handleDeletePlannedLoan,
  handleGetPlannedLoans,
} from './handlers/planned-loans-handler';
import { handleSearchBooksApi } from './handlers/search-handler';
import {
  fetchAndProcessReturns,
  handleSyncBooks,
  processCharge,
} from './handlers/sync-handler';
import {
  broadcastDailyNote,
  checkAndRenewBooks,
  createAladinClient,
  createBookRepository,
  createLibraryClient,
  logRenewalResults,
  NOTE_BROADCAST_CRON,
  type RenewalResult,
} from './services';
import type { CreateNoteRequest, Env, UpdateNoteRequest } from './types';
import { createDebugLogger, isDebugEnabled } from './utils';

export default {
  /**
   * Cron Trigger Handler - Notes broadcast only
   */
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    // Trace: spec_id: SPEC-scheduler-001, task_id: TASK-070
    if (event.cron === NOTE_BROADCAST_CRON) {
      ctx.waitUntil(handleNoteBroadcast(env));
    } else {
      console.warn(
        `[BookFlow] Unknown cron '${event.cron}', skipping renewal workflow`,
      );
    }
  },

  /**
   * HTTP Request Handler - For manual triggers and health checks
   */
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    if (url.pathname === '/api/books' && request.method === 'GET') {
      return handleBooksApi(env);
    }

    // New books API endpoint (신착 도서)
    if (url.pathname === '/api/new-books' && request.method === 'GET') {
      return handleNewBooksApi(request);
    }

    // Library search API endpoint
    if (url.pathname === '/api/search' && request.method === 'GET') {
      return handleSearchBooksApi(request);
    }

    // Aladin book lookup by ISBN
    const aladinIsbnMatch = url.pathname.match(/^\/api\/aladin\/isbn\/(.+)$/);
    if (aladinIsbnMatch && request.method === 'GET') {
      const isbn = decodeURIComponent(aladinIsbnMatch[1]);
      return handleGetBookByIsbn(env, isbn);
    }

    // Planned loans API endpoints
    if (url.pathname === '/api/planned-loans') {
      if (request.method === 'GET') {
        return handleGetPlannedLoans(env);
      }
      if (request.method === 'POST') {
        return handleCreatePlannedLoan(env, request);
      }
    }

    const plannedLoanMatch = url.pathname.match(
      /^\/api\/planned-loans\/(\d+)$/,
    );
    if (plannedLoanMatch && request.method === 'DELETE') {
      const plannedId = parseInt(plannedLoanMatch[1], 10);
      return handleDeletePlannedLoan(env, plannedId);
    }

    // Library-DB sync endpoint
    if (url.pathname === '/api/books/sync' && request.method === 'POST') {
      return handleSyncBooks(env);
    }

    // Get single book endpoint
    // Trace: spec_id: SPEC-book-detail-001, task_id: TASK-030
    const singleBookMatch = url.pathname.match(/^\/api\/books\/(\d+)$/);
    if (singleBookMatch && request.method === 'GET') {
      const bookId = parseInt(singleBookMatch[1], 10);
      return handleGetBook(env, bookId);
    }

    // Update read status endpoint
    const readStatusMatch = url.pathname.match(
      /^\/api\/books\/(\d+)\/read-status$/,
    );
    if (readStatusMatch && request.method === 'PATCH') {
      const bookId = parseInt(readStatusMatch[1], 10);
      return handleUpdateReadStatus(env, bookId, request);
    }

    // Notes API endpoints
    // GET /api/books/:id/notes - Get notes for a book
    // POST /api/books/:id/notes - Create a note
    const bookNotesMatch = url.pathname.match(/^\/api\/books\/(\d+)\/notes$/);
    if (bookNotesMatch) {
      const bookId = parseInt(bookNotesMatch[1], 10);

      if (request.method === 'GET') {
        return handleGetNotes(env, bookId);
      }

      if (request.method === 'POST') {
        const body = (await request.json()) as CreateNoteRequest;
        return handleCreateNote(env, bookId, body);
      }
    }

    // PUT /api/notes/:id - Update a note
    // DELETE /api/notes/:id - Delete a note
    const noteMatch = url.pathname.match(/^\/api\/notes\/(\d+)$/);
    if (noteMatch) {
      const noteId = parseInt(noteMatch[1], 10);

      if (request.method === 'PUT') {
        const body = (await request.json()) as UpdateNoteRequest;
        return handleUpdateNote(env, noteId, body);
      }

      if (request.method === 'DELETE') {
        return handleDeleteNote(env, noteId);
      }
    }

    // Manual trigger endpoint (access controlled via Zero Trust)
    // POST only - triggering task has side effects, violates REST if GET allowed
    if (url.pathname === '/trigger' && request.method === 'POST') {
      ctx.waitUntil(handleManualTrigger(env));
      return new Response(JSON.stringify({ message: 'Task triggered' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Serve static assets (SPA) via Cloudflare Assets binding
    if (!env.ASSETS) {
      console.error('[BookFlow] ASSETS binding not configured');
      return new Response('Service configuration error', { status: 500 });
    }
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    // SPA fallback to index.html when navigating client-side routes
    const acceptHeader = request.headers.get('accept') || '';
    if (acceptHeader.includes('text/html')) {
      const indexResponse = await env.ASSETS.fetch(
        new Request(new URL('/index.html', request.url).toString(), request),
      );
      if (indexResponse.status !== 404) {
        return indexResponse;
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};

/**
 * Main workflow handler for manual trigger
 * Orchestrates the complete book renewal process
 */
async function handleManualTrigger(
  env: Env,
  _event?: ScheduledEvent,
): Promise<void> {
  const startTime = Date.now();
  const logDebug = createDebugLogger(isDebugEnabled(env));
  logDebug(
    `[BookFlow] Starting workflow run at ${new Date().toISOString()}`,
  );

  // Initialize services
  const libraryClient = createLibraryClient();
  const aladinClient = createAladinClient(env.ALADIN_API_KEY);
  const bookRepository = createBookRepository(env.DB);

  let renewalResults: RenewalResult[] = [];

  try {
    // Step 1: Authenticate with library API
    logDebug('[BookFlow] Step 1: Authenticating...');
    await libraryClient.login({
      loginId: env.LIBRARY_USER_ID,
      password: env.LIBRARY_PASSWORD,
    });

    // Step 2: Fetch current charges
    logDebug('[BookFlow] Step 2: Fetching charges...');
    const charges = await libraryClient.getCharges();

    if (charges.length === 0) {
      logDebug('[BookFlow] No borrowed books found. Task complete.');
      return;
    }

    // Step 3-4: Check and process renewals (charges already fetched)
    logDebug('[BookFlow] Step 3-4: Processing renewals...');
    renewalResults = await checkAndRenewBooks(libraryClient, charges);

    // Log renewal results to database
    await logRenewalResults(bookRepository, renewalResults);

    // Step 5: Sync all books with database
    // Trace: spec_id: SPEC-backend-refactor-001, task_id: TASK-075
    logDebug('[BookFlow] Step 5: Syncing books with database...');

    const syncResults = await Promise.allSettled(
      charges.map((charge) =>
        processCharge(charge, bookRepository, aladinClient),
      ),
    );

    const syncStatuses = syncResults.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    const syncErrors = syncResults.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    );

    for (const error of syncErrors) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(`[BookFlow] Sync failed: ${errorMessage}`);
    }

    const addedCount = syncStatuses.filter((s) => s === 'added').length;
    const updatedCount = syncStatuses.filter((s) => s === 'updated').length;
    const syncFailureCount = syncErrors.length;

    // Step 6: Fetch charge histories to mark returned books
    logDebug('[BookFlow] Step 6: Fetching charge histories...');
    const returnedCount = await fetchAndProcessReturns(
      libraryClient,
      bookRepository,
    );
    if (returnedCount > 0) {
      logDebug(`[BookFlow] Marked ${returnedCount} books as returned`);
    }

    // Step 7: Log summary
    const duration = Date.now() - startTime;
    const successCount = renewalResults.filter((r) => r.success).length;
    const failCount = renewalResults.filter((r) => !r.success).length;

    logDebug('[BookFlow] === Task Summary ===');
    logDebug(`[BookFlow] Total charges: ${charges.length}`);
    logDebug(`[BookFlow] Books added: ${addedCount}`);
    logDebug(`[BookFlow] Books updated: ${updatedCount}`);
    logDebug(`[BookFlow] Sync failures: ${syncFailureCount}`);
    logDebug(`[BookFlow] Marked returned: ${returnedCount}`);
    logDebug(`[BookFlow] Renewals attempted: ${renewalResults.length}`);
    logDebug(`[BookFlow] Renewals succeeded: ${successCount}`);
    logDebug(`[BookFlow] Renewals failed: ${failCount}`);
    logDebug(`[BookFlow] Duration: ${duration}ms`);
    logDebug('[BookFlow] Task completed successfully');
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`[BookFlow] Task failed: ${errorMessage}`);

    // Log the error
    await bookRepository.logRenewal({
      charge_id: 'SYSTEM',
      action: 'workflow_error',
      status: 'failure',
      message: errorMessage,
    });

    throw error;
  }
}

/**
 * Daily note broadcast handler (Telegram)
 */
async function handleNoteBroadcast(env: Env): Promise<void> {
  console.log(
    `[NoteBroadcast] Starting daily note broadcast at ${new Date().toISOString()}`,
  );

  try {
    const sent = await broadcastDailyNote(env);
    if (sent) {
      console.log('[NoteBroadcast] Sent one note to Telegram');
    } else {
      console.log(
        '[NoteBroadcast] No note sent (missing creds, no notes, or failure)',
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[NoteBroadcast] Broadcast failed: ${message}`);
  }
}
