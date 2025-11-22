/**
 * KNUE BookFlow - Cloudflare Worker Entry Point
 * Automatic book renewal system for Korea National University of Education library
 *
 * Trace: task_id: TASK-001, TASK-007, TASK-012, TASK-016
 */

import {
  checkAndRenewBooks,
  createAladinClient,
  createBookRecord,
  createBookRepository,
  createLibraryClient,
  fetchNewBooksInfo,
  identifyNewBooks,
  type RenewalResult,
} from './services';
import type { Env } from './types';

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
    ctx.waitUntil(handleScheduledTask(env, event));
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

    // Manual trigger endpoint (access controlled via Zero Trust)
    if (url.pathname === '/trigger' && request.method === 'POST') {
      ctx.waitUntil(handleScheduledTask(env));
      return new Response(JSON.stringify({ message: 'Task triggered' }), {
        headers: { 'Content-Type': 'application/json' },
      });
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

    // Step 5: Detect new books
    console.log('[BookFlow] Step 5: Detecting new books...');
    const newBooks = identifyNewBooks(charges);

    // Step 6: Fetch book info from Aladin
    console.log('[BookFlow] Step 6: Fetching book info from Aladin...');
    const newBooksWithInfo = await fetchNewBooksInfo(aladinClient, newBooks);

    // Step 7: Save/update records in D1
    console.log('[BookFlow] Step 7: Saving records to database...');

    // Save new books with enriched data
    for (const { charge, bookInfo } of newBooksWithInfo) {
      const record = createBookRecord(charge, bookInfo);
      await bookRepository.saveBook(record);
    }

    // Update existing books with latest charge data (due dates, renew counts)
    const existingBooks = charges.filter(
      (charge) => !newBooks.some((nb) => nb.id === charge.id),
    );

    for (const charge of existingBooks) {
      const existing = await bookRepository.findByChargeId(String(charge.id));
      if (existing) {
        // Update only if there are changes
        if (
          existing.due_date !== charge.dueDate ||
          existing.renew_count !== charge.renewCnt
        ) {
          const record = createBookRecord(charge);
          record.publisher = existing.publisher;
          record.cover_url = existing.cover_url;
          record.description = existing.description;
          await bookRepository.saveBook(record);
        }
      }
    }

    // Step 8: Log summary
    const duration = Date.now() - startTime;
    const successCount = renewalResults.filter((r) => r.success).length;
    const failCount = renewalResults.filter((r) => !r.success).length;

    console.log('[BookFlow] === Task Summary ===');
    console.log(`[BookFlow] Total charges: ${charges.length}`);
    console.log(`[BookFlow] New books saved: ${newBooks.length}`);
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
