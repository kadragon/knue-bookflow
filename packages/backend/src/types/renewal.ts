/**
 * Book renewal service type definitions
 * Trace: spec_id: SPEC-renewal-001, task_id: TASK-008
 */

import type { Charge } from './library';

/**
 * Configuration for renewal criteria
 */
export interface RenewalConfig {
  maxRenewCount: number;
  daysBeforeDue: number;
}

/**
 * A book charge identified as eligible for renewal
 */
export interface RenewalCandidate {
  charge: Charge;
  reason: string;
}

/**
 * Result of a renewal attempt
 */
export interface RenewalResult {
  chargeId: number;
  title: string;
  success: boolean;
  newDueDate?: string;
  newRenewCount?: number;
  errorMessage?: string;
}
