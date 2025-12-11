/**
 * Planned Loans Handler
 * Manage borrow-later list from search/new books
 *
 * Trace: spec_id: SPEC-loan-plan-001, task_id: TASK-043
 */

import { z } from 'zod';
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

const branchSchema = z.object({
  branchId: z.number({ required_error: 'branchId is required' }),
  branchName: z.string({ required_error: 'branchName is required' }),
  volumes: z.number({ required_error: 'volumes is required' }),
});

const plannedLoanSchema = z.object({
  libraryId: z
    .number({ required_error: 'libraryId is required' })
    .refine((v) => Number.isFinite(v), 'libraryId must be a number'),
  source: z.enum(['new_books', 'search'], {
    required_error: 'source is required',
    invalid_type_error: 'source must be new_books or search',
  }),
  title: z
    .string({ required_error: 'title is required' })
    .trim()
    .min(1, 'title is required'),
  author: z
    .string({ required_error: 'author is required' })
    .trim()
    .min(1, 'author is required'),
  publisher: z.string().nullable().optional(),
  year: z.string().nullable().optional(),
  isbn: z.string().nullable().optional(),
  coverUrl: z.string().nullable().optional(),
  materialType: z.string().nullable().optional(),
  branchVolumes: z.array(branchSchema).optional().default([]),
});

function toViewModel(record: PlannedLoanRecord): PlannedLoanViewModel {
  let branchVolumes: BranchAvailability[] = [];
  try {
    const parsed = JSON.parse(record.branch_volumes || '[]');
    const result = branchSchema.array().safeParse(parsed);
    if (result.success) {
      branchVolumes = result.data;
    }
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
  const parsed = plannedLoanSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue?.message || 'Invalid request body' };
  }

  return {
    payload: parsed.data,
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
