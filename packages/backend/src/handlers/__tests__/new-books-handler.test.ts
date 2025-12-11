import { describe, expect, it, vi } from 'vitest';
import type { NewBooksResponse } from '../../types';
import { handleNewBooksApi, parsePublication } from '../new-books-handler';

// Mock services
const mockGetNewBooks = vi.fn();

vi.mock('../../services', () => ({
  createLibraryClient: () => ({
    getNewBooks: mockGetNewBooks,
  }),
}));

describe('New Books Handler', () => {
  describe('parsePublication', () => {
    it('should extract publisher and year from standard format', () => {
      const result = parsePublication('서울 :진선아이,2024');
      expect(result).toEqual({ publisher: '진선아이', year: '2024' });
    });

    it('should handle spaces around separators', () => {
      const result = parsePublication('서울 : 진선아이 , 2024 ');
      expect(result).toEqual({ publisher: '진선아이', year: '2024' });
    });

    it('should handle publisher with commas', () => {
      const result = parsePublication('서울 :A, B출판사,2024');
      expect(result).toEqual({ publisher: 'A, B출판사', year: '2024' });
    });

    it('should handle missing year', () => {
      const result = parsePublication('서울 :진선아이');
      expect(result).toEqual({ publisher: '진선아이', year: null });
    });

    it('should return nulls for empty string', () => {
      const result = parsePublication('');
      expect(result).toEqual({ publisher: null, year: null });
    });

    it('should return nulls for invalid format', () => {
      const result = parsePublication('Just a string');
      expect(result).toEqual({ publisher: null, year: null });
    });
  });

  describe('handleNewBooksApi', () => {
    it('should return new books with default parameters', async () => {
      const request = new Request('http://localhost/api/new-books');
      mockGetNewBooks.mockResolvedValue([
        {
          id: 1,
          titleStatement: 'Book Title',
          author: 'Author',
          publication: 'Seoul : Publisher, 2024',
          isbn: '1234567890',
          thumbnailUrl: 'http://example.com/cover.jpg',
          biblioType: { name: 'Book' },
          branchVolumes: [],
        },
      ]);

      const response = await handleNewBooksApi(request);
      expect(response.status).toBe(200);

      const body = (await response.json()) as NewBooksResponse & {
        error?: string;
      };
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toEqual({
        id: 1,
        title: 'Book Title',
        author: 'Author',
        publisher: 'Publisher',
        year: '2024',
        coverUrl: 'http://example.com/cover.jpg',
        isbn: '1234567890',
        materialType: 'Book',
        publication: 'Seoul : Publisher, 2024',
        branchVolumes: [],
      });
      expect(body.meta.days).toBe(90); // Default
    });

    it('normalizes branch volumes with id/name/volume shape (TEST-loan-plan-007)', async () => {
      const request = new Request('http://localhost/api/new-books');
      mockGetNewBooks.mockResolvedValue([
        {
          id: 2,
          titleStatement: 'Another Book',
          author: 'Author',
          publication: 'Seoul : Publisher, 2024',
          isbn: '1234567890',
          thumbnailUrl: 'http://example.com/cover.jpg',
          biblioType: { name: 'Book' },
          branchVolumes: [
            {
              id: 10,
              name: '본관',
              volume: '616.85 B123',
              cState: '대출가능',
              cStateCode: 'READY',
              hasItem: true,
            },
          ],
        },
      ]);

      const response = await handleNewBooksApi(request);
      const body = (await response.json()) as NewBooksResponse & {
        error?: string;
      };

      expect(body.items[0].branchVolumes).toEqual([
        {
          branchId: 10,
          branchName: '본관',
          volumes: 1,
          callNumber: '616.85 B123',
        },
      ]);
    });

    it('should respect days and max parameters', async () => {
      const request = new Request(
        'http://localhost/api/new-books?days=30&max=10',
      );
      mockGetNewBooks.mockResolvedValue([]);

      const response = await handleNewBooksApi(request);
      expect(response.status).toBe(200);

      const body = (await response.json()) as NewBooksResponse & {
        error?: string;
      };
      expect(body.meta.days).toBe(30);

      expect(mockGetNewBooks).toHaveBeenCalledWith(
        expect.any(String), // fromDate
        expect.any(String), // toDate
        10, // max
      );
    });

    it('should validate days parameter', async () => {
      const request = new Request('http://localhost/api/new-books?days=400');
      const response = await handleNewBooksApi(request);
      expect(response.status).toBe(400);
      const body = (await response.json()) as NewBooksResponse & {
        error?: string;
      };
      expect(body.error).toContain('Invalid days parameter');
    });

    it('should validate max parameter', async () => {
      const request = new Request('http://localhost/api/new-books?max=200');
      const response = await handleNewBooksApi(request);
      expect(response.status).toBe(400);
      const body = (await response.json()) as NewBooksResponse & {
        error?: string;
      };
      expect(body.error).toContain('Invalid max parameter');
    });

    it('should handle library client errors', async () => {
      const request = new Request('http://localhost/api/new-books');
      mockGetNewBooks.mockRejectedValue(new Error('Library API failed'));

      const response = await handleNewBooksApi(request);
      expect(response.status).toBe(500);
      const body = (await response.json()) as NewBooksResponse & {
        error?: string;
      };
      expect(body.error).toBe('Failed to fetch new books');
    });

    it('should correctly map inconsistent branchVolumes', async () => {
      const request = new Request('http://localhost/api/new-books');
      mockGetNewBooks.mockResolvedValue([
        {
          id: 1,
          titleStatement: 'Book',
          author: 'Author',
          publication: 'Pub, 2024',
          biblioType: { name: 'Book' },
          branchVolumes: [
            { id: 10, name: 'Main Lib', volume: 5 }, // Inconsistent keys
            { branchId: 20, branchName: 'Branch Lib', volumes: 3 }, // Standard keys
          ],
        },
      ]);

      const response = await handleNewBooksApi(request);
      const body = (await response.json()) as NewBooksResponse & {
        error?: string;
      };

      expect(body.items[0].branchVolumes).toEqual([
        { branchId: 10, branchName: 'Main Lib', volumes: 5, callNumber: null },
        {
          branchId: 20,
          branchName: 'Branch Lib',
          volumes: 3,
          callNumber: null,
        },
      ]);
    });

    it('should preserve callNumber when provided explicitly', async () => {
      const request = new Request('http://localhost/api/new-books');
      mockGetNewBooks.mockResolvedValue([
        {
          id: 3,
          titleStatement: 'CallNumber Book',
          author: 'Author',
          publication: 'Pub, 2024',
          isbn: '1234567890',
          thumbnailUrl: null,
          biblioType: { name: 'Book' },
          branchVolumes: [
            {
              branchId: 30,
              branchName: '법학도서관',
              volumes: 2,
              callNumber: '345.01 C123c',
            },
          ],
        },
      ]);

      const response = await handleNewBooksApi(request);
      const body = (await response.json()) as NewBooksResponse & {
        error?: string;
      };

      expect(body.items[0].branchVolumes).toEqual([
        {
          branchId: 30,
          branchName: '법학도서관',
          volumes: 2,
          callNumber: '345.01 C123c',
        },
      ]);
    });
  });
});
