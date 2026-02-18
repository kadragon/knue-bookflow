/**
 * Book Renewal Service
 * Determines which books are eligible for renewal and processes them
 *
 * Trace: spec_id: SPEC-renewal-001, SPEC-backend-refactor-001, task_id: TASK-004, TASK-012, TASK-079
 */

import type {
  Charge,
  RenewalCandidate,
  RenewalConfig,
  RenewalResult,
} from '../types';
import {
  DEFAULT_RENEWAL_DAYS_BEFORE_DUE,
  DEFAULT_RENEWAL_MAX_COUNT,
  isWithinDays,
} from '../utils';
import type { BookRepository } from './book-repository';
import { LibraryApiError, type LibraryClient } from './library-client';

export type { RenewalCandidate, RenewalConfig, RenewalResult };

const DEFAULT_CONFIG: RenewalConfig = {
  maxRenewCount: DEFAULT_RENEWAL_MAX_COUNT,
  daysBeforeDue: DEFAULT_RENEWAL_DAYS_BEFORE_DUE,
};

function isRenewCountEligible(
  renewCnt: number,
  maxRenewCount: number,
): boolean {
  return renewCnt >= DEFAULT_RENEWAL_MAX_COUNT && renewCnt <= maxRenewCount;
}

/**
 * Identify books eligible for renewal based on criteria
 * @param charges - List of current charges
 * @param config - Renewal configuration
 * @returns Array of renewal candidates
 */
export function identifyRenewalCandidates(
  charges: Charge[],
  config: RenewalConfig = DEFAULT_CONFIG,
  offsetMinutes?: number,
): RenewalCandidate[] {
  const candidates: RenewalCandidate[] = [];

  for (const charge of charges) {
    if (!isRenewCountEligible(charge.renewCnt, config.maxRenewCount)) {
      continue;
    }

    // Check if due date is within threshold
    if (!isWithinDays(charge.dueDate, config.daysBeforeDue, offsetMinutes)) {
      continue;
    }

    candidates.push({
      charge,
      reason: `Due in ${config.daysBeforeDue} days or less, renewCnt=${charge.renewCnt}`,
    });
  }

  console.log(
    `[RenewalService] Identified ${candidates.length} renewal candidates`,
  );
  return candidates;
}

/**
 * Process renewals for identified candidates
 * @param client - Authenticated library client
 * @param candidates - Books to renew
 * @returns Array of renewal results
 */
export async function processRenewals(
  client: LibraryClient,
  candidates: RenewalCandidate[],
): Promise<RenewalResult[]> {
  const results: RenewalResult[] = [];

  for (const candidate of candidates) {
    const { charge } = candidate;
    const title = charge.biblio.titleStatement;

    try {
      const response = await client.renewCharge(charge.id);

      // Mutate the original charge so downstream persistence uses fresh data
      charge.dueDate = response.data.dueDate;
      charge.renewCnt = response.data.renewCnt;

      results.push({
        chargeId: charge.id,
        title,
        success: true,
        newDueDate: response.data.dueDate,
        newRenewCount: response.data.renewCnt,
      });

      console.log(`[RenewalService] Successfully renewed: ${title}`);
    } catch (error) {
      const errorMessage =
        error instanceof LibraryApiError ? error.message : 'Unknown error';

      results.push({
        chargeId: charge.id,
        title,
        success: false,
        errorMessage,
      });

      console.error(
        `[RenewalService] Failed to renew "${title}": ${errorMessage}`,
      );
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  console.log(
    `[RenewalService] Completed: ${successCount} success, ${failCount} failed`,
  );

  return results;
}

/**
 * Persist renewal results to the repository.
 */
export async function logRenewalResults(
  bookRepository: BookRepository,
  results: RenewalResult[],
): Promise<void> {
  // Trace: spec_id: SPEC-backend-refactor-001, task_id: TASK-078
  for (const result of results) {
    await bookRepository.logRenewal({
      charge_id: String(result.chargeId),
      action: 'renewal_attempt',
      status: result.success ? 'success' : 'failure',
      message: result.success
        ? `Renewed until ${result.newDueDate}`
        : result.errorMessage || 'Unknown error',
    });
  }
}

/**
 * Main function to check and process renewals
 * @param client - Authenticated library client
 * @param config - Optional renewal configuration
 * @returns Renewal results
 */
export async function checkAndRenewBooks(
  client: LibraryClient,
  charges?: Charge[],
  config?: RenewalConfig,
  offsetMinutes?: number,
): Promise<RenewalResult[]> {
  // Use provided charges to avoid duplicate fetches
  const currentCharges = charges ?? (await client.getCharges());

  if (currentCharges.length === 0) {
    console.log('[RenewalService] No borrowed books found');
    return [];
  }

  // Identify candidates
  const candidates = identifyRenewalCandidates(
    currentCharges,
    config,
    offsetMinutes,
  );

  if (candidates.length === 0) {
    console.log('[RenewalService] No books eligible for renewal');
    return [];
  }

  // Process renewals
  return processRenewals(client, candidates);
}
