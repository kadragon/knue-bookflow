import { describe, expect, it } from 'vitest';
import { type Filters, filterBooks } from './filterBooks';

// Trace: spec_id: SPEC-frontend-001, task_id: TASK-026

describe('filterBooks', () => {
  const items = [
    {
      id: 'A1',
      title: 'Clean Code',
      author: 'Robert Martin',
      loanState: 'on_loan' as const,
    },
    {
      id: 'B2',
      title: 'Refactoring',
      author: 'Martin Fowler',
      loanState: 'returned' as const,
    },
  ];

  it('filters by search across title, author, and id', () => {
    const filters: Filters = { search: 'martin', loanState: 'all' };
    const result = filterBooks(items, filters);
    expect(result).toHaveLength(2);
  });

  it('applies loan state filter when specified', () => {
    const filters: Filters = { search: '', loanState: 'on_loan' };
    const result = filterBooks(items, filters);
    expect(result).toEqual([items[0]]);
  });

  it('returns all items when filters are neutral', () => {
    const filters: Filters = { search: '', loanState: 'all' };
    expect(filterBooks(items, filters)).toEqual(items);
  });
});
