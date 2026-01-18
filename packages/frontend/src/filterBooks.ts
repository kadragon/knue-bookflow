// Trace: spec_id: SPEC-frontend-001, task_id: TASK-026, TASK-029, TASK-065
import type { ReadStatus } from '@knue-bookflow/shared';

export type LoanState = 'on_loan' | 'returned';
export type StatFilter = 'none' | 'on_loan' | 'incomplete' | 'completed';

export interface BookListItem {
  id: string;
  title: string;
  author: string;
  loanState: LoanState;
  readStatus: ReadStatus;
}

export interface Filters {
  search: string;
  loanState: 'all' | LoanState;
  stat: StatFilter;
}

export const defaultFilters: Filters = {
  search: '',
  loanState: 'on_loan',
  stat: 'none',
};

export function filterBooks<T extends BookListItem>(
  items: T[],
  filters: Filters,
): T[] {
  const searchLower = filters.search.toLowerCase();

  return items.filter((book) => {
    if (
      searchLower &&
      !book.title.toLowerCase().includes(searchLower) &&
      !book.author.toLowerCase().includes(searchLower) &&
      !book.id.toLowerCase().includes(searchLower)
    ) {
      return false;
    }

    // Stat filter for on_loan takes precedence over loanState dropdown
    if (filters.stat === 'on_loan') {
      if (book.loanState !== 'on_loan') {
        return false;
      }
    } else if (
      filters.loanState !== 'all' &&
      book.loanState !== filters.loanState
    ) {
      return false;
    }

    if (filters.stat === 'incomplete' && book.readStatus !== 'unread') {
      return false;
    }

    if (filters.stat === 'completed' && book.readStatus === 'unread') {
      return false;
    }

    return true;
  });
}
