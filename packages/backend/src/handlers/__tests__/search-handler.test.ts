/**
 * Search Handler Tests
 *
 * Trace: spec_id: SPEC-search-001
 *        task_id: TASK-041
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  NewBookBiblioType,
  NewBookBranchVolume,
  SearchBook,
  SearchBookItem,
} from '../../types';
import { handleSearchBooksApi, parsePublication } from '../search-handler';

// Mock LibraryClient
vi.mock('../../services', () => ({
  createLibraryClient: vi.fn(),
}));

describe('Search Handler', () => {
  describe('parsePublication', () => {
    // TEST-search-006
    it('should extract publisher and year from standard format', () => {
      const input = '서울 :진선아이,2024';
      const result = parsePublication(input);
      expect(result).toEqual({ publisher: '진선아이', year: '2024' });
    });

    it('should handle publisher names with commas', () => {
      const input = '서울 :A, B출판사,2024';
      const result = parsePublication(input);
      expect(result).toEqual({ publisher: 'A, B출판사', year: '2024' });
    });

    it('should handle missing year', () => {
      const input = '서울 :민음사';
      const result = parsePublication(input);
      expect(result).toEqual({ publisher: '민음사', year: null });
    });

    it('should handle spaces around separators', () => {
      const input = '파주 :   창비  ,  2023  ';
      const result = parsePublication(input);
      expect(result).toEqual({ publisher: '창비', year: '2023' });
    });

    it('should return nulls for empty input', () => {
      expect(parsePublication('')).toEqual({ publisher: null, year: null });
    });

    it('should handle input without location prefix', () => {
      // If the format strictly requires a colon, this might fail or return nulls depending on implementation.
      // Based on regex /[^:]+:\s*(.+?),\s*(\d{4})\s*$/, it expects a colon.
      // Let's test the behavior for "Publisher, 2024" which doesn't have location.
      const input = 'Publisher, 2024';
      const result = parsePublication(input);
      // Since the regex expects a colon, this should probably return nulls or fail to match the first part.
      expect(result).toEqual({ publisher: null, year: null });
    });

    it('should handle complex publisher names with multiple commas if year is at the end', () => {
      const input = 'Location : Pub, Name, Inc., 2020';
      const result = parsePublication(input);
      expect(result).toEqual({ publisher: 'Pub, Name, Inc.', year: '2020' });
    });
  });

  describe('handleSearchBooksApi', () => {
    let mockSearchBooks: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      vi.clearAllMocks();

      mockSearchBooks = vi.fn();
      const { createLibraryClient } = await import('../../services');
      vi.mocked(createLibraryClient).mockReturnValue({
        searchBooks: mockSearchBooks,
      } as never);
    });

    // TEST-search-001: Valid search returns transformed results with correct metadata
    it('should return transformed search results with metadata', async () => {
      const mockBooks: SearchBook[] = [
        {
          id: 1,
          titleStatement: '해리포터와 마법사의 돌',
          author: 'J.K. 롤링',
          publication: '서울 :문학수첩,2014',
          thumbnailUrl: 'https://example.com/cover.jpg',
          isbn: '9788983920775',
          issn: null,
          etcContent: null,
          dateReceived: null,
          biblioType: {
            id: 1,
            name: '단행본',
            materialType: 'Book',
            biblioSchema: 'MARC',
          },
          branchVolumes: [
            { branchId: 1, branchName: '본관', volumes: 3 },
            { branchId: 2, branchName: '분관', volumes: 1 },
          ],
        },
      ];

      mockSearchBooks.mockResolvedValue({
        data: {
          list: mockBooks,
          totalCount: 1,
          isFuzzy: false,
        },
      });

      const request = new Request(
        'http://localhost/api/search?query=해리포터&max=20&offset=0',
      );
      const response = await handleSearchBooksApi(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=300');

      const data = (await response.json()) as {
        items: unknown[];
        meta: Record<string, unknown>;
      };
      expect(data.items).toHaveLength(1);
      expect(data.items[0]).toMatchObject({
        id: 1,
        title: '해리포터와 마법사의 돌',
        author: 'J.K. 롤링',
        publisher: '문학수첩',
        year: '2014',
        coverUrl: 'https://example.com/cover.jpg',
        isbn: '9788983920775',
        materialType: '단행본',
      });
      expect(data.meta).toEqual({
        count: 1,
        totalCount: 1,
        offset: 0,
        max: 20,
        query: '해리포터',
        isFuzzy: false,
      });

      expect(mockSearchBooks).toHaveBeenCalledWith('해리포터', 20, 0);
    });

    // TEST-search-002: Missing query parameter returns 400 error
    it('should return 400 when query parameter is missing', async () => {
      const request = new Request('http://localhost/api/search');
      const response = await handleSearchBooksApi(request);

      expect(response.status).toBe(400);
      const data = (await response.json()) as { error: string };
      expect(data.error).toBe('Query parameter is required');
    });

    it('should return 400 when query parameter is empty string', async () => {
      const request = new Request('http://localhost/api/search?query=   ');
      const response = await handleSearchBooksApi(request);

      expect(response.status).toBe(400);
      const data = (await response.json()) as { error: string };
      expect(data.error).toBe('Query parameter is required');
    });

    // TEST-search-003: Invalid max parameter returns 400 error
    it('should return 400 when max is less than 1', async () => {
      const request = new Request(
        'http://localhost/api/search?query=test&max=0',
      );
      const response = await handleSearchBooksApi(request);

      expect(response.status).toBe(400);
      const data = (await response.json()) as { error: string };
      expect(data.error).toBe('Invalid max parameter (1-100)');
    });

    it('should return 400 when max is greater than 100', async () => {
      const request = new Request(
        'http://localhost/api/search?query=test&max=101',
      );
      const response = await handleSearchBooksApi(request);

      expect(response.status).toBe(400);
      const data = (await response.json()) as { error: string };
      expect(data.error).toBe('Invalid max parameter (1-100)');
    });

    it('should return 400 when max is not a number', async () => {
      const request = new Request(
        'http://localhost/api/search?query=test&max=abc',
      );
      const response = await handleSearchBooksApi(request);

      expect(response.status).toBe(400);
      const data = (await response.json()) as { error: string };
      expect(data.error).toBe('Invalid max parameter (1-100)');
    });

    // TEST-search-004: Invalid offset parameter returns 400 error
    it('should return 400 when offset is negative', async () => {
      const request = new Request(
        'http://localhost/api/search?query=test&offset=-1',
      );
      const response = await handleSearchBooksApi(request);

      expect(response.status).toBe(400);
      const data = (await response.json()) as { error: string };
      expect(data.error).toBe('Invalid offset parameter (>= 0)');
    });

    it('should return 400 when offset is not a number', async () => {
      const request = new Request(
        'http://localhost/api/search?query=test&offset=xyz',
      );
      const response = await handleSearchBooksApi(request);

      expect(response.status).toBe(400);
      const data = (await response.json()) as { error: string };
      expect(data.error).toBe('Invalid offset parameter (>= 0)');
    });

    // TEST-search-005: Library API error returns 500 with error message
    it('should return 500 when library API fails', async () => {
      mockSearchBooks.mockRejectedValue(new Error('Network timeout'));

      const request = new Request(
        'http://localhost/api/search?query=test&max=20&offset=0',
      );
      const response = await handleSearchBooksApi(request);

      expect(response.status).toBe(500);
      const data = (await response.json()) as { error: string };
      expect(data.error).toBe('Failed to search books');
    });

    it('should use default values for max and offset when not provided', async () => {
      mockSearchBooks.mockResolvedValue({
        data: {
          list: [],
          totalCount: 0,
          isFuzzy: false,
        },
      });

      const request = new Request('http://localhost/api/search?query=test');
      const response = await handleSearchBooksApi(request);

      expect(response.status).toBe(200);
      expect(mockSearchBooks).toHaveBeenCalledWith('test', 20, 0);
    });

    it('should handle books with missing optional fields', async () => {
      const mockBooks: SearchBook[] = [
        {
          id: 2,
          titleStatement: '제목만 있는 책',
          author: '',
          publication: '',
          thumbnailUrl: null,
          isbn: null,
          issn: null,
          etcContent: null,
          dateReceived: null,
          biblioType: {
            id: 2,
            name: '기타',
            materialType: 'Unknown',
            biblioSchema: 'MARC',
          },
          branchVolumes: [],
        },
      ];

      mockSearchBooks.mockResolvedValue({
        data: {
          list: mockBooks,
          totalCount: 1,
          isFuzzy: false,
        },
      });

      const request = new Request('http://localhost/api/search?query=test');
      const response = await handleSearchBooksApi(request);

      expect(response.status).toBe(200);
      const data = (await response.json()) as {
        items: unknown[];
      };
      expect(data.items[0]).toMatchObject({
        id: 2,
        title: '제목만 있는 책',
        author: '저자 미상',
        publisher: null,
        year: null,
        coverUrl: null,
        isbn: null,
        materialType: '기타',
      });
    });

    it('should correctly map inconsistent branchVolumes', async () => {
      const mockBooks: SearchBook[] = [
        {
          id: 1,
          titleStatement: 'Book',
          author: 'Author',
          publication: 'Pub, 2024',
          branchVolumes: [
            { id: 10, name: 'Main Lib', volume: 5 }, // Inconsistent
            { branchId: 20, branchName: 'Branch Lib', volumes: 3 }, // Standard
          ] as unknown as NewBookBranchVolume[],
          biblioType: { name: 'Book' } as unknown as NewBookBiblioType,
          thumbnailUrl: null,
          isbn: null,
          issn: null,
          etcContent: null,
          dateReceived: null,
        },
      ];

      mockSearchBooks.mockResolvedValue({
        data: {
          list: mockBooks,
          totalCount: 1,
          isFuzzy: false,
        },
      });

      const request = new Request('http://localhost/api/search?query=test');
      const response = await handleSearchBooksApi(request);
      const data = (await response.json()) as { items: SearchBookItem[] };

      expect(data.items[0].branchVolumes).toEqual([
        { branchId: 10, branchName: 'Main Lib', volumes: 5 },
        { branchId: 20, branchName: 'Branch Lib', volumes: 3 },
      ]);
    });
  });
});
