import { describe, expect, it } from 'vitest';
import { defaultFilters, type Filters, filterBooks } from './filterBooks';

// Trace: spec_id: SPEC-frontend-001, task_id: TASK-026, TASK-029

describe('filterBooks', () => {
  const items = [
    {
      id: 'A1',
      title: 'Clean Code',
      author: 'Robert Martin',
      loanState: 'on_loan' as const,
      isRead: false,
    },
    {
      id: 'B2',
      title: 'Refactoring',
      author: 'Martin Fowler',
      loanState: 'returned' as const,
      isRead: true,
    },
  ];

  it('filters by search across title, author, and id', () => {
    const filters: Filters = {
      search: 'martin',
      loanState: 'all',
      stat: 'none',
    };
    const result = filterBooks(items, filters);
    expect(result).toHaveLength(2);
  });

  it('applies loan state filter when specified', () => {
    const filters: Filters = { search: '', loanState: 'on_loan', stat: 'none' };
    const result = filterBooks(items, filters);
    expect(result).toEqual([items[0]]);
  });

  it('filters by stat for incomplete books', () => {
    const filters: Filters = {
      search: '',
      loanState: 'all',
      stat: 'incomplete',
    };
    const result = filterBooks(items, filters);
    expect(result).toEqual([items[0]]);
  });

  it('filters by stat for completed books', () => {
    const filters: Filters = {
      search: '',
      loanState: 'all',
      stat: 'completed',
    };
    const result = filterBooks(items, filters);
    expect(result).toEqual([items[1]]);
  });

  it('returns all items when filters are neutral', () => {
    const filters: Filters = { search: '', loanState: 'all', stat: 'none' };
    expect(filterBooks(items, filters)).toEqual(items);
  });

  it('exposes default filters with loan state set to on_loan', () => {
    expect(defaultFilters.loanState).toBe('on_loan');
  });
});
