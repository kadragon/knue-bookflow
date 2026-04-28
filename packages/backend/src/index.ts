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
import {
  handleGetCronRuns,
  handleGetLatestCronRuns,
} from './handlers/cron-runs-handler';
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
import { handleSyncBooks, syncBooksCore } from './handlers/sync-handler';
import {
  createTelegramWebhookDeps,
  handleTelegramWebhook,
} from './handlers/telegram-webhook-handler';
import {
  broadcastDailyNote,
  broadcastDueSoonBooks,
  checkAndRenewBooks,
  createAladinClient,
  createBookRepository,
  createCronRunRepository,
  createLibraryClient,
  type ICronRunRepository,
  logRenewalResults,
  NOTE_BROADCAST_CRON,
  type RenewalConfig,
} from './services';
import type {
  CreateNoteRequest,
  CronPhase,
  Env,
  UpdateNoteRequest,
} from './types';
import {
  DEFAULT_RENEWAL_DAYS_BEFORE_DUE,
  DEFAULT_RENEWAL_MAX_COUNT,
} from './utils';

type PhaseResult = {
  status: 'success' | 'failure' | 'skipped';
  detail: string | null;
};

async function runPhase(
  repo: ICronRunRepository,
  phase: CronPhase,
  cronExpr: string,
  fn: () => Promise<PhaseResult>,
): Promise<PhaseResult> {
  const startedAt = new Date().toISOString();
  const startTs = Date.now();
  let result: PhaseResult;
  try {
    result = await fn();
  } catch (e) {
    result = {
      status: 'failure',
      detail: e instanceof Error ? e.message : String(e),
    };
  }
  const finishedAt = new Date().toISOString();
  try {
    await repo.record({
      phase,
      status: result.status,
      started_at: startedAt,
      finished_at: finishedAt,
      duration_ms: Date.now() - startTs,
      detail: result.detail,
      cron_expr: cronExpr,
    });
  } catch (err) {
    console.error(`[CronObs] record failed phase=${phase}:`, err);
  }
  return result;
}

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
      const repo = createCronRunRepository(env.DB as D1Database);
      ctx.waitUntil(
        runPhase(repo, 'note_broadcast', event.cron, () =>
          handleNoteBroadcast(env),
        ),
      );
      ctx.waitUntil(handleRenewalThenNotify(repo, event.cron, env));
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

    if (url.pathname === '/api/cron-runs/latest' && request.method === 'GET') {
      return handleGetLatestCronRuns(env);
    }

    if (url.pathname === '/api/cron-runs' && request.method === 'GET') {
      return handleGetCronRuns(env, request);
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
      const repo = createCronRunRepository(env.DB as D1Database);
      ctx.waitUntil(
        (async () => {
          await runPhase(repo, 'renewal', 'manual', () =>
            handleScheduledRenewal(env),
          );
          await runPhase(repo, 'sync', 'manual', () =>
            handleScheduledSync(env),
          );
        })(),
      );
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
 * Daily note broadcast handler (Telegram)
 */
async function handleNoteBroadcast(env: Env): Promise<PhaseResult> {
  console.log(
    `[NoteBroadcast] Starting daily note broadcast at ${new Date().toISOString()}`,
  );

  try {
    const sent = await broadcastDailyNote(env);
    if (sent) {
      console.log('[NoteBroadcast] Sent one note to Telegram');
      return { status: 'success', detail: 'sent one note' };
    }
    console.log(
      '[NoteBroadcast] No note sent (missing creds, no notes, or failure)',
    );
    return { status: 'skipped', detail: 'no note sent' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[NoteBroadcast] Broadcast failed: ${message}`);
    return { status: 'failure', detail: message };
  }
}

/**
 * Sequential handler: renewal → sync → due-soon notification
 * Ensures renewed due dates are reflected before sending due-soon alerts.
 */
async function handleRenewalThenNotify(
  repo: ICronRunRepository,
  cronExpr: string,
  env: Env,
): Promise<void> {
  await runPhase(repo, 'renewal', cronExpr, () => handleScheduledRenewal(env));
  await runPhase(repo, 'sync', cronExpr, () => handleScheduledSync(env));
  await runPhase(repo, 'due_soon_broadcast', cronExpr, () =>
    handleDueSoonBroadcast(env),
  );
}

/**
 * Due-soon books broadcast handler (Telegram)
 */
async function handleDueSoonBroadcast(env: Env): Promise<PhaseResult> {
  console.log(
    `[DueSoonBroadcast] Starting due-soon broadcast at ${new Date().toISOString()}`,
  );

  try {
    const sent = await broadcastDueSoonBooks(env);
    if (sent) {
      console.log('[DueSoonBroadcast] Sent due-soon message to Telegram');
      return { status: 'success', detail: 'sent due-soon message' };
    }
    console.log(
      '[DueSoonBroadcast] No due-soon message sent (no books due soon or missing creds)',
    );
    return { status: 'skipped', detail: 'no due-soon books' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[DueSoonBroadcast] Broadcast failed: ${message}`);
    return { status: 'failure', detail: message };
  }
}

/**
 * Scheduled sync handler - syncs books from library to DB
 */
async function handleScheduledSync(env: Env): Promise<PhaseResult> {
  console.log(
    `[ScheduledSync] Starting scheduled sync at ${new Date().toISOString()}`,
  );

  try {
    const summary = await syncBooksCore(env);
    const detail = `added=${summary.added} updated=${summary.updated} unchanged=${summary.unchanged} returned=${summary.returned}`;
    console.log(
      `[ScheduledSync] Summary total=${summary.total_charges} ${detail}`,
    );
    return { status: 'success', detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ScheduledSync] Sync failed:', error);
    await sendScheduledSyncAlert(env, error);
    return { status: 'failure', detail: message };
  }
}

/**
 * Scheduled renewal handler - checks for overdue/due-soon books and renews them
 */
async function handleScheduledRenewal(env: Env): Promise<PhaseResult> {
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
    const detail = `renewed=${successCount} failed=${failCount}`;
    console.log(`[ScheduledRenewal] Completed: ${detail}`);
    const status =
      results.length === 0 ? 'skipped' : failCount > 0 ? 'failure' : 'success';
    return { status, detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ScheduledRenewal] Failed: ${message}`);
    return { status: 'failure', detail: message };
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
