import { describe, expect, it } from 'vitest';
import type { DueStatus } from './api';
import {
  formatDdayLabel,
  getLoanStatusChip,
  shouldShowDdayChip,
} from './loanStatusPresentation';

describe('loanStatusPresentation', () => {
  describe('getLoanStatusChip', () => {
    const activeLoanCases: [
      DueStatus,
      { label: string; color: 'error' | 'warning' | 'success' },
    ][] = [
      ['overdue', { label: '연체', color: 'error' }],
      ['due_soon', { label: '반납 임박', color: 'warning' }],
      ['ok', { label: '대출 중', color: 'success' }],
    ];

    it.each(
      activeLoanCases,
    )('returns correct chip for active loan with due status: %s', (dueStatus, expected) => {
      expect(getLoanStatusChip('on_loan', dueStatus)).toEqual(expected);
    });

    const allDueStatuses: DueStatus[] = ['overdue', 'due_soon', 'ok'];
    it.each(
      allDueStatuses,
    )('returns returned chip regardless of due status: %s', (dueStatus) => {
      expect(getLoanStatusChip('returned', dueStatus)).toEqual({
        label: '반납 완료',
        color: 'default',
      });
    });
  });

  it('shows D-day chip only for active loans', () => {
    expect(shouldShowDdayChip('on_loan')).toBe(true);
    expect(shouldShowDdayChip('returned')).toBe(false);
  });

  it.each([
    [3, 'D-3'],
    [0, 'D-0'],
    [-2, 'D+2'],
  ])('formats %i days left as %s', (daysLeft, expected) => {
    expect(formatDdayLabel(daysLeft)).toBe(expected);
  });
});
