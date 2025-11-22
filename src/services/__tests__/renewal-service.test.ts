/**
 * Renewal service tests
 * Trace: spec_id: SPEC-renewal-001, task_id: TASK-009
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { identifyRenewalCandidates, RenewalConfig } from '../renewal-service';
import { Charge } from '../../types';

// Mock charge factory
function createMockCharge(overrides: Partial<{
  id: number;
  renewCnt: number;
  chargeDate: string;
  dueDate: string;
  title: string;
}>): Charge {
  return {
    id: overrides.id ?? 1,
    renewCnt: overrides.renewCnt ?? 0,
    chargeDate: overrides.chargeDate ?? '2025-01-01',
    dueDate: overrides.dueDate ?? '2025-01-15',
    volume: {
      id: 1,
      barcode: '123456',
      shelfLocCode: 'A1',
      callNo: '000.00',
      bib: {
        id: 1,
        title: overrides.title ?? 'Test Book',
        author: 'Test Author',
        isbn: '9781234567890',
      },
    },
  };
}

describe('renewal service', () => {
  describe('identifyRenewalCandidates', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-13')); // 2 days before default due date
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should identify books due within threshold with no renewals', () => {
      const charges = [
        createMockCharge({ id: 1, dueDate: '2025-01-15', renewCnt: 0 }), // 2 days - eligible
        createMockCharge({ id: 2, dueDate: '2025-01-14', renewCnt: 0 }), // 1 day - eligible
      ];

      const candidates = identifyRenewalCandidates(charges);

      expect(candidates).toHaveLength(2);
      expect(candidates[0].charge.id).toBe(1);
      expect(candidates[1].charge.id).toBe(2);
    });

    it('should skip books already renewed', () => {
      const charges = [
        createMockCharge({ id: 1, dueDate: '2025-01-15', renewCnt: 1 }), // already renewed
        createMockCharge({ id: 2, dueDate: '2025-01-15', renewCnt: 0 }), // eligible
      ];

      const candidates = identifyRenewalCandidates(charges);

      expect(candidates).toHaveLength(1);
      expect(candidates[0].charge.id).toBe(2);
    });

    it('should skip books with due date beyond threshold', () => {
      const charges = [
        createMockCharge({ id: 1, dueDate: '2025-01-20', renewCnt: 0 }), // 7 days away
        createMockCharge({ id: 2, dueDate: '2025-01-15', renewCnt: 0 }), // 2 days - eligible
      ];

      const candidates = identifyRenewalCandidates(charges);

      expect(candidates).toHaveLength(1);
      expect(candidates[0].charge.id).toBe(2);
    });

    it('should use custom config', () => {
      const charges = [
        createMockCharge({ id: 1, dueDate: '2025-01-15', renewCnt: 1 }), // 1 renewal
        createMockCharge({ id: 2, dueDate: '2025-01-18', renewCnt: 0 }), // 5 days away
      ];

      const config: RenewalConfig = {
        maxRenewCount: 1, // Allow up to 1 renewal
        daysBeforeDue: 5, // 5 days threshold
      };

      const candidates = identifyRenewalCandidates(charges, config);

      expect(candidates).toHaveLength(2);
    });

    it('should return empty array when no eligible books', () => {
      const charges = [
        createMockCharge({ id: 1, dueDate: '2025-01-20', renewCnt: 0 }), // too far
        createMockCharge({ id: 2, dueDate: '2025-01-15', renewCnt: 1 }), // already renewed
      ];

      const candidates = identifyRenewalCandidates(charges);

      expect(candidates).toHaveLength(0);
    });

    it('should include reason in candidate', () => {
      const charges = [
        createMockCharge({ id: 1, dueDate: '2025-01-15', renewCnt: 0 }),
      ];

      const candidates = identifyRenewalCandidates(charges);

      expect(candidates[0].reason).toContain('renewCnt=0');
    });
  });
});
