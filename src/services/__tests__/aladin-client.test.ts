/**
 * Aladin client tests
 * Trace: spec_id: SPEC-bookinfo-001, task_id: TASK-009
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Charge } from '../../types';
import { AladinClient, identifyNewBooks } from '../aladin-client';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Helper to create mock charge
function createMockCharge(chargeDate: string, id = 1): Charge {
  return {
    id,
    renewCnt: 0,
    chargeDate,
    dueDate: '2025-01-15',
    volume: {
      id: 1,
      barcode: '123',
      shelfLocCode: 'A1',
      callNo: '000',
      bib: {
        id: 1,
        title: 'Test Book',
        author: 'Author',
        isbn: '9781234567890',
      },
    },
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
      );
    });
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
