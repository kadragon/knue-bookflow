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

  it('exposes default filters with loan state set to all', () => {
    expect(defaultFilters.loanState).toBe('all');
  });

  it('applies combined search and stat filters', () => {
    const filters: Filters = {
      search: 'Clean',
      loanState: 'all',
      stat: 'incomplete',
    };
    const result = filterBooks(items, filters);
    expect(result).toEqual([items[0]]);
  });

  it('returns empty when combined filters exclude all items', () => {
    const filters: Filters = {
      search: 'Clean',
      loanState: 'all',
      stat: 'completed',
    };
    const result = filterBooks(items, filters);
    expect(result).toEqual([]);
  });

  it('filters by stat on_loan for on-loan books', () => {
    const filters: Filters = {
      search: '',
      loanState: 'all',
      stat: 'on_loan',
    };
    const result = filterBooks(items, filters);
    expect(result).toEqual([items[0]]);
  });

  it('applies all three filters together', () => {
    const extendedItems = [
      ...items,
      {
        id: 'C3',
        title: 'Clean Architecture',
        author: 'Robert Martin',
        loanState: 'on_loan' as const,
        isRead: true,
      },
    ];
    const filters: Filters = {
      search: 'Clean',
      loanState: 'on_loan',
      stat: 'incomplete',
    };
    const result = filterBooks(extendedItems, filters);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('A1');
  });

  it('stat on_loan takes precedence over loanState filter', () => {
    // Even if loanState is 'returned', stat: 'on_loan' should show only on_loan books
    const filters: Filters = {
      search: '',
      loanState: 'returned',
      stat: 'on_loan',
    };
    const result = filterBooks(items, filters);
    expect(result).toEqual([items[0]]);
  });

  it('loanState filter applies when stat is not on_loan', () => {
    const filters: Filters = {
      search: '',
      loanState: 'returned',
      stat: 'completed',
    };
    const result = filterBooks(items, filters);
    expect(result).toEqual([items[1]]);
  });
});
