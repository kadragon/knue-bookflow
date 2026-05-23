import type { LibraryItem, PlannedLoanAvailability } from '../types';
import { AVAILABILITY_TTL_MS, MAX_AVAILABILITY_CACHE_SIZE } from './constants';

export type AvailabilityFetcher = (
  libraryId: number,
) => Promise<PlannedLoanAvailability | null>;

export function parsePublication(publication: string | null): {
  publisher: string | null;
  year: string | null;
} {
  if (!publication) {
    return { publisher: null, year: null };
  }

  const match = publication.match(/[^:]+:\s*(.+?),\s*(\d{4})\s*$/);
  if (match) {
    return {
      publisher: match[1]?.trim() || null,
      year: match[2] || null,
    };
  }

  const publisherOnlyMatch = publication.match(/[^:]+:\s*(.+)$/);
  if (publisherOnlyMatch) {
    return {
      publisher: publisherOnlyMatch[1]?.trim() || null,
      year: null,
    };
  }

  return { publisher: null, year: null };
}

export function summarizeAvailability(
  items: LibraryItem[],
): PlannedLoanAvailability {
  const totalItems = items.length;
  const availableItems = items.filter((item) => {
    const code = item.circulationState?.code;
    const isCharged = item.circulationState?.isCharged;
    if (isCharged === false) return true;
    if (isCharged === true) return false;
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
    .map((date) => date.substring(0, 10))
    .sort();

  const earliestDueDate = availableItems > 0 ? null : (dueDates[0] ?? null);

  return {
    status: availableItems > 0 ? 'available' : 'loaned_out',
    totalItems,
    availableItems,
    earliestDueDate,
  };
}

// Shared across all handlers that call createCachedFetcher() without an explicit cache argument.
// clearAvailabilityCache() affects all of them.
const availabilityCache = new Map<
  number,
  { value: PlannedLoanAvailability | null; expiresAt: number }
>();

export function clearAvailabilityCache(): void {
  availabilityCache.clear();
}

export function createCachedFetcher(
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
    if (cached && cached.expiresAt > now) {
      cache.delete(libraryId);
      cache.set(libraryId, cached);
      return cached.value;
    }

    const value = await baseFetcher(libraryId);

    if (value !== null) {
      if (cache.size >= maxSize && !cache.has(libraryId)) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) {
          cache.delete(oldestKey);
        }
      }
      cache.set(libraryId, { value, expiresAt: now + ttlMs });
    }
    return value;
  };
}
