/**
 * Planned loan payload builder tests
 * Trace: spec_id: SPEC-loan-plan-001
 *        task_id: TASK-043
 */

import { describe, expect, it } from 'vitest';
import type { BranchVolume, NewBookItem, SearchBookItem } from './api';
import {
  buildFromNewBook,
  buildFromSearch,
  summarizeBranches,
} from './plannedLoanPayload';

describe('planned loan payload builders', () => {
  it('builds payload from search result (TEST-loan-plan-004)', () => {
    const book: SearchBookItem = {
      id: 77,
      title: '테스트 책',
      author: '김작가',
      publisher: '북스',
      year: '2023',
      coverUrl: 'https://example.com/cover.jpg',
      isbn: '9781234567890',
      materialType: '단행본',
      publication: '서울 :북스,2023',
      branchVolumes: [
        { branchId: 2, branchName: '분관', volumes: 1 },
        { branchId: 1, branchName: '본관', volumes: 3 },
      ],
    };

    const payload = buildFromSearch(book);
    expect(payload).toMatchObject({
      libraryId: 77,
      source: 'search',
      title: '테스트 책',
      author: '김작가',
      publisher: '북스',
      year: '2023',
      isbn: '9781234567890',
      materialType: '단행본',
    });
    expect(payload.branchVolumes).toHaveLength(2);
  });

  it('builds payload from new book with safe fallbacks (TEST-loan-plan-004)', () => {
    const book: NewBookItem = {
      id: 5,
      title: '새 책',
      author: '',
      publisher: null,
      year: null,
      coverUrl: null,
      isbn: null,
      materialType: '단행본',
      publication: '',
      branchVolumes: [],
    };

    const payload = buildFromNewBook(book);
    expect(payload.author).toBe('저자 미상');
    expect(payload.publisher).toBeNull();
    expect(payload.year).toBeNull();
    expect(payload.branchVolumes).toEqual([]);
    expect(payload.source).toBe('new_books');
  });
});

describe('summarizeBranches', () => {
  it('summarizes branch volumes into readable string (TEST-loan-plan-004)', () => {
    const branches: BranchVolume[] = [
      { branchId: 1, branchName: '본관', volumes: 2 },
      { branchId: 2, branchName: '분관', volumes: 1 },
    ];

    expect(summarizeBranches(branches)).toBe('본관(2), 분관(1)');
  });

  it('returns friendly text for empty branches', () => {
    expect(summarizeBranches([])).toBe('소장 정보 없음');
  });
});
