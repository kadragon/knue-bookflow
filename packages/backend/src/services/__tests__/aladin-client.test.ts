/**
 * Aladin client tests
 * Trace: spec_id: SPEC-bookinfo-001, SPEC-backend-refactor-001, task_id: TASK-009, TASK-032, TASK-072
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Charge } from '../../types';
import {
  AladinClient,
  fetchNewBooksInfo,
  identifyNewBooks,
} from '../aladin-client';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Helper to create mock charge
function createMockCharge(chargeDate: string, id = 1): Charge {
  return {
    id,
    barcode: '123',
    biblio: {
      id: 1,
      titleStatement: 'Test Book',
      isbn: '9781234567890',
      thumbnail: null,
    },
    branch: {
      id: 1,
      name: 'Test Library',
      alias: 'Test',
      libraryCode: '123456',
      sortOrder: 1,
    },
    callNo: '000',
    chargeDate,
    dueDate: '2025-01-15',
    overdueDays: 0,
    renewCnt: 0,
    holdCnt: 0,
    isMediaCharge: false,
    supplementNote: null,
    isRenewed: false,
    isRenewable: true,
  };
}

describe('AladinClient', () => {
  let client: AladinClient;

  beforeEach(() => {
    client = new AladinClient('test-api-key');
    mockFetch.mockReset();
  });

  describe('lookupByIsbn', () => {
    it('should fetch book info successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          item: [
            {
              title: 'Clean Code',
              author: 'Robert C. Martin',
              publisher: 'Prentice Hall',
              pubDate: '2008-08-01',
              description: 'A handbook of agile software craftsmanship',
              isbn: '0132350882',
              isbn13: '9780132350884',
              cover: 'https://example.com/cover.jpg',
              categoryName: 'Programming',
            },
          ],
        }),
      });

      const bookInfo = await client.lookupByIsbn('9780132350884');

      expect(bookInfo).not.toBeNull();
      expect(bookInfo?.title).toBe('Clean Code');
      expect(bookInfo?.author).toBe('Robert C. Martin');
      expect(bookInfo?.isbn13).toBe('9780132350884');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('ttbkey=test-api-key'),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('should request the Big cover size', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          item: [
            {
              title: 'Cover Test',
              author: '',
              publisher: '',
              pubDate: '',
              description: '',
              isbn: '',
              isbn13: '',
              cover: '',
              categoryName: '',
            },
          ],
        }),
      });

      await client.lookupByIsbn('9780132350884');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('Cover=Big'),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('should return null for empty ISBN', async () => {
      const bookInfo = await client.lookupByIsbn('');

      expect(bookInfo).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return null when book not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          item: [],
        }),
      });

      const bookInfo = await client.lookupByIsbn('0000000000');

      expect(bookInfo).toBeNull();
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const bookInfo = await client.lookupByIsbn('1234567890');

      expect(bookInfo).toBeNull();
    });

    it('should clean ISBN with hyphens', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          item: [
            {
              title: 'Test',
              author: '',
              publisher: '',
              pubDate: '',
              description: '',
              isbn: '',
              isbn13: '',
              cover: '',
              categoryName: '',
            },
          ],
        }),
      });

      await client.lookupByIsbn('978-0-13-235088-4');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('ItemId=9780132350884'),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('should timeout and return null when lookup exceeds timeout', async () => {
      vi.useFakeTimers();

      mockFetch.mockImplementationOnce((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          if (signal) {
            signal.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }
        });
      });

      const promise = client.lookupByIsbn('9780132350884', 50);
      await vi.advanceTimersByTimeAsync(50);

      const bookInfo = await promise;

      expect(bookInfo).toBeNull();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );

      vi.useRealTimers();
    });
  });
});

describe('fetchNewBooksInfo', () => {
  it('should limit concurrency and keep result order', async () => {
    vi.useFakeTimers();

    let inFlight = 0;
    let maxInFlight = 0;
    const lookupByIsbn = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      return {
        isbn: '9780132350884',
        isbn13: '9780132350884',
        title: 'Test',
        author: 'Author',
        publisher: 'Publisher',
        pubDate: '2025-01-01',
        description: 'Desc',
        coverUrl: 'https://example.com/cover.jpg',
        tableOfContents: null,
      };
    });

    const mockClient = { lookupByIsbn } as unknown as AladinClient;
    const charges = Array.from({ length: 25 }, (_value, index) =>
      createMockCharge('2025-01-15', index + 1),
    );

    const promise = fetchNewBooksInfo(mockClient, charges, 10);
    await vi.runAllTimersAsync();

    const results = await promise;

    expect(results).toHaveLength(25);
    expect(results[0]?.charge.id).toBe(1);
    expect(results[24]?.charge.id).toBe(25);
    expect(maxInFlight).toBeLessThanOrEqual(10);

    vi.useRealTimers();
  });

  it('should return null bookInfo for failed lookups', async () => {
    const lookupByIsbn = vi
      .fn()
      .mockResolvedValueOnce({
        isbn: '1',
        isbn13: '1',
        title: 'Ok',
        author: 'Author',
        publisher: 'Publisher',
        pubDate: '2025-01-01',
        description: 'Desc',
        coverUrl: 'https://example.com/cover.jpg',
        tableOfContents: null,
      })
      .mockRejectedValueOnce(new Error('boom'));

    const mockClient = { lookupByIsbn } as unknown as AladinClient;
    const charges = [
      createMockCharge('2025-01-15', 1),
      createMockCharge('2025-01-15', 2),
    ];

    const results = await fetchNewBooksInfo(mockClient, charges, 10);

    expect(results).toHaveLength(2);
    expect(results[0]?.bookInfo).not.toBeNull();
    expect(results[1]?.bookInfo).toBeNull();
  });
});

describe('identifyNewBooks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should identify books charged today', () => {
    const charges = [
      createMockCharge('2025-01-15', 1), // today
      createMockCharge('2025-01-14', 2), // yesterday
      createMockCharge('2025-01-15', 3), // today
    ];

    const newBooks = identifyNewBooks(charges);

    expect(newBooks).toHaveLength(2);
    expect(newBooks.map((b) => b.id)).toEqual([1, 3]);
  });

  it('should return empty array when no new books', () => {
    const charges = [
      createMockCharge('2025-01-14', 1),
      createMockCharge('2025-01-10', 2),
    ];

    const newBooks = identifyNewBooks(charges);

    expect(newBooks).toHaveLength(0);
  });
});
