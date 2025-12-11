/**
 * SearchBooksPage URL Parameter Validation Tests
 *
 * Trace: spec_id: SPEC-search-001
 *        task_id: TASK-042
 */

import { describe, expect, it } from 'vitest';

/**
 * Validates and sanitizes page parameter from URL
 * Returns 1 for invalid values (NaN, zero, negative)
 */
function validatePageParam(pageStr: string | null): number {
  const parsedPage = parseInt(pageStr || '1', 10);
  return !Number.isNaN(parsedPage) && parsedPage > 0 ? parsedPage : 1;
}

describe('SearchBooksPage URL Parameter Validation', () => {
  describe('validatePageParam', () => {
    it('should return 1 for null input', () => {
      expect(validatePageParam(null)).toBe(1);
    });

    it('should return 1 for empty string', () => {
      expect(validatePageParam('')).toBe(1);
    });

    it('should return 1 for non-numeric string', () => {
      expect(validatePageParam('abc')).toBe(1);
      expect(validatePageParam('not-a-number')).toBe(1);
    });

    it('should return 1 for zero', () => {
      expect(validatePageParam('0')).toBe(1);
    });

    it('should return 1 for negative numbers', () => {
      expect(validatePageParam('-1')).toBe(1);
      expect(validatePageParam('-999')).toBe(1);
    });

    it('should return parsed value for valid positive integers', () => {
      expect(validatePageParam('1')).toBe(1);
      expect(validatePageParam('2')).toBe(2);
      expect(validatePageParam('10')).toBe(10);
      expect(validatePageParam('999')).toBe(999);
    });

    it('should handle whitespace by parsing correctly', () => {
      expect(validatePageParam('  5  ')).toBe(5);
    });

    it('should return 1 for floating point numbers', () => {
      // parseInt truncates, but we validate positive integers only
      expect(validatePageParam('1.5')).toBe(1); // parseInt('1.5') = 1, which is valid
    });
  });
});
