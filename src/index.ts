/**
 * KNUE BookFlow - Cloudflare Worker Entry Point
 * Automatic book renewal system for Korea National University of Education library
 *
 * Trace: task_id: TASK-001, TASK-007, TASK-012, TASK-016, TASK-023
 */

import {
  handleBooksApi,
  handleGetBook,
  handleUpdateReadStatus,
} from './handlers/books-handler';
import {
  handleCreateNote,
  handleDeleteNote,
  handleGetNotes,
  handleUpdateNote,
} from './handlers/notes-handler';
import { handleSyncBooks, processCharge } from './handlers/sync-handler';
import {
  broadcastDailyNote,
  checkAndRenewBooks,
  createAladinClient,
  createBookRepository,
  createLibraryClient,
  NOTE_BROADCAST_CRON,
  type RenewalResult,
} from './services';
import type { CreateNoteRequest, Env, UpdateNoteRequest } from './types';

const RENEWAL_CRON = '0 10 * * *';

export default {
  /**
   * Cron Trigger Handler - Executes daily at scheduled time
   * Performs the complete book renewal workflow
   */
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    if (event.cron === NOTE_BROADCAST_CRON) {
      ctx.waitUntil(handleNoteBroadcast(env));
    } else {
      if (event.cron && event.cron !== RENEWAL_CRON) {
        console.warn(
          `[BookFlow] Unknown cron '${event.cron}', running renewal workflow by default`,
        );
      }
      // Handles renewal cron, manual triggers, and unknown crons as a fallback.
      ctx.waitUntil(handleScheduledTask(env, event));
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
      ctx.waitUntil(handleScheduledTask(env));
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
 * Main workflow handler for scheduled task
 * Orchestrates the complete book renewal process
 */
async function handleScheduledTask(
  env: Env,
  _event?: ScheduledEvent,
): Promise<void> {
  const startTime = Date.now();
  console.log(
    `[BookFlow] Starting scheduled task at ${new Date().toISOString()}`,
  );

  // Initialize services
  const libraryClient = createLibraryClient();
  const aladinClient = createAladinClient(env.ALADIN_API_KEY);
  const bookRepository = createBookRepository(env.DB);

  let renewalResults: RenewalResult[] = [];

  try {
    // Step 1: Authenticate with library API
    console.log('[BookFlow] Step 1: Authenticating...');
    await libraryClient.login({
      loginId: env.LIBRARY_USER_ID,
      password: env.LIBRARY_PASSWORD,
    });

    // Step 2: Fetch current charges
    console.log('[BookFlow] Step 2: Fetching charges...');
    const charges = await libraryClient.getCharges();

    if (charges.length === 0) {
      console.log('[BookFlow] No borrowed books found. Task complete.');
      return;
    }

    // Step 3-4: Check and process renewals (charges already fetched)
    console.log('[BookFlow] Step 3-4: Processing renewals...');
    renewalResults = await checkAndRenewBooks(libraryClient, charges);

    // Log renewal results to database
    for (const result of renewalResults) {
      await bookRepository.logRenewal({
        charge_id: String(result.chargeId),
        action: 'renewal_attempt',
        status: result.success ? 'success' : 'failure',
        message: result.success
          ? `Renewed until ${result.newDueDate}`
          : result.errorMessage || 'Unknown error',
      });
    }

    // Step 5: Sync all books with database
    console.log('[BookFlow] Step 5: Syncing books with database...');

    const syncStatuses = await Promise.all(
      charges.map((charge) =>
        processCharge(charge, bookRepository, aladinClient),
      ),
    );

    const addedCount = syncStatuses.filter((s) => s === 'added').length;
    const updatedCount = syncStatuses.filter((s) => s === 'updated').length;

    // Step 6: Log summary
    const duration = Date.now() - startTime;
    const successCount = renewalResults.filter((r) => r.success).length;
    const failCount = renewalResults.filter((r) => !r.success).length;

    console.log('[BookFlow] === Task Summary ===');
    console.log(`[BookFlow] Total charges: ${charges.length}`);
    console.log(`[BookFlow] Books added: ${addedCount}`);
    console.log(`[BookFlow] Books updated: ${updatedCount}`);
    console.log(`[BookFlow] Renewals attempted: ${renewalResults.length}`);
    console.log(`[BookFlow] Renewals succeeded: ${successCount}`);
    console.log(`[BookFlow] Renewals failed: ${failCount}`);
    console.log(`[BookFlow] Duration: ${duration}ms`);
    console.log('[BookFlow] Task completed successfully');
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
