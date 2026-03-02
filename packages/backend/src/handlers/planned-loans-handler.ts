/**
 * Planned Loans Handler
 * Manage borrow-later list from search/new books
 *
 * Trace: spec_id: SPEC-loan-plan-001, SPEC-loan-plan-002, SPEC-backend-refactor-001
 *        task_id: TASK-043, TASK-047, TASK-061, TASK-067, TASK-079
 *        spec_id: SPEC-deps-001
 */

import { z } from 'zod';
import {
  createLibraryClient,
  createPlannedLoanDismissalRepository,
} from '../services';
import type { PlannedLoanDismissalRepository } from '../services/planned-loan-dismissal-repository';
import {
  createPlannedLoanRepository,
  type PlannedLoanRepository,
} from '../services/planned-loan-repository';
import type {
  BranchAvailability,
  CreatePlannedLoanRequest,
  Env,
  LibraryItem,
  PlannedLoanAvailability,
  PlannedLoanRecord,
  PlannedLoanViewModel,
} from '../types';
import {
  AVAILABILITY_TTL_MS,
  MAX_AVAILABILITY_CACHE_SIZE,
  normalizeBranchVolumes,
} from '../utils';

type PlannedRepo = Pick<
  PlannedLoanRepository,
  'findAll' | 'findById' | 'findByLibraryBiblioId' | 'create' | 'deleteById'
>;

type PlannedDismissalRepo = Pick<
  PlannedLoanDismissalRepository,
  'markDismissed'
>;

const branchSchema = z.object({
  branchId: z.number('branchId is required'),
  branchName: z.string('branchName is required'),
  volumes: z.number('volumes is required'),
  callNumber: z.string().nullable().optional(),
});

const plannedLoanSchema = z
  .object({
    libraryId: z
      .number('libraryId is required')
      .refine((v) => Number.isFinite(v), 'libraryId must be a number'),
    source: z
      .enum(['new_books', 'search', 'request_book'], {
        error: 'source must be new_books, search, or request_book',
      })
      .optional(),
    title: z.string('title is required').trim().min(1, 'title is required'),
    author: z.string('author is required').trim().min(1, 'author is required'),
    publisher: z.string().nullable().optional(),
    year: z.string().nullable().optional(),
    isbn: z.string().nullable().optional(),
    coverUrl: z.string().nullable().optional(),
    materialType: z.string().nullable().optional(),
    branchVolumes: z
      .preprocess(
        (value) => normalizeBranchVolumes(value),
        z.array(branchSchema),
      )
      .optional()
      .default([]),
  })
  .refine((data) => data.source !== undefined, {
    path: ['source'],
    message: 'source is required',
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
    availability: null,
    createdAt: record.created_at ?? '',
  };
}

type AvailabilityFetcher = (
  libraryId: number,
) => Promise<PlannedLoanAvailability | null>;

/**
 * Summarize availability for a biblio's items
 * Rules:
 * - Available if at least one item is not charged (isCharged=false or status code indicates ready)
 * - Loaned out if all items are charged, with earliest due date
 *
 * Note: isCharged is the primary indicator; status codes are fallback for API compatibility
 */
function summarizeAvailability(items: LibraryItem[]): PlannedLoanAvailability {
  const totalItems = items.length;
  const availableItems = items.filter((item) => {
    const code = item.circulationState?.code;
    const isCharged = item.circulationState?.isCharged;
    // Primary check: use isCharged boolean when present
    if (isCharged === false) return true;
    if (isCharged === true) return false;
    // Fallback: check status codes when isCharged is undefined
    return code === 'READY' || code === 'ON_SHELF' || code === 'AVAILABLE';
  }).length;

  const dueDates = items
    .filter((item) => {
      const code = item.circulationState?.code;
      const isCharged = item.circulationState?.isCharged;
      return (
        isCharged === true ||
        code === 'LOAN' ||
        code === 'CHARGED' ||
        code === 'CHARGE'
      );
    })
    .map((item) => item.dueDate)
    .filter((date): date is string => Boolean(date))
    .map((date) => date.substring(0, 10)) // Extract YYYY-MM-DD regardless of separator (T or space)
    .sort();

  const earliestDueDate = availableItems > 0 ? null : (dueDates[0] ?? null);

  return {
    status: availableItems > 0 ? 'available' : 'loaned_out',
    totalItems,
    availableItems,
    earliestDueDate,
  };
}

