/**
 * Planned loan payload builders
 * Trace: spec_id: SPEC-loan-plan-001, task_id: TASK-043
 */

import type { BranchVolume, CatalogBookItem, PlannedLoanPayload } from './api';

function normalizeAuthor(author?: string | null): string {
  if (!author || author.trim() === '') {
    return '저자 미상';
  }
  return author;
}

function buildPlannedLoan(
  book: CatalogBookItem,
  source: 'new_books' | 'search',
): PlannedLoanPayload {
  return {
    libraryId: book.id,
    source,
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

export const buildFromSearch = (book: CatalogBookItem): PlannedLoanPayload =>
  buildPlannedLoan(book, 'search');

export const buildFromNewBook = (book: CatalogBookItem): PlannedLoanPayload =>
  buildPlannedLoan(book, 'new_books');

export function summarizeBranches(branches: BranchVolume[]): string {
  if (!branches || branches.length === 0) {
    return '소장 정보 없음';
  }

  return branches.map((b) => `${b.branchName}(${b.volumes})`).join(', ');
}
