/**
 * Book repository tests
 * Trace: spec_id: SPEC-storage-001, task_id: TASK-009
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookInfo, BookRecord, Charge, RenewalLog } from '../../types';
import {
  BookRepository,
  createBookRecord,
  createBookRepository,
} from '../book-repository';

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

// Test data factories
function createMockCharge(
  overrides: Partial<{
    id: number;
    renewCnt: number;
    chargeDate: string;
    dueDate: string;
    title: string;
    author: string;
    isbn: string;
  }> = {},
): Charge {
  return {
    id: overrides.id ?? 1,
    barcode: '123456',
    biblio: {
      id: 1,
      titleStatement: overrides.title ?? 'Test Book',
      isbn: overrides.isbn ?? '9781234567890',
      thumbnail: null,
    },
    branch: {
      id: 1,
      name: 'Test Library',
      alias: 'Test',
      libraryCode: '123456',
      sortOrder: 1,
    },
    callNo: '000.00',
    chargeDate: overrides.chargeDate ?? '2025-01-01',
    dueDate: overrides.dueDate ?? '2025-01-15',
    overdueDays: 0,
    renewCnt: overrides.renewCnt ?? 0,
    holdCnt: 0,
    isMediaCharge: false,
    supplementNote: null,
    isRenewed: false,
    isRenewable: true,
  };
}

function createMockBookInfo(overrides: Partial<BookInfo> = {}): BookInfo {
  return {
    isbn: overrides.isbn ?? '1234567890',
    isbn13: overrides.isbn13 ?? '9781234567890',
    title: overrides.title ?? 'Clean Code',
    author: overrides.author ?? 'Robert C. Martin',
    publisher: overrides.publisher ?? 'Prentice Hall',
    pubDate: overrides.pubDate ?? '2008-08-01',
    description:
      overrides.description ?? 'A handbook of agile software craftsmanship',
    coverUrl: overrides.coverUrl ?? 'https://example.com/cover.jpg',
    categoryName: overrides.categoryName ?? 'Programming',
  };
}

function createMockBookRecord(overrides: Partial<BookRecord> = {}): BookRecord {
  return {
    id: overrides.id ?? 1,
    charge_id: overrides.charge_id ?? '1',
    isbn: overrides.isbn ?? '9781234567890',
    title: overrides.title ?? 'Test Book',
    author: overrides.author ?? 'Test Author',
    publisher: overrides.publisher ?? 'Test Publisher',
    cover_url: overrides.cover_url ?? 'https://example.com/cover.jpg',
    description: overrides.description ?? 'A test book description',
    charge_date: overrides.charge_date ?? '2025-01-01',
    due_date: overrides.due_date ?? '2025-01-15',
    renew_count: overrides.renew_count ?? 0,
    is_read: overrides.is_read ?? 0,
    created_at: overrides.created_at ?? '2025-01-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2025-01-01T00:00:00Z',
  };
}

describe('BookRepository', () => {
  let mockDb: D1Database;
  let repository: BookRepository;

  beforeEach(() => {
    mockDb = createMockD1();
    repository = new BookRepository(mockDb);
  });

  describe('saveBook', () => {
    it('should insert new book when not exists', async () => {
      const record = createMockBookRecord({ charge_id: '123' });

      // Mock findByChargeId returning null (not found)
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      await repository.saveBook(record);

      // Should call prepare twice: once for SELECT, once for INSERT
      expect(mockDb.prepare).toHaveBeenCalledTimes(2);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM books WHERE charge_id = ?',
      );
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO books'),
      );
    });

    it('should update existing book when found', async () => {
      const existingRecord = createMockBookRecord({ charge_id: '123' });
      const updatedRecord = createMockBookRecord({
        charge_id: '123',
        due_date: '2025-01-22',
        renew_count: 1,
      });

      // Mock findByChargeId returning existing record
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(existingRecord),
        run: vi.fn().mockResolvedValue({ success: true }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      await repository.saveBook(updatedRecord);

      // Should call prepare twice: once for SELECT, once for UPDATE
      expect(mockDb.prepare).toHaveBeenCalledTimes(2);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE books SET'),
      );
    });

    it('should update cover_url when provided', async () => {
      const existingRecord = createMockBookRecord({
        charge_id: '123',
        cover_url: null,
        description: null,
      });

      const updatedRecord = createMockBookRecord({
        charge_id: '123',
        due_date: '2025-01-15',
        renew_count: 0,
        cover_url: 'https://covers.aladin.co.kr/Big/1234567890.jpg',
        description: 'Updated description',
      });

      const mockBindSelect = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(existingRecord),
      });

      const mockRun = vi.fn().mockResolvedValue({ success: true });
      const mockBindUpdate = vi.fn().mockReturnValue({ run: mockRun });

      (mockDb.prepare as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({ bind: mockBindSelect })
        .mockReturnValueOnce({ bind: mockBindUpdate });

      await repository.saveBook(updatedRecord);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE books SET'),
      );

      expect(mockBindUpdate).toHaveBeenCalledWith(
        updatedRecord.due_date,
        updatedRecord.renew_count,
        updatedRecord.is_read,
        updatedRecord.cover_url,
        updatedRecord.description,
        expect.any(String),
        updatedRecord.charge_id,
      );
    });
  });

  describe('findByChargeId', () => {
    it('should return book record when found', async () => {
      const mockRecord = createMockBookRecord({ charge_id: '123' });

      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(mockRecord),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.findByChargeId('123');

      expect(result).toEqual(mockRecord);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM books WHERE charge_id = ?',
      );
      expect(mockBind).toHaveBeenCalledWith('123');
    });

    it('should return null when not found', async () => {
      const mockBind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.findByChargeId('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByIsbn', () => {
    it('should return array of book records', async () => {
      const mockRecords = [
        createMockBookRecord({ charge_id: '1', isbn: '9781234567890' }),
        createMockBookRecord({ charge_id: '2', isbn: '9781234567890' }),
      ];

      const mockBind = vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: mockRecords }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.findByIsbn('9781234567890');

      expect(result).toHaveLength(2);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM books WHERE isbn = ? ORDER BY charge_date DESC',
      );
    });

    it('should return empty array when no records found', async () => {
      const mockBind = vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [] }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.findByIsbn('nonexistent');

      expect(result).toHaveLength(0);
    });
  });

  describe('findAll', () => {
    it('should return all book records sorted by charge date', async () => {
      const mockRecords = [
        createMockBookRecord({ charge_id: '1', charge_date: '2025-01-02' }),
        createMockBookRecord({ charge_id: '2', charge_date: '2025-01-01' }),
      ];

      // findAll calls .all() directly without .bind()
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: mockRecords }),
      });

      const result = await repository.findAll();

      expect(result).toHaveLength(2);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM books ORDER BY charge_date DESC',
      );
    });

    it('should return empty array when no records', async () => {
      // findAll calls .all() directly without .bind()
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [] }),
      });

      const result = await repository.findAll();

      expect(result).toHaveLength(0);
    });
  });

  describe('logRenewal', () => {
    it('should insert renewal log entry', async () => {
      const log: RenewalLog = {
        charge_id: '123',
        action: 'renewal_success',
        status: 'success',
        message: 'Renewed until 2025-01-22',
      };

      const mockBind = vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({ success: true }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      await repository.logRenewal(log);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO renewal_logs'),
      );
      expect(mockBind).toHaveBeenCalledWith(
        '123',
        'renewal_success',
        'success',
        'Renewed until 2025-01-22',
        expect.any(String), // created_at timestamp
      );
    });

    it('should log failure status', async () => {
      const log: RenewalLog = {
        charge_id: '456',
        action: 'renewal_failure',
        status: 'failure',
        message: 'Book is reserved',
      };

      const mockBind = vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({ success: true }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      await repository.logRenewal(log);

      expect(mockBind).toHaveBeenCalledWith(
        '456',
        'renewal_failure',
        'failure',
        'Book is reserved',
        expect.any(String),
      );
    });
  });

  describe('getRenewalLogs', () => {
    it('should return renewal logs for charge', async () => {
      const mockLogs: RenewalLog[] = [
        {
          id: 1,
          charge_id: '123',
          action: 'renewal_success',
          status: 'success',
          message: 'Renewed',
          created_at: '2025-01-15T10:00:00Z',
        },
        {
          id: 2,
          charge_id: '123',
          action: 'renewal_attempt',
          status: 'success',
          message: 'Attempting renewal',
          created_at: '2025-01-14T10:00:00Z',
        },
      ];

      const mockBind = vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: mockLogs }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.getRenewalLogs('123');

      expect(result).toHaveLength(2);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM renewal_logs WHERE charge_id = ? ORDER BY created_at DESC',
      );
      expect(mockBind).toHaveBeenCalledWith('123');
    });

    it('should return empty array when no logs', async () => {
      const mockBind = vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [] }),
      });
      (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: mockBind,
      });

      const result = await repository.getRenewalLogs('nonexistent');

      expect(result).toHaveLength(0);
    });
  });
});

describe('createBookRecord', () => {
  it('should create record from charge without book info', () => {
    const charge = createMockCharge({
      id: 123,
      title: 'Library Book',
      isbn: '9780123456789',
      chargeDate: '2025-01-01',
      dueDate: '2025-01-15',
      renewCnt: 0,
    });

    const record = createBookRecord(charge);

    expect(record).toEqual({
      charge_id: '123',
      isbn: '9780123456789',
      title: 'Library Book',
      author: '', // API doesn't provide author
      publisher: null,
      cover_url: null,
      description: null,
      charge_date: '2025-01-01',
      due_date: '2025-01-15',
      renew_count: 0,
    });
  });

  it('should create record with enriched book info from Aladin', () => {
    const charge = createMockCharge({
      id: 456,
      title: 'Library Title',
      author: 'Library Author',
      isbn: '9780123456789',
    });

    const bookInfo = createMockBookInfo({
      title: 'Enriched Title',
      author: 'Enriched Author',
      publisher: 'Great Publisher',
      coverUrl: 'https://cover.example.com/book.jpg',
      description: 'A great book description',
    });

    const record = createBookRecord(charge, bookInfo);

    expect(record.title).toBe('Enriched Title');
    expect(record.author).toBe('Enriched Author');
    expect(record.publisher).toBe('Great Publisher');
    expect(record.cover_url).toBe('https://cover.example.com/book.jpg');
    expect(record.description).toBe('A great book description');
  });

  it('should fallback to charge data when book info is null', () => {
    const charge = createMockCharge({
      id: 789,
      title: 'Fallback Title',
    });

    const record = createBookRecord(charge, null);

    expect(record.title).toBe('Fallback Title');
    expect(record.author).toBe(''); // API doesn't provide author
    expect(record.publisher).toBeNull();
  });

  it('should use book info ISBN when charge ISBN is empty', () => {
    const charge = createMockCharge({
      id: 101,
      isbn: '',
    });

    const bookInfo = createMockBookInfo({
      isbn: '9999999999',
    });

    const record = createBookRecord(charge, bookInfo);

    expect(record.isbn).toBe('9999999999');
  });
});

describe('createBookRepository', () => {
  it('should create repository instance', () => {
    const mockDb = createMockD1();
    const repository = createBookRepository(mockDb);

    expect(repository).toBeInstanceOf(BookRepository);
  });
});
