import type { BookSource, DueStatus, LoanState } from './api';

type ActiveLoanChipColor = 'error' | 'warning' | 'success';
export type LoanStatusChipColor = 'default' | 'info' | ActiveLoanChipColor;

const ACTIVE_LOAN_STATUS_LABEL: Record<DueStatus, string> = {
  overdue: '연체',
  due_soon: '반납 임박',
  ok: '대출 중',
};

const ACTIVE_LOAN_STATUS_COLOR: Record<DueStatus, ActiveLoanChipColor> = {
  overdue: 'error',
  due_soon: 'warning',
  ok: 'success',
};

export function getLoanStatusChip(
  loanState: LoanState,
  dueStatus: DueStatus,
  source: BookSource = 'library',
): { label: string; color: LoanStatusChipColor } {
  // A manually registered book has no library loan: no due or return state.
  if (source === 'manual') {
    return {
      label: '직접 등록',
      color: loanState === 'on_loan' ? 'info' : 'default',
    };
  }

  if (loanState === 'returned') {
    return { label: '반납 완료', color: 'default' };
  }

  return {
    label: ACTIVE_LOAN_STATUS_LABEL[dueStatus],
    color: ACTIVE_LOAN_STATUS_COLOR[dueStatus],
  };
}

export function shouldShowDdayChip(
  loanState: LoanState,
  source: BookSource = 'library',
): boolean {
  return loanState === 'on_loan' && source === 'library';
}

export function formatDdayLabel(daysLeft: number): string {
  return `D${daysLeft >= 0 ? '-' : '+'}${Math.abs(daysLeft)}`;
}
