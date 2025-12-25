/**
 * Shared constants
 * Trace: spec_id: SPEC-backend-refactor-001, task_id: TASK-079
 */

export const KST_OFFSET_MINUTES = 9 * 60; // UTC+9
export const DAY_MS = 24 * 60 * 60 * 1000;

export const DUE_SOON_DAYS = 3;

export const DEFAULT_RENEWAL_MAX_COUNT = 0;
export const DEFAULT_RENEWAL_DAYS_BEFORE_DUE = 2;

export const ALADIN_LOOKUP_TIMEOUT_MS = 3000;
export const ALADIN_LOOKUP_CONCURRENCY = 10;
export const ALADIN_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export const AVAILABILITY_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_AVAILABILITY_CACHE_SIZE = 500;
