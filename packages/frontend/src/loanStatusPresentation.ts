import type { DueStatus, LoanState } from './api';

type ActiveLoanChipColor = 'error' | 'warning' | 'success';
export type LoanStatusChipColor = 'default' | ActiveLoanChipColor;

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
): { label: string; color: LoanStatusChipColor } {
  if (loanState === 'returned') {
    return { label: '반납 완료', color: 'default' };
  }

  return {
    label: ACTIVE_LOAN_STATUS_LABEL[dueStatus],
    color: ACTIVE_LOAN_STATUS_COLOR[dueStatus],
  };
}

export function shouldShowDdayChip(loanState: LoanState): boolean {
  return loanState === 'on_loan';
}

export function formatDdayLabel(daysLeft: number): string {
  return `D${daysLeft >= 0 ? '-' : '+'}${Math.abs(daysLeft)}`;
}
