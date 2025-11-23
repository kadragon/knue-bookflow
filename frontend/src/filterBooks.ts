// Trace: spec_id: SPEC-frontend-001, task_id: TASK-026

export type LoanState = 'on_loan' | 'returned';

export interface BookListItem {
  id: string;
  title: string;
  author: string;
  loanState: LoanState;
}

export interface Filters {
  search: string;
  loanState: 'all' | LoanState;
}

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

    if (filters.loanState !== 'all' && book.loanState !== filters.loanState) {
      return false;
    }

    return true;
  });
}
