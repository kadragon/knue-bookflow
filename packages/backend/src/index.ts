/**
 * KNUE BookFlow - Cloudflare Worker Entry Point
 * Automatic book renewal system for Korea National University of Education library
 *
 * Trace: spec_id: SPEC-backend-refactor-001, task_id: TASK-001, TASK-007, TASK-012, TASK-016, TASK-023, TASK-079, TASK-081
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
  syncBooksCore,
} from './handlers/sync-handler';
import {
  createTelegramWebhookDeps,
  handleTelegramWebhook,
} from './handlers/telegram-webhook-handler';
import {
  broadcastDailyNote,
  checkAndRenewBooks,
  createAladinClient,
  createBookRepository,
  createLibraryClient,
  logRenewalResults,
  NOTE_BROADCAST_CRON,
  type RenewalConfig,
  type RenewalResult,
} from './services';
import type {
  Charge,
  CreateNoteRequest,
  Env,
  UpdateNoteRequest,
} from './types';
import {
  ALADIN_LOOKUP_CONCURRENCY,
  createDebugLogger,
  DEFAULT_RENEWAL_DAYS_BEFORE_DUE,
  DEFAULT_RENEWAL_MAX_COUNT,
  isDebugEnabled,
} from './utils';

export default {
  /**
   * Cron Trigger Handler - Notes broadcast and sync
   */
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    // Trace: spec_id: SPEC-scheduler-001, task_id: TASK-070
    if (event.cron === NOTE_BROADCAST_CRON) {
      ctx.waitUntil(handleNoteBroadcast(env));
      console.log('[ScheduledSync] Triggered by cron; starting scheduled sync');
      ctx.waitUntil(handleScheduledSync(env));
      ctx.waitUntil(handleScheduledRenewal(env));
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

    // Telegram webhook endpoint
    if (url.pathname === '/webhook/telegram' && request.method === 'POST') {
      return handleTelegramWebhook(
        request,
        env,
        createTelegramWebhookDeps(env, env.DB as D1Database),
      );
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
  logDebug(`[BookFlow] Starting workflow run at ${new Date().toISOString()}`);

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

    const { syncStatuses, syncErrors } = await processChargesInBatches(
      charges,
      bookRepository,
      aladinClient,
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

type SyncStatus = Awaited<ReturnType<typeof processCharge>>;

async function processChargesInBatches(
  charges: Charge[],
  bookRepository: ReturnType<typeof createBookRepository>,
  aladinClient: ReturnType<typeof createAladinClient>,
  concurrency = ALADIN_LOOKUP_CONCURRENCY,
): Promise<{ syncStatuses: SyncStatus[]; syncErrors: unknown[] }> {
  // Trace: spec_id: SPEC-backend-refactor-001, task_id: TASK-081
  const batchSize = Math.max(1, concurrency);
  const syncStatuses: SyncStatus[] = [];
  const syncErrors: unknown[] = [];

  for (let i = 0; i < charges.length; i += batchSize) {
    const batch = charges.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((charge) =>
        processCharge(charge, bookRepository, aladinClient),
      ),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        syncStatuses.push(result.value);
      } else {
        syncErrors.push(result.reason);
      }
    }
  }

  return { syncStatuses, syncErrors };
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

/**
 * Scheduled sync handler - syncs books from library to DB
 */
async function handleScheduledSync(env: Env): Promise<void> {
  console.log(
    `[ScheduledSync] Starting scheduled sync at ${new Date().toISOString()}`,
  );

  try {
    const summary = await syncBooksCore(env);
    console.log(
      `[ScheduledSync] Summary total=${summary.total_charges} added=${summary.added} updated=${summary.updated} unchanged=${summary.unchanged} returned=${summary.returned}`,
    );
  } catch (error) {
    console.error('[ScheduledSync] Sync failed:', error);
    await sendScheduledSyncAlert(env, error);
  }
}

/**
 * Scheduled renewal handler - checks for overdue/due-soon books and renews them
 */
async function handleScheduledRenewal(env: Env): Promise<void> {
  console.log(
    `[ScheduledRenewal] Starting scheduled renewal at ${new Date().toISOString()}`,
  );

  try {
    const libraryClient = createLibraryClient();
    await libraryClient.login({
      loginId: env.LIBRARY_USER_ID,
      password: env.LIBRARY_PASSWORD,
    });

    const charges = await libraryClient.getCharges();
    const bookRepository = createBookRepository(env.DB);

    const config: RenewalConfig = {
      maxRenewCount: DEFAULT_RENEWAL_MAX_COUNT,
      daysBeforeDue: DEFAULT_RENEWAL_DAYS_BEFORE_DUE,
      minDaysRemaining: -1,
    };

    const results = await checkAndRenewBooks(libraryClient, charges, config);
    await logRenewalResults(bookRepository, results);

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    console.log(
      `[ScheduledRenewal] Completed: ${successCount} renewed, ${failCount} failed`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ScheduledRenewal] Failed: ${message}`);
  }
}

async function sendScheduledSyncAlert(env: Env, error: unknown): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.warn(
      '[ScheduledSync] Telegram credentials missing; skipping alert',
    );
    return;
  }

  const message =
    error instanceof Error ? error.message : 'Unknown scheduled sync error';
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: `[ScheduledSync] Sync failed: ${message}`,
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      console.error(
        `[ScheduledSync] Telegram alert failed: ${response.status} ${response.statusText} ${details}`,
      );
    }
  } catch (alertError) {
    const alertMessage =
      alertError instanceof Error ? alertError.message : 'Unknown error';
    console.error(`[ScheduledSync] Telegram alert failed: ${alertMessage}`);
  }
}
