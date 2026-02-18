import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPlannedLoanRepository,
  PlannedLoanRepository,
} from '../planned-loan-repository';

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

      // findAll calls .all() directly without .bind() because no params
      // but mocks might be set up differently. In repo: .prepare(...).all()
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [{ id: 1 }, { id: 2 }] }),
      } as unknown as D1PreparedStatement);

      const result = await repository.findAll();
      expect(result).toHaveLength(2);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM planned_loans ORDER BY created_at DESC, id DESC',
      );
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

      const result = await repository.findByLibraryBiblioId(123);
      expect(result).toEqual({ id: 1, library_biblio_id: 123 });
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM planned_loans WHERE library_biblio_id = ?',
      );
      expect(mockBind).toHaveBeenCalledWith(123);
    });

    it('should return null when not found', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.findByLibraryBiblioId(999);
      expect(result).toBeNull();
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

      const result = await repository.create(newLoan);
      expect(result.id).toBe(1);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO planned_loans'),
      );
    });

    it('should throw error on failure', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      await expect(repository.create(newLoan)).rejects.toThrow(
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

      const result = await repository.deleteById(1);
      expect(result).toBe(true);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'DELETE FROM planned_loans WHERE id = ?',
      );
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

      const result = await repository.deleteByLibraryBiblioId(123);
      expect(result).toBe(true);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'DELETE FROM planned_loans WHERE library_biblio_id = ?',
      );
    });
  });

  describe('deleteByLibraryBiblioIds', () => {
    it('should return 0 and skip query when ids are empty', async () => {
      const result = await repository.deleteByLibraryBiblioIds([]);
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

      const result = await repository.deleteByLibraryBiblioIds([123, 456]);

      expect(result).toBe(2);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'DELETE FROM planned_loans WHERE library_biblio_id IN (?, ?)',
      );
      expect(mockBind).toHaveBeenCalledWith(123, 456);
      expect(mockDb.batch).toHaveBeenCalledWith([fakeStatement]);
    });

    it('should chunk ids into batches of 999 when exceeding D1 parameter limit', async () => {
      const ids = Array.from({ length: 1500 }, (_, i) => i + 1);
      const fakeStatement = {} as D1PreparedStatement;
      const mockBind = vi.fn().mockReturnValue(fakeStatement);
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });
      (mockDb.batch as ReturnType<typeof vi.fn>).mockResolvedValue([
        { meta: { changes: 999 } },
        { meta: { changes: 501 } },
      ]);

      const result = await repository.deleteByLibraryBiblioIds(ids);

      expect(result).toBe(1500);
      expect(mockDb.prepare).toHaveBeenCalledTimes(2);
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
