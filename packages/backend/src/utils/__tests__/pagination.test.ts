/**
 * Pagination parsing utilities tests
 * Trace: spec_id: SPEC-backend-refactor-001, task_id: TASK-077
 */

import { describe, expect, it } from 'vitest';
import { parsePaginationParams } from '../pagination';

function buildParams(query: string): URLSearchParams {
  const url = new URL(`http://localhost/test?${query}`);
  return url.searchParams;
}

describe('parsePaginationParams', () => {
  it('returns defaults when params are missing', () => {
    const result = parsePaginationParams(buildParams(''), {
      max: { default: 50, min: 1, max: 100, errorMessage: 'Invalid max' },
      offset: { default: 0, min: 0, errorMessage: 'Invalid offset' },
      days: { default: 30, min: 1, max: 365, errorMessage: 'Invalid days' },
    });

    expect('response' in result).toBe(false);
    if ('values' in result) {
      expect(result.values).toEqual({ max: 50, offset: 0, days: 30 });
    }
  });

  it('returns error response when max is invalid', async () => {
    const result = parsePaginationParams(buildParams('max=0'), {
      max: {
        default: 20,
        min: 1,
        max: 100,
        errorMessage: 'Invalid max parameter (1-100)',
      },
      offset: { default: 0, min: 0, errorMessage: 'Invalid offset' },
    });

    expect('response' in result).toBe(true);
    if ('response' in result) {
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toEqual({
        error: 'Invalid max parameter (1-100)',
      });
    }
  });

  it('returns error response when offset is invalid', async () => {
    const result = parsePaginationParams(buildParams('offset=-1'), {
      max: { default: 20, min: 1, max: 100, errorMessage: 'Invalid max' },
      offset: {
        default: 0,
        min: 0,
        errorMessage: 'Invalid offset parameter (>= 0)',
      },
    });

    expect('response' in result).toBe(true);
    if ('response' in result) {
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toEqual({
        error: 'Invalid offset parameter (>= 0)',
      });
    }
  });

  it('returns error response when days is invalid', async () => {
    const result = parsePaginationParams(buildParams('days=400'), {
      days: {
        default: 30,
        min: 1,
        max: 365,
        errorMessage: 'Invalid days parameter (1-365)',
      },
      max: { default: 50, min: 1, max: 100, errorMessage: 'Invalid max' },
      offset: { default: 0, min: 0, errorMessage: 'Invalid offset' },
    });

    expect('response' in result).toBe(true);
    if ('response' in result) {
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toEqual({
        error: 'Invalid days parameter (1-365)',
      });
    }
  });
});
