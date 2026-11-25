import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteRecord } from '../../types';
import { createNoteRepository, NoteRepository } from '../note-repository';

const USER_ID = 7;
const OWNED_BY_USER = 'book_id IN (SELECT id FROM books WHERE user_id = ?)';

// Mock D1 database
function createMockD1(): D1Database {
  const mockPrepare = vi.fn();
  const mockBind = vi.fn();
  const mockRun = vi.fn();
  const mockFirst = vi.fn();
  const mockAll = vi.fn();

  mockPrepare.mockReturnValue({
    bind: mockBind,
  });

  mockBind.mockReturnValue({
    run: mockRun,
    first: mockFirst,
    all: mockAll,
  });

  return {
    prepare: mockPrepare,
    dump: vi.fn(),
    batch: vi.fn(),
    exec: vi.fn(),
  } as unknown as D1Database;
}

describe('NoteRepository', () => {
  let mockDb: D1Database;
  let repository: NoteRepository;

  beforeEach(() => {
    mockDb = createMockD1();
    repository = new NoteRepository(mockDb);
  });

  describe('findByBookId', () => {
    it('should return notes sorted by page_number', async () => {
      const mockNotes: NoteRecord[] = [
        {
          id: 1,
          book_id: 1,
          page_number: 10,
          content: 'Note 1',
          created_at: '2023-01-01',
          updated_at: '2023-01-01',
        },
      ];

      const mockBind = vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: mockNotes }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.findByBookId(USER_ID, 1);

      expect(result).toHaveLength(1);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        `SELECT * FROM notes WHERE book_id = ? AND ${OWNED_BY_USER} ORDER BY page_number ASC`,
      );
      expect(mockBind).toHaveBeenCalledWith(1, USER_ID);
    });
  });

  describe('findById', () => {
    it('should return note when found', async () => {
      const mockNote: NoteRecord = {
        id: 1,
        book_id: 1,
        page_number: 10,
        content: 'Note 1',
        created_at: '2023-01-01',
        updated_at: '2023-01-01',
      };

      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(mockNote),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.findById(USER_ID, 1);
      expect(result).toEqual(mockNote);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        `SELECT * FROM notes WHERE id = ? AND ${OWNED_BY_USER}`,
      );
      expect(mockBind).toHaveBeenCalledWith(1, USER_ID);
    });

    it('should return null when not found', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.findById(USER_ID, 999);
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create and return new note', async () => {
      const newNote = {
        book_id: 1,
        page_number: 10,
        content: 'New Note',
      };

      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ ...newNote, id: 100 }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.create(USER_ID, newNote);

      expect(result?.id).toBe(100);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringMatching(
          /INSERT INTO notes.*WHERE EXISTS \(SELECT 1 FROM books WHERE id = \? AND user_id = \?\)/s,
        ),
      );
      expect(mockBind).toHaveBeenCalledWith(
        1,
        10,
        'New Note',
        expect.any(String), // created_at
        expect.any(String), // updated_at
        1, // book id ownership check
        USER_ID,
      );
    });

    it('should return null when the user does not own the book', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      await expect(
        repository.create(USER_ID, {
          book_id: 1,
          page_number: 10,
          content: 'fail',
        }),
      ).resolves.toBeNull();
    });
  });

  describe('update', () => {
    it('should update page_number and content', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 1, page_number: 20 }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      await repository.update(USER_ID, 1, {
        page_number: 20,
        content: 'Updated',
      });

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining(
          `UPDATE notes SET updated_at = ?, page_number = ?, content = ? WHERE id = ? AND ${OWNED_BY_USER}`,
        ),
      );
      expect(mockBind).toHaveBeenCalledWith(
        expect.any(String), // updated_at
        20,
        'Updated',
        1, // id
        USER_ID,
      );
    });

    it('should update only content', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 1 }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      await repository.update(USER_ID, 1, { content: 'Updated' });

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining(
          `UPDATE notes SET updated_at = ?, content = ? WHERE id = ? AND ${OWNED_BY_USER}`,
        ),
      );
    });

    it('should return null if note not found', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.update(USER_ID, 1, {
        content: 'Updated',
      });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should return true when deleted', async () => {
      const mockBind = vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.delete(USER_ID, 1);
      expect(result).toBe(true);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        `DELETE FROM notes WHERE id = ? AND ${OWNED_BY_USER}`,
      );
      expect(mockBind).toHaveBeenCalledWith(1, USER_ID);
    });

    it('should return false when not found', async () => {
      const mockBind = vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.delete(USER_ID, 999);
      expect(result).toBe(false);
    });
  });

  describe('countByBookId', () => {
    it('should return count', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ count: 5 }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const count = await repository.countByBookId(USER_ID, 1);
      expect(count).toBe(5);
      expect(mockBind).toHaveBeenCalledWith(1, USER_ID);
    });

    it('should return 0 if result is null', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const count = await repository.countByBookId(USER_ID, 1);
      expect(count).toBe(0);
    });
  });

  describe('countNotesForBookIds', () => {
    it('should return counts for the requested books of the user', async () => {
      const mockBind = vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [
            { book_id: 1, count: 2 },
            { book_id: 2, count: 3 },
            { book_id: 9, count: 4 },
          ],
        }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.countNotesForBookIds(USER_ID, [1, 2]);

      expect(result.get(1)).toBe(2);
      expect(result.get(2)).toBe(3);
      expect(result.has(9)).toBe(false);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining(OWNED_BY_USER),
      );
      expect(mockBind).toHaveBeenCalledWith(USER_ID);
    });

    it('should return empty map for empty input', async () => {
      const result = await repository.countNotesForBookIds(USER_ID, []);
      expect(result.size).toBe(0);
      expect(mockDb.prepare).not.toHaveBeenCalled();
    });
  });
});

describe('createNoteRepository', () => {
  it('should create instance', () => {
    const mockDb = createMockD1();
    const repo = createNoteRepository(mockDb);
    expect(repo).toBeInstanceOf(NoteRepository);
  });
});
