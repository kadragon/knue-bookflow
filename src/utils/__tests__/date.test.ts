/**
 * Date utility tests
 * Trace: spec_id: SPEC-renewal-001, task_id: TASK-009, TASK-015
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  daysBetween,
  formatDate,
  getTodayString,
  isToday,
  isWithinDays,
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
});
