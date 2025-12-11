import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteRecord } from '../../types';
import { createNoteRepository, NoteRepository } from '../note-repository';

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

      const result = await repository.findByBookId(1);

      expect(result).toHaveLength(1);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM notes WHERE book_id = ? ORDER BY page_number ASC',
      );
      expect(mockBind).toHaveBeenCalledWith(1);
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

      const result = await repository.findById(1);
      expect(result).toEqual(mockNote);
    });

    it('should return null when not found', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.findById(999);
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

      const result = await repository.create(newNote);

      expect(result.id).toBe(100);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notes'),
      );
      expect(mockBind).toHaveBeenCalledWith(
        1,
        10,
        'New Note',
        expect.any(String), // created_at
        expect.any(String), // updated_at
      );
    });

    it('should throw error if creation fails', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      await expect(
        repository.create({ book_id: 1, page_number: 10, content: 'fail' }),
      ).rejects.toThrow('Failed to create note');
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

      await repository.update(1, { page_number: 20, content: 'Updated' });

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining(
          'UPDATE notes SET updated_at = ?, page_number = ?, content = ? WHERE id = ?',
        ),
      );
      expect(mockBind).toHaveBeenCalledWith(
        expect.any(String), // updated_at
        20,
        'Updated',
        1, // id
      );
    });

    it('should update only content', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 1 }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      await repository.update(1, { content: 'Updated' });

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining(
          'UPDATE notes SET updated_at = ?, content = ? WHERE id = ?',
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

      const result = await repository.update(1, { content: 'Updated' });
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

      const result = await repository.delete(1);
      expect(result).toBe(true);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'DELETE FROM notes WHERE id = ?',
      );
    });

    it('should return false when not found', async () => {
      const mockBind = vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.delete(999);
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

      const count = await repository.countByBookId(1);
      expect(count).toBe(5);
    });

    it('should return 0 if result is null', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const count = await repository.countByBookId(1);
      expect(count).toBe(0);
    });
  });

  describe('countNotesForBookIds', () => {
    it('should return map of counts', async () => {
      const mockBind = vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [
            { book_id: 1, count: 2 },
            { book_id: 2, count: 3 },
          ],
        }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.countNotesForBookIds([1, 2]);

      expect(result.get(1)).toBe(2);
      expect(result.get(2)).toBe(3);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('IN (?, ?)'),
      );
    });

    it('should return empty map for empty input', async () => {
      const result = await repository.countNotesForBookIds([]);
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
