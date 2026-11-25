import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPlannedLoanRepository,
  PlannedLoanRepository,
} from '../planned-loan-repository';

const USER_ID = 7;

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

describe('PlannedLoanRepository', () => {
  let mockDb: D1Database;
  let repository: PlannedLoanRepository;

  beforeEach(() => {
    mockDb = createMockD1();
    repository = new PlannedLoanRepository(mockDb);
  });

  describe('findAll', () => {
    it('should return all records sorted by created_at DESC', async () => {
      const mockBind = vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [{ id: 1 }, { id: 2 }] }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.findAll(USER_ID);
      expect(result).toHaveLength(2);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM planned_loans WHERE user_id = ? ORDER BY created_at DESC, id DESC',
      );
      expect(mockBind).toHaveBeenCalledWith(USER_ID);
    });
  });

  describe('findByLibraryBiblioId', () => {
    it('should return record when found', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 1, library_biblio_id: 123 }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.findByLibraryBiblioId(USER_ID, 123);
      expect(result).toEqual({ id: 1, library_biblio_id: 123 });
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM planned_loans WHERE user_id = ? AND library_biblio_id = ?',
      );
      expect(mockBind).toHaveBeenCalledWith(USER_ID, 123);
    });

    it('should return null when not found', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.findByLibraryBiblioId(USER_ID, 999);
      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should return record when found', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 1, library_biblio_id: 123 }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.findById(USER_ID, 1);
      expect(result).toEqual({ id: 1, library_biblio_id: 123 });
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM planned_loans WHERE id = ? AND user_id = ?',
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

  describe('findAllLibraryBiblioIds', () => {
    it('should return only library biblio ids', async () => {
      const mockBind = vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [{ library_biblio_id: 123 }, { library_biblio_id: 456 }],
        }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.findAllLibraryBiblioIds(USER_ID);

      expect(result).toEqual([123, 456]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT library_biblio_id FROM planned_loans WHERE user_id = ?',
      );
      expect(mockBind).toHaveBeenCalledWith(USER_ID);
    });
  });

  describe('create', () => {
    const newLoan = {
      library_biblio_id: 123,
      source: 'search' as const,
      title: 'Book',
      author: 'Author',
      publisher: 'Pub',
      year: '2024',
      isbn: '123',
      cover_url: null,
      material_type: 'Book',
      branch_volumes: '[]',
    };

    it('should create and return new record', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ ...newLoan, id: 1 }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.create(USER_ID, newLoan);
      expect(result.id).toBe(1);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO planned_loans'),
      );
      expect(mockBind).toHaveBeenCalledWith(
        USER_ID,
        newLoan.library_biblio_id,
        newLoan.source,
        newLoan.title,
        newLoan.author,
        newLoan.publisher,
        newLoan.year,
        newLoan.isbn,
        newLoan.cover_url,
        newLoan.material_type,
        newLoan.branch_volumes,
        expect.any(String),
        expect.any(String),
      );
    });

    it('should throw error on failure', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      await expect(repository.create(USER_ID, newLoan)).rejects.toThrow(
        'Failed to create planned loan',
      );
    });
  });

  describe('deleteById', () => {
    it('should return true when deleted', async () => {
      const mockBind = vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.deleteById(USER_ID, 1);
      expect(result).toBe(true);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'DELETE FROM planned_loans WHERE id = ? AND user_id = ?',
      );
      expect(mockBind).toHaveBeenCalledWith(1, USER_ID);
    });
  });

  describe('deleteByLibraryBiblioId', () => {
    it('should return true when deleted', async () => {
      const mockBind = vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.deleteByLibraryBiblioId(USER_ID, 123);
      expect(result).toBe(true);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'DELETE FROM planned_loans WHERE user_id = ? AND library_biblio_id = ?',
      );
      expect(mockBind).toHaveBeenCalledWith(USER_ID, 123);
    });
  });

  describe('deleteByLibraryBiblioIds', () => {
    it('should return 0 and skip query when ids are empty', async () => {
      const result = await repository.deleteByLibraryBiblioIds(USER_ID, []);
      expect(result).toBe(0);
      expect(mockDb.prepare).not.toHaveBeenCalled();
      expect(mockDb.batch).not.toHaveBeenCalled();
    });

    it('should delete by IN clause via db.batch and return total affected rows', async () => {
      const fakeStatement = {} as D1PreparedStatement;
      const mockBind = vi.fn().mockReturnValue(fakeStatement);
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });
      (mockDb.batch as ReturnType<typeof vi.fn>).mockResolvedValue([
        { meta: { changes: 2 } },
      ]);

      const result = await repository.deleteByLibraryBiblioIds(
        USER_ID,
        [123, 456],
      );

      expect(result).toBe(2);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'DELETE FROM planned_loans WHERE user_id = ? AND library_biblio_id IN (?, ?)',
      );
      expect(mockBind).toHaveBeenCalledWith(USER_ID, 123, 456);
      expect(mockDb.batch).toHaveBeenCalledWith([fakeStatement]);
    });

    it('should chunk ids into batches of 998 (plus user_id) under the D1 parameter limit', async () => {
      const ids = Array.from({ length: 1500 }, (_, i) => i + 1);
      const fakeStatement = {} as D1PreparedStatement;
      const mockBind = vi.fn().mockReturnValue(fakeStatement);
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });
      (mockDb.batch as ReturnType<typeof vi.fn>).mockResolvedValue([
        { meta: { changes: 998 } },
        { meta: { changes: 502 } },
      ]);

      const result = await repository.deleteByLibraryBiblioIds(USER_ID, ids);

      expect(result).toBe(1500);
      expect(mockDb.prepare).toHaveBeenCalledTimes(2);
      expect(mockBind).toHaveBeenNthCalledWith(
        1,
        USER_ID,
        ...ids.slice(0, 998),
      );
      expect(mockBind).toHaveBeenNthCalledWith(2, USER_ID, ...ids.slice(998));
      expect(mockDb.batch).toHaveBeenCalledWith([fakeStatement, fakeStatement]);
    });
  });
});

describe('createPlannedLoanRepository', () => {
  it('should create instance', () => {
    const mockDb = createMockD1();
    const repo = createPlannedLoanRepository(mockDb);
    expect(repo).toBeInstanceOf(PlannedLoanRepository);
  });
});
