/**
 * Planned Loans Handler
 * Manage borrow-later list from search/new books
 *
 * Trace: spec_id: SPEC-loan-plan-001, task_id: TASK-043
 */

import {
  createPlannedLoanRepository,
  type PlannedLoanRepository,
} from '../services/planned-loan-repository';
import type {
  BranchAvailability,
  CreatePlannedLoanRequest,
  Env,
  PlannedLoanRecord,
  PlannedLoanViewModel,
} from '../types';

type PlannedRepo = Pick<
  PlannedLoanRepository,
  'findAll' | 'findByLibraryBiblioId' | 'create' | 'deleteById'
>;

function parseBranches(branches?: unknown): BranchAvailability[] {
  if (!Array.isArray(branches)) return [];

  return branches
    .map((b) => {
      if (
        b &&
        typeof b.branchId === 'number' &&
        typeof b.branchName === 'string' &&
        typeof b.volumes === 'number'
      ) {
        return {
          branchId: b.branchId,
          branchName: b.branchName,
          volumes: b.volumes,
        } satisfies BranchAvailability;
      }
      return null;
    })
    .filter((b): b is BranchAvailability => b !== null);
}

function toViewModel(record: PlannedLoanRecord): PlannedLoanViewModel {
  let branchVolumes: BranchAvailability[] = [];
  try {
    const parsed = JSON.parse(record.branch_volumes || '[]');
    branchVolumes = parseBranches(parsed);
  } catch (error) {
    console.warn('[PlannedLoans] Failed to parse branch_volumes', error);
  }

  return {
    id: record.id ?? 0,
    libraryId: record.library_biblio_id,
    source: record.source,
    title: record.title,
    author: record.author,
    publisher: record.publisher,
    year: record.year,
    isbn: record.isbn,
    coverUrl: record.cover_url,
    materialType: record.material_type,
    branchVolumes,
    createdAt: record.created_at ?? '',
  };
}

function validatePayload(body: unknown): {
  payload?: CreatePlannedLoanRequest;
  error?: string;
} {
  if (!body || typeof body !== 'object') {
    return { error: 'Invalid JSON body' };
  }

  const candidate = body as Record<string, unknown>;
  const libraryId = Number(candidate.libraryId);
  const source = candidate.source;
  const title = candidate.title;
  const author = candidate.author;

  if (!Number.isFinite(libraryId)) {
    return { error: 'libraryId must be a number' };
  }

  if (source !== 'new_books' && source !== 'search') {
    return { error: 'source must be new_books or search' };
  }

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return { error: 'title is required' };
  }

  if (!author || typeof author !== 'string' || author.trim() === '') {
    return { error: 'author is required' };
  }

  const branchVolumes = parseBranches(candidate.branchVolumes);

  return {
    payload: {
      libraryId,
      source,
      title: title.trim(),
      author: author.trim(),
      publisher:
        candidate.publisher === undefined
          ? null
          : (candidate.publisher as string | null),
      year:
        candidate.year === undefined ? null : (candidate.year as string | null),
      isbn:
        candidate.isbn === undefined ? null : (candidate.isbn as string | null),
      coverUrl:
        candidate.coverUrl === undefined
          ? null
          : (candidate.coverUrl as string | null),
      materialType:
        candidate.materialType === undefined
          ? null
          : (candidate.materialType as string | null),
      branchVolumes,
    },
  };
}

export async function handleCreatePlannedLoan(
  env: Env,
  request: Request,
  repo: PlannedRepo = createPlannedLoanRepository(env.DB),
): Promise<Response> {
  try {
    const body = await request.json().catch(() => null);
    const { payload, error } = validatePayload(body);

    if (error || !payload) {
      return new Response(JSON.stringify({ error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const existing = await repo.findByLibraryBiblioId(payload.libraryId);
    if (existing) {
      return new Response(
        JSON.stringify({ error: 'Planned loan already exists for this book' }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const created = await repo.create({
      library_biblio_id: payload.libraryId,
      source: payload.source,
      title: payload.title,
      author: payload.author,
      publisher: payload.publisher ?? null,
      year: payload.year ?? null,
      isbn: payload.isbn ?? null,
      cover_url: payload.coverUrl ?? null,
      material_type: payload.materialType ?? null,
      branch_volumes: JSON.stringify(payload.branchVolumes ?? []),
    });

    return new Response(JSON.stringify({ item: toViewModel(created) }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[PlannedLoans] Failed to create planned loan', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function handleGetPlannedLoans(
  env: Env,
  repo: PlannedRepo = createPlannedLoanRepository(env.DB),
): Promise<Response> {
  try {
    const items = await repo.findAll();
    const view = items
      .map(toViewModel)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return new Response(JSON.stringify({ items: view }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[PlannedLoans] Failed to list planned loans', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function handleDeletePlannedLoan(
  env: Env,
  id: number,
  repo: PlannedRepo = createPlannedLoanRepository(env.DB),
): Promise<Response> {
  try {
    const deleted = await repo.deleteById(id);
    return new Response(JSON.stringify({ success: deleted }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[PlannedLoans] Failed to delete planned loan', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Export types for tests
export type { BranchAvailability, CreatePlannedLoanRequest };
