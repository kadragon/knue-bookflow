import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookInfo, Env } from '../../types';
import { handleGetBookByIsbn } from '../aladin-handler';

// Mock Aladin client
const mockAladinClient = {
  lookupByIsbn: vi.fn(),
};

vi.mock('../../services', () => ({
  createAladinClient: () => mockAladinClient,
}));

describe('Aladin Handler', () => {
  const env = {
    ALADIN_API_KEY: 'test-api-key',
  } as unknown as Env;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleGetBookByIsbn', () => {
    it('should return book information when found', async () => {
      const mockBookInfo: BookInfo = {
        isbn: '1234567890',
        title: 'Test Book',
        author: 'Test Author',
        publisher: 'Test Publisher',
        pubDate: '2023-01-01',
        isbn13: '9781234567890',
        coverUrl: 'https://example.com/cover.jpg',
        description: 'Test description',
        tableOfContents: 'Chapter 1\nChapter 2',
      };

      mockAladinClient.lookupByIsbn.mockResolvedValue(mockBookInfo);

      const response = await handleGetBookByIsbn(env, '9781234567890');
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        book?: BookInfo;
        error?: string;
      };
      expect(body.book).toEqual(mockBookInfo);
      expect(mockAladinClient.lookupByIsbn).toHaveBeenCalledWith(
        '9781234567890',
      );
    });

    it('should return 404 when book not found', async () => {
      mockAladinClient.lookupByIsbn.mockResolvedValue(null);

      const response = await handleGetBookByIsbn(env, '9999999999999');
      expect(response.status).toBe(404);

      const body = (await response.json()) as {
        book?: BookInfo;
        error?: string;
      };
      expect(body.error).toBe('Book not found');
      expect(body.book).toBeUndefined();
    });

    it('should return 500 when Aladin API throws an error', async () => {
      const errorMessage = 'API connection failed';
      mockAladinClient.lookupByIsbn.mockRejectedValue(new Error(errorMessage));

      const response = await handleGetBookByIsbn(env, '9781234567890');
      expect(response.status).toBe(500);

      const body = (await response.json()) as {
        book?: BookInfo;
        error?: string;
      };
      expect(body.error).toBe('Failed to fetch book information');
      expect(body.book).toBeUndefined();
    });

    it('should handle non-Error exceptions', async () => {
      mockAladinClient.lookupByIsbn.mockRejectedValue('Unknown error type');

      const response = await handleGetBookByIsbn(env, '9781234567890');
      expect(response.status).toBe(500);

      const body = (await response.json()) as {
        book?: BookInfo;
        error?: string;
      };
      expect(body.error).toBe('Failed to fetch book information');
    });

    it('should have proper Content-Type header', async () => {
      const mockBookInfo: BookInfo = {
        isbn: '1234567890',
        title: 'Test Book',
        author: 'Test Author',
        publisher: 'Test Publisher',
        pubDate: '2023-01-01',
        isbn13: '9781234567890',
        description: 'Test description',
        coverUrl: 'https://example.com/cover.jpg',
      };

      mockAladinClient.lookupByIsbn.mockResolvedValue(mockBookInfo);

      const response = await handleGetBookByIsbn(env, '9781234567890');
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });
});
