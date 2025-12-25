/**
 * Constants tests
 * Trace: spec_id: SPEC-backend-refactor-001, task_id: TASK-079
 */

import { describe, expect, it } from 'vitest';
import {
  ALADIN_CACHE_TTL_MS,
  ALADIN_LOOKUP_CONCURRENCY,
  ALADIN_LOOKUP_TIMEOUT_MS,
  AVAILABILITY_TTL_MS,
  DAY_MS,
  DEFAULT_RENEWAL_DAYS_BEFORE_DUE,
  DEFAULT_RENEWAL_MAX_COUNT,
  DUE_SOON_DAYS,
  KST_OFFSET_MINUTES,
  MAX_AVAILABILITY_CACHE_SIZE,
} from '../constants';

describe('shared constants', () => {
  it('defines core date/time constants', () => {
    expect(KST_OFFSET_MINUTES).toBe(9 * 60);
    expect(DAY_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('defines renewal defaults and due-soon threshold', () => {
    expect(DEFAULT_RENEWAL_MAX_COUNT).toBe(0);
    expect(DEFAULT_RENEWAL_DAYS_BEFORE_DUE).toBe(2);
    expect(DUE_SOON_DAYS).toBe(3);
  });

  it('defines Aladin and availability constants', () => {
    expect(ALADIN_LOOKUP_TIMEOUT_MS).toBe(3000);
    expect(ALADIN_LOOKUP_CONCURRENCY).toBe(10);
    expect(ALADIN_CACHE_TTL_MS).toBe(60 * 60 * 1000);
    expect(AVAILABILITY_TTL_MS).toBe(5 * 60 * 1000);
    expect(MAX_AVAILABILITY_CACHE_SIZE).toBe(500);
  });
});
