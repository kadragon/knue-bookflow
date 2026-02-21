/**
 * Date utility tests
 * Trace: spec_id: SPEC-renewal-001, task_id: TASK-009, TASK-015, TASK-082, TASK-083
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  daysBetween,
  daysFromToday,
  formatDate,
  getTodayString,
  isDueWithinRange,
  isToday,
  isWithinDays,
  normalizeDateString,
} from '../date';

describe('date utilities', () => {
  describe('daysBetween', () => {
    it('should return 0 for same date', () => {
      const date = new Date('2025-01-15');
      expect(daysBetween(date, date)).toBe(0);
    });

    it('should return positive number for future date', () => {
      const date1 = new Date('2025-01-15');
      const date2 = new Date('2025-01-20');
      expect(daysBetween(date1, date2)).toBe(5);
    });

    it('should return negative number for past date', () => {
      const date1 = new Date('2025-01-20');
      const date2 = new Date('2025-01-15');
      expect(daysBetween(date1, date2)).toBe(-5);
    });
  });

  describe('isWithinDays', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-15T14:30:00Z')); // 23:30 KST
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return true when date is within threshold', () => {
      expect(isWithinDays('2025-01-17', 2)).toBe(true); // 2 days away (KST)
      expect(isWithinDays('2025-01-16', 2)).toBe(true); // 1 day away
      expect(isWithinDays('2025-01-15', 2)).toBe(true); // today
    });

    it('should return false when date is beyond threshold', () => {
      expect(isWithinDays('2025-01-18', 2)).toBe(false); // 3 days away
      expect(isWithinDays('2025-01-20', 2)).toBe(false); // 5 days away
    });

    it('should return false for past dates', () => {
      expect(isWithinDays('2025-01-14', 2)).toBe(false); // yesterday
    });
  });

  describe('isDueWithinRange', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-15T14:30:00Z')); // 23:30 KST
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return true when date is within [0, maxDays]', () => {
      expect(isDueWithinRange('2025-01-17', 2)).toBe(true); // 2 days away
      expect(isDueWithinRange('2025-01-15', 2)).toBe(true); // today
    });

    it('should return false when date is beyond maxDays', () => {
      expect(isDueWithinRange('2025-01-18', 2)).toBe(false); // 3 days away
    });

    it('should return false for past dates when minDays=0 (default)', () => {
      expect(isDueWithinRange('2025-01-14', 2)).toBe(false); // yesterday
    });

    it('should include past dates when minDays is negative', () => {
      expect(isDueWithinRange('2025-01-14', 2, -1)).toBe(true); // 1 day ago
    });

    it('should exclude dates more overdue than minDays', () => {
      expect(isDueWithinRange('2025-01-13', 2, -1)).toBe(false); // 2 days ago, minDays=-1
    });
  });

  describe('daysFromToday', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-15T14:30:00Z')); // 23:30 KST = 2025-01-15 KST
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return 0 for today', () => {
      expect(daysFromToday('2025-01-15')).toBe(0);
    });

    it('should return positive for future dates', () => {
      expect(daysFromToday('2025-01-17')).toBe(2);
    });

    it('should return negative for past dates', () => {
      expect(daysFromToday('2025-01-14')).toBe(-1);
    });
  });

  describe('isToday', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-15T14:30:00Z')); // 23:30 KST
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return true for today', () => {
      expect(isToday('2025-01-15')).toBe(true);
    });

    it('should return false for other dates', () => {
      expect(isToday('2025-01-14')).toBe(false);
      expect(isToday('2025-01-16')).toBe(false);
    });
  });

  describe('formatDate', () => {
    it('should format date as YYYY-MM-DD', () => {
      const date = new Date('2025-01-15T12:30:00Z');
      expect(formatDate(date)).toBe('2025-01-15');
    });
  });

  describe('getTodayString', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-15T15:30:00Z')); // 00:30 KST next day
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return today as YYYY-MM-DD', () => {
      expect(getTodayString()).toBe('2025-01-16');
    });
  });

  describe('normalizeDateString', () => {
    it('should keep YYYY-MM-DD as-is', () => {
      expect(normalizeDateString('2025-12-31')).toBe('2025-12-31');
    });

    it('should normalize timestamp with space separator', () => {
      expect(normalizeDateString('2025-12-31 00:00:00')).toBe('2025-12-31');
    });

    it('should normalize ISO timestamp', () => {
      expect(normalizeDateString('2025-12-31T00:00:00Z')).toBe('2025-12-31');
    });

    it('should return original string when not matching', () => {
      expect(normalizeDateString('')).toBe('');
      expect(normalizeDateString('invalid')).toBe('invalid');
    });

    it('should return empty string for nullish values', () => {
      expect(normalizeDateString(null)).toBe('');
      expect(normalizeDateString(undefined)).toBe('');
    });
  });
});
