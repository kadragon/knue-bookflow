/**
 * Renewal service tests
 * Trace: spec_id: SPEC-renewal-001, task_id: TASK-009, TASK-012
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Charge, RenewalResult } from '../../types';
import type { BookRepository } from '../book-repository';
import {
  checkAndRenewBooks,
  identifyRenewalCandidates,
  logRenewalResults,
  processRenewals,
  type RenewalConfig,
} from '../renewal-service';

// Mock charge factory
function createMockCharge(
  overrides: Partial<{
    id: number;
    renewCnt: number;
    chargeDate: string;
    dueDate: string;
    title: string;
  }>,
): Charge {
  return {
    id: overrides.id ?? 1,
    barcode: '123456',
    biblio: {
      id: 1,
      titleStatement: overrides.title ?? 'Test Book',
      isbn: '9781234567890',
      thumbnail: null,
    },
    branch: {
      id: 1,
      name: 'Test Library',
      alias: 'Test',
      libraryCode: '123456',
      sortOrder: 1,
    },
    callNo: '000.00',
    chargeDate: overrides.chargeDate ?? '2025-01-01',
    dueDate: overrides.dueDate ?? '2025-01-15',
    overdueDays: 0,
    renewCnt: overrides.renewCnt ?? 0,
    holdCnt: 0,
    isMediaCharge: false,
    supplementNote: null,
    isRenewed: false,
    isRenewable: true,
  };
}

describe('renewal service', () => {
  describe('logRenewalResults', () => {
    // Trace: spec_id: SPEC-backend-refactor-001, task_id: TASK-078
    it('logs each renewal result using the repository', async () => {
      const results: RenewalResult[] = [
        {
          chargeId: 1,
          title: 'First',
          success: true,
          newDueDate: '2025-01-20',
          newRenewCount: 1,
        },
        {
          chargeId: 2,
          title: 'Second',
          success: false,
          errorMessage: 'Denied',
        },
      ];

      const mockRepository = {
        logRenewal: vi.fn().mockResolvedValue(undefined),
        db: undefined,
        saveBook: vi.fn(),
        updateReadStatus: vi.fn(),
        findByChargeId: vi.fn(),
        findByIsbn: vi.fn(),
        findMostRecentByIsbn: vi.fn(),
        findAllUnread: vi.fn(),
      };

      await logRenewalResults(
        mockRepository as unknown as BookRepository,
        results,
      );

      expect(mockRepository.logRenewal).toHaveBeenCalledTimes(2);
      expect(mockRepository.logRenewal).toHaveBeenCalledWith({
        charge_id: '1',
        action: 'renewal_attempt',
        status: 'success',
        message: 'Renewed until 2025-01-20',
      });
      expect(mockRepository.logRenewal).toHaveBeenCalledWith({
        charge_id: '2',
        action: 'renewal_attempt',
        status: 'failure',
        message: 'Denied',
      });
    });
  });

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

  describe('processRenewals', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-13'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should update charge dueDate and renewCnt after successful renewal', async () => {
      const charges = [
        createMockCharge({ id: 1, dueDate: '2025-01-15', renewCnt: 0 }),
      ];
      const candidates = identifyRenewalCandidates(charges);

      const mockClient = {
        renewCharge: vi.fn().mockResolvedValue({
          success: true,
          code: 'success',
          message: 'ok',
          data: {
            id: 1,
            renewCnt: 1,
            dueDate: '2025-01-22',
          },
        }),
      } as unknown as Parameters<typeof processRenewals>[0];

      const results = await processRenewals(mockClient, candidates);

      expect(results[0].newDueDate).toBe('2025-01-22');
      expect(results[0].newRenewCount).toBe(1);
      expect(charges[0].dueDate).toBe('2025-01-22');
      expect(charges[0].renewCnt).toBe(1);
    });
  });

  describe('checkAndRenewBooks', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-13'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should not fetch charges when provided', async () => {
      const charges = [
        createMockCharge({ id: 1, dueDate: '2025-01-15', renewCnt: 0 }),
      ];

      const mockClient = {
        getCharges: vi.fn(),
        renewCharge: vi.fn().mockResolvedValue({
          success: true,
          code: 'success',
          message: 'ok',
          data: {
            id: 1,
            renewCnt: 1,
            dueDate: '2025-01-22',
          },
        }),
      } as unknown as Parameters<typeof processRenewals>[0];

      await checkAndRenewBooks(
        mockClient as Parameters<typeof checkAndRenewBooks>[0],
        charges,
      );

      expect(mockClient.getCharges).not.toHaveBeenCalled();
      expect(charges[0].dueDate).toBe('2025-01-22');
      expect(charges[0].renewCnt).toBe(1);
    });
  });
});
