/**
 * Book request repository tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BookRequestRepository,
  createBookRequestRepository,
} from '../book-request-repository';

const USER_ID = 7;

function createMockD1(): D1Database {
  const mockPrepare = vi.fn();
  mockPrepare.mockReturnValue({
    bind: vi.fn().mockReturnValue({
      run: vi.fn(),
      first: vi.fn(),
      all: vi.fn(),
    }),
  });

  return {
    prepare: mockPrepare,
    dump: vi.fn(),
    batch: vi.fn(),
    exec: vi.fn(),
  } as unknown as D1Database;
}

const newRequest = {
  isbn13: '9788966262472',
  isbn: '8966262473',
  title: '클린 코드',
  author: '로버트 마틴',
  publisher: '인사이트',
  pub_date: '2013-12-24',
  cover_url: 'https://image.aladin.co.kr/1.jpg',
  aladin_link: 'https://www.aladin.co.kr/shop/1',
};

describe('BookRequestRepository', () => {
  let mockDb: D1Database;
  let repository: BookRequestRepository;

  beforeEach(() => {
    mockDb = createMockD1();
    repository = new BookRequestRepository(mockDb);
  });

  describe('findAll', () => {
    it('returns all rows ordered by created_at DESC', async () => {
      const mockBind = vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [{ id: 2 }, { id: 1 }] }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.findAll(USER_ID);

      expect(result).toEqual([{ id: 2 }, { id: 1 }]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM book_requests WHERE user_id = ? ORDER BY created_at DESC, id DESC',
      );
      expect(mockBind).toHaveBeenCalledWith(USER_ID);
    });
  });

  describe('findByIsbn13', () => {
    it('returns the record when found', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 1, isbn13: newRequest.isbn13 }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.findByIsbn13(USER_ID, newRequest.isbn13);

      expect(result).toEqual({ id: 1, isbn13: newRequest.isbn13 });
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM book_requests WHERE user_id = ? AND isbn13 = ?',
      );
      expect(mockBind).toHaveBeenCalledWith(USER_ID, newRequest.isbn13);
    });

    it('returns null when not found', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.findByIsbn13(USER_ID, 'nope');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('inserts and returns the new record', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ ...newRequest, id: 7 }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.create(USER_ID, newRequest);

      expect(result.id).toBe(7);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO book_requests'),
      );
      expect(mockBind).toHaveBeenCalledWith(
        USER_ID,
        newRequest.isbn13,
        newRequest.isbn,
        newRequest.title,
        newRequest.author,
        newRequest.publisher,
        newRequest.pub_date,
        newRequest.cover_url,
        newRequest.aladin_link,
        expect.any(String),
        expect.any(String),
      );
    });

    it('throws when insert returns nothing', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      await expect(repository.create(USER_ID, newRequest)).rejects.toThrow(
        'Failed to create book request',
      );
    });
  });

  describe('deleteById', () => {
    it('returns true when a row is deleted', async () => {
      const mockBind = vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.deleteById(USER_ID, 7);

      expect(result).toBe(true);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'DELETE FROM book_requests WHERE id = ? AND user_id = ?',
      );
      expect(mockBind).toHaveBeenCalledWith(7, USER_ID);
    });

    it('returns false when no row is deleted', async () => {
      const mockBind = vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.deleteById(USER_ID, 999);
      expect(result).toBe(false);
    });
  });

  describe('createBookRequestRepository', () => {
    it('returns a repository instance', () => {
      expect(createBookRequestRepository(mockDb)).toBeInstanceOf(
        BookRequestRepository,
      );
    });
  });
});