// Exported for testing
export { summarizeAvailability, createCachedFetcher, clearAvailabilityCache };

// Module-level cache for availability data (persistent across requests)
const availabilityCache = new Map<
  number,
  { value: PlannedLoanAvailability | null; expiresAt: number }
>();

/**
 * Clear the availability cache (primarily for testing)
 */
function clearAvailabilityCache(): void {
  availabilityCache.clear();
}

function createCachedFetcher(
  baseFetcher: AvailabilityFetcher,
  ttlMs: number = AVAILABILITY_TTL_MS,
  maxSize: number = MAX_AVAILABILITY_CACHE_SIZE,
  cache: Map<
    number,
    { value: PlannedLoanAvailability | null; expiresAt: number }
  > = availabilityCache,
): AvailabilityFetcher {
  return async (libraryId: number): Promise<PlannedLoanAvailability | null> => {
    const now = Date.now();
    const cached = cache.get(libraryId);

    // Return cached value if still valid
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    // Fetch fresh value
    const value = await baseFetcher(libraryId);

    // Implement simple LRU: remove oldest entry if cache is full
    if (cache.size >= maxSize) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) {
        cache.delete(oldestKey);
      }
    }

    cache.set(libraryId, { value, expiresAt: now + ttlMs });
    return value;
  };
}

// Singleton fetcher instance to maintain cache across requests
let cachedAvailabilityFetcher: AvailabilityFetcher | null = null;

function createAvailabilityFetcher(): AvailabilityFetcher {
  // Return existing singleton if available
  if (cachedAvailabilityFetcher) {
    return cachedAvailabilityFetcher;
  }

  const client = createLibraryClient();
  const fetcher: AvailabilityFetcher = async (
    libraryId: number,
  ): Promise<PlannedLoanAvailability | null> => {
    const items = await client.getBiblioItems(libraryId);
    return summarizeAvailability(items);
  };

  cachedAvailabilityFetcher = createCachedFetcher(fetcher);
  return cachedAvailabilityFetcher;
}

function validatePayload(body: unknown): {
  payload?: CreatePlannedLoanRequest;
  error?: string;
} {
  const parsed = plannedLoanSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (!issue) return { error: 'Invalid request body' };

    const path = issue.path.length > 0 ? issue.path.join('.') : '';
    const message = path ? `${path}: ${issue.message}` : issue.message;
    return { error: message || 'Invalid request body' };
  }

  if (parsed.data.source === undefined) {
    return { error: 'source is required' };
  }

  return {
    payload: { ...parsed.data, source: parsed.data.source },
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
  fetchAvailability: AvailabilityFetcher = createAvailabilityFetcher(),
): Promise<Response> {
  try {
    const items = await repo.findAll();
    const view = items
      .map(toViewModel)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const withAvailability = await Promise.all(
      view.map(async (item) => {
        try {
          const availability = await fetchAvailability(item.libraryId);
          return { ...item, availability };
        } catch (error) {
          console.error('[PlannedLoans] Availability lookup failed', error);
          return { ...item, availability: null };
        }
      }),
    );

    return new Response(JSON.stringify({ items: withAvailability }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
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
  dismissalRepo: PlannedDismissalRepo = createPlannedLoanDismissalRepository(
    env.DB,
  ),
): Promise<Response> {
  try {
    const existing = await repo.findById(id);
    const deleted = await repo.deleteById(id);

    if (deleted && existing?.source === 'request_book') {
      await dismissalRepo.markDismissed(existing.library_biblio_id);
    }

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
