/**
 * Planned loan payload builders
 * Trace: spec_id: SPEC-loan-plan-001, task_id: TASK-043
 */

import type {
  BranchVolume,
  NewBookItem,
  PlannedLoanPayload,
  SearchBookItem,
} from './api';

function normalizeAuthor(author?: string | null): string {
  if (!author || author.trim() === '') {
    return '저자 미상';
  }
  return author;
}

export function buildFromSearch(book: SearchBookItem): PlannedLoanPayload {
  return {
    libraryId: book.id,
    source: 'search',
    title: book.title,
    author: normalizeAuthor(book.author),
    publisher: book.publisher ?? null,
    year: book.year ?? null,
    isbn: book.isbn ?? null,
    coverUrl: book.coverUrl ?? null,
    materialType: book.materialType ?? null,
    branchVolumes: book.branchVolumes ?? [],
  };
}

export function buildFromNewBook(book: NewBookItem): PlannedLoanPayload {
  return {
    libraryId: book.id,
    source: 'new_books',
    title: book.title,
    author: normalizeAuthor(book.author),
    publisher: book.publisher ?? null,
    year: book.year ?? null,
    isbn: book.isbn ?? null,
    coverUrl: book.coverUrl ?? null,
    materialType: book.materialType ?? null,
    branchVolumes: book.branchVolumes ?? [],
  };
}

export function summarizeBranches(branches: BranchVolume[]): string {
  if (!branches || branches.length === 0) {
    return '소장 정보 없음';
  }

  return branches.map((b) => `${b.branchName}(${b.volumes})`).join(', ');
}
