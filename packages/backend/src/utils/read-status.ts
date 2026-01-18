/**
 * Read Status Utilities
 * Centralized mapping between ReadStatus enum and database values
 *
 * Trace: spec_id: SPEC-frontend-001, task_id: TASK-read-status-utils
 */

import type { ReadStatus } from '../types';

const READ_STATUS_TO_DB: Record<ReadStatus, number> = {
  unread: 0,
  finished: 1,
  abandoned: 2,
};

const DB_TO_READ_STATUS: Record<number, ReadStatus> = {
  0: 'unread',
  1: 'finished',
  2: 'abandoned',
};

/**
 * Convert a database numeric value to ReadStatus enum
 * @param value - Database numeric value (0, 1, or 2)
 * @returns ReadStatus enum value
 */
export function toReadStatus(value?: number | null): ReadStatus {
  return DB_TO_READ_STATUS[value ?? 0] ?? 'unread';
}

/**
 * Convert ReadStatus enum to database numeric value
 * @param status - ReadStatus enum value
 * @returns Database numeric value
 */
export function fromReadStatus(status: ReadStatus): number {
  return READ_STATUS_TO_DB[status];
}

/**
 * Type guard to check if a value is a valid ReadStatus
 * @param value - Value to check
 * @returns true if value is a valid ReadStatus
 */
export function isReadStatus(value: unknown): value is ReadStatus {
  return value === 'unread' || value === 'finished' || value === 'abandoned';
}
