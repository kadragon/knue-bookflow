import { describe, expect, it } from 'vitest';
import {
  formatDdayLabel,
  getLoanStatusChip,
  shouldShowDdayChip,
} from './loanStatusPresentation';

describe('loanStatusPresentation', () => {
  it('returns overdue chip for active loan', () => {
    expect(getLoanStatusChip('on_loan', 'overdue')).toEqual({
      label: '연체',
      color: 'error',
    });
  });

  it('returns due soon chip for active loan', () => {
    expect(getLoanStatusChip('on_loan', 'due_soon')).toEqual({
      label: '반납 임박',
      color: 'warning',
    });
  });

  it('returns ok chip for active loan', () => {
    expect(getLoanStatusChip('on_loan', 'ok')).toEqual({
      label: '대출 중',
      color: 'success',
    });
  });

  it('returns returned chip regardless of due status', () => {
    expect(getLoanStatusChip('returned', 'overdue')).toEqual({
      label: '반납 완료',
      color: 'default',
    });
    expect(getLoanStatusChip('returned', 'due_soon')).toEqual({
      label: '반납 완료',
      color: 'default',
    });
    expect(getLoanStatusChip('returned', 'ok')).toEqual({
      label: '반납 완료',
      color: 'default',
    });
  });

  it('shows D-day chip only for active loans', () => {
    expect(shouldShowDdayChip('on_loan')).toBe(true);
    expect(shouldShowDdayChip('returned')).toBe(false);
  });

  it('formats D-day label with existing signs', () => {
    expect(formatDdayLabel(3)).toBe('D-3');
    expect(formatDdayLabel(0)).toBe('D-0');
    expect(formatDdayLabel(-2)).toBe('D+2');
  });
});
