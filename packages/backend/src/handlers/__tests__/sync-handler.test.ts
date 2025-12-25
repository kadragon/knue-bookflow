/**
 * Sync handler tests
 * Trace: spec_id: SPEC-bookinfo-001, SPEC-backend-refactor-001, task_id: TASK-032, TASK-073, TASK-074
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AladinClient } from '../../services/aladin-client';
import type { BookRepository } from '../../services/book-repository';
import type { PlannedLoanRepository } from '../../services/planned-loan-repository';
import type { Charge, ChargeHistory } from '../../types';
import type { Env } from '../../types';
import { LibraryApiError } from '../../services/library-client';
import {
  handleSyncBooks,
  processCharge,
  processChargeHistory,
  processChargesWithPlanningCleanup,
} from '../sync-handler';

const mockLibraryClient = {
  login: vi.fn(),
  getCharges: vi.fn(),
  getChargeHistories: vi.fn(),
};
const mockAladinClient = {
  lookupByIsbn: vi.fn(),
};
const mockBookRepository = {
  findByChargeId: vi.fn(),
  findByIsbn: vi.fn(),
  saveBook: vi.fn(),
};
const mockPlannedLoanRepository = {
  deleteByLibraryBiblioId: vi.fn(),
};

vi.mock('../../services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services')>();
  return {
    ...actual,
    createLibraryClient: () => mockLibraryClient,
    createAladinClient: () => mockAladinClient,
    createBookRepository: () => mockBookRepository,
    createPlannedLoanRepository: () => mockPlannedLoanRepository,
  };
});

const baseEnv: Env = {
  LIBRARY_USER_ID: 'user',
  LIBRARY_PASSWORD: 'pass',
  ALADIN_API_KEY: 'key',
  DB: {} as D1Database,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleSyncBooks error classification', () => {
  it('returns AUTH_FAILED when library auth fails', async () => {
    mockLibraryClient.login.mockRejectedValueOnce(
      new LibraryApiError('Unauthorized', 401),
    );

    const response = await handleSyncBooks(baseEnv);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('AUTH_FAILED');
    expect(body.message).toBe('Unauthorized');
  });

  it('returns LIBRARY_UNAVAILABLE when upstream is down', async () => {
    mockLibraryClient.login.mockRejectedValueOnce(
      new LibraryApiError('Service down', 503),
    );

    const response = await handleSyncBooks(baseEnv);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe('LIBRARY_UNAVAILABLE');
    expect(body.message).toBe('Service down');
  });

  it('returns UNKNOWN for unexpected errors', async () => {
    mockLibraryClient.login.mockRejectedValueOnce(new Error('boom'));

    const response = await handleSyncBooks(baseEnv);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('UNKNOWN');
    expect(body.message).toBe('boom');
  });
});

function createMockCharge(overrides: Partial<Charge> = {}): Charge {
  const defaultBiblio = {
    id: 1,
    titleStatement: 'Test Book',
    isbn: '9781234567890',
    thumbnail: null,
  };

  return {
    id: overrides.id ?? 1,
    barcode: '123456',
    biblio: overrides.biblio
      ? { ...defaultBiblio, ...overrides.biblio }
      : defaultBiblio,
    branch: {
      id: 1,
      name: 'Test Branch',
      alias: 'TB',
      libraryCode: '123',
      sortOrder: 1,
    },
    callNo: '000',
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

function createMockChargeHistory(
  overrides: Partial<ChargeHistory> = {},
): ChargeHistory {
  return {
    id: overrides.id ?? 1,
    barcode: overrides.barcode ?? '123456',
    biblio: overrides.biblio ?? {
      id: 1,
      titleStatement: 'Test Book',
      isbn: '9781234567890',
      thumbnail: null,
    },
    chargeDate: overrides.chargeDate ?? '2025-01-01',
    dueDate: overrides.dueDate ?? '2025-01-15',
    dischargeDate: overrides.dischargeDate ?? '2025-01-20',
    chargeType:
      overrides.chargeType ??
      ({
        id: 1,
        name: '일반대출',
      } as ChargeHistory['chargeType']),
    dischargeType:
      overrides.dischargeType ??
      ({
        id: 1,
        name: '정상반납',
        code: 'RETURN',
      } as ChargeHistory['dischargeType']),
    supplementNote: overrides.supplementNote ?? null,
  };
}

function createMockBookRepository(existing: unknown) {
  return {
    findByChargeId: vi.fn().mockResolvedValue(existing),
    saveBook: vi.fn(),
  } as unknown as BookRepository;
}

function createMockAladinClient(result: unknown) {
  return {
    lookupByIsbn: vi.fn().mockResolvedValue(result),
  } as unknown as AladinClient;
}

const mockAladinResponse = {
  isbn: '9781234567890',
  isbn13: '9781234567890',
  title: 'Test Book',
  author: 'Author',
  publisher: 'Publisher',
  pubDate: '2025-01-01',
  description: 'Desc',
  coverUrl: 'https://covers.aladin.co.kr/Big/9781234567890.jpg',
};

describe('processCharge', () => {
  it('recovers metadata when existing record has no cover_url', async () => {
    const charge = createMockCharge();

    const mockBookRepository = createMockBookRepository({
      id: 10,
      charge_id: String(charge.id),
      isbn: charge.biblio.isbn,
      title: charge.biblio.titleStatement,
      author: 'Author',
      publisher: 'Publisher',
      cover_url: null,
      description: null,
      charge_date: charge.chargeDate,
      due_date: charge.dueDate,
      renew_count: charge.renewCnt,
      is_read: 0,
    });

    const mockAladinClient = createMockAladinClient(mockAladinResponse);

    const status = await processCharge(
      charge,
      mockBookRepository,
      mockAladinClient,
    );

    expect(status).toBe('updated');
    expect(mockAladinClient.lookupByIsbn).toHaveBeenCalledWith(
      charge.biblio.isbn,
    );
    expect(mockBookRepository.saveBook).toHaveBeenCalledWith(
      expect.objectContaining({
        cover_url: 'https://covers.aladin.co.kr/Big/9781234567890.jpg',
      }),
    );
  });

  it('skips Aladin lookup when cover already exists', async () => {
    const charge = createMockCharge();

    const mockBookRepository = createMockBookRepository({
      id: 10,
      charge_id: String(charge.id),
      isbn: charge.biblio.isbn,
      title: charge.biblio.titleStatement,
      author: 'Author',
      publisher: 'Publisher',
      cover_url: 'https://existing-cover.jpg',
      description: 'Existing desc',
      charge_date: charge.chargeDate,
      due_date: charge.dueDate,
      renew_count: charge.renewCnt,
      is_read: 0,
    });

    const mockAladinClient = createMockAladinClient(mockAladinResponse);

    const status = await processCharge(
      charge,
      mockBookRepository,
      mockAladinClient,
    );

    expect(status).toBe('unchanged');
    expect(mockAladinClient.lookupByIsbn).not.toHaveBeenCalled();
    expect(mockBookRepository.saveBook).not.toHaveBeenCalled();
  });

  it('updates when due_date changes', async () => {
    const charge = createMockCharge({ dueDate: '2025-01-22' });

    const mockBookRepository = createMockBookRepository({
      id: 10,
      charge_id: String(charge.id),
      isbn: charge.biblio.isbn,
      title: charge.biblio.titleStatement,
      author: 'Author',
      publisher: 'Publisher',
      cover_url: 'https://existing-cover.jpg',
      description: 'Existing desc',
      charge_date: charge.chargeDate,
      due_date: '2025-01-15',
      renew_count: charge.renewCnt,
      is_read: 0,
    });

    const mockAladinClient = createMockAladinClient(mockAladinResponse);

    const status = await processCharge(
      charge,
      mockBookRepository,
      mockAladinClient,
    );

    expect(status).toBe('updated');
    expect(mockAladinClient.lookupByIsbn).not.toHaveBeenCalled();
    expect(mockBookRepository.saveBook).toHaveBeenCalled();
  });

  it('does not delete planned loans within processCharge (handled in batch cleanup)', async () => {
    const charge = createMockCharge({ id: 777 });

    const mockBookRepository = createMockBookRepository(null);
    const mockAladinClient = createMockAladinClient(null);

    await processCharge(charge, mockBookRepository, mockAladinClient);

    expect(mockBookRepository.saveBook).toHaveBeenCalled();
  });

  it('returns unchanged when Aladin returns null for metadata recovery', async () => {
    const charge = createMockCharge();

    const mockBookRepository = createMockBookRepository({
      id: 10,
      charge_id: String(charge.id),
      isbn: charge.biblio.isbn,
      title: charge.biblio.titleStatement,
      author: 'Author',
      publisher: 'Publisher',
      cover_url: null,
      description: null,
      charge_date: charge.chargeDate,
      due_date: charge.dueDate,
      renew_count: charge.renewCnt,
      is_read: 0,
    });

    const mockAladinClient = createMockAladinClient(null);

    const status = await processCharge(
      charge,
      mockBookRepository,
      mockAladinClient,
    );

    expect(status).toBe('unchanged');
    expect(mockAladinClient.lookupByIsbn).toHaveBeenCalled();
    expect(mockBookRepository.saveBook).not.toHaveBeenCalled();
  });

  it('skips Aladin lookup when book has no ISBN', async () => {
    const charge = createMockCharge({
      biblio: {
        id: 1,
        titleStatement: 'No ISBN Book',
        isbn: '',
        thumbnail: null,
      },
    });

    const mockBookRepository = createMockBookRepository({
      id: 10,
      charge_id: String(charge.id),
      isbn: '',
      title: charge.biblio.titleStatement,
      author: 'Author',
      publisher: 'Publisher',
      cover_url: null,
      description: null,
      charge_date: charge.chargeDate,
      due_date: charge.dueDate,
      renew_count: charge.renewCnt,
      is_read: 0,
    });

    const mockAladinClient = createMockAladinClient(mockAladinResponse);

    const status = await processCharge(
      charge,
      mockBookRepository,
      mockAladinClient,
    );

    expect(status).toBe('unchanged');
    expect(mockAladinClient.lookupByIsbn).not.toHaveBeenCalled();
  });

  it('adds new book with Aladin metadata', async () => {
    const charge = createMockCharge();
    const mockBookRepository = createMockBookRepository(null);
    const mockAladinClient = createMockAladinClient(mockAladinResponse);

    const status = await processCharge(
      charge,
      mockBookRepository,
      mockAladinClient,
    );

    expect(status).toBe('added');
    expect(mockAladinClient.lookupByIsbn).toHaveBeenCalledWith(
      charge.biblio.isbn,
    );
    expect(mockBookRepository.saveBook).toHaveBeenCalledWith(
      expect.objectContaining({
        cover_url: mockAladinResponse.coverUrl,
        description: mockAladinResponse.description,
      }),
    );
  });
});

describe('processChargesWithPlanningCleanup', () => {
  it('deduplicates planned loan deletions by biblio id', async () => {
    const charges = [
      createMockCharge({ id: 1, biblio: { id: 99, isbn: '9781' } }),
      createMockCharge({ id: 2, biblio: { id: 99, isbn: '9781' } }),
      createMockCharge({ id: 3, biblio: { id: 100, isbn: '9782' } }),
    ];

    const mockBookRepository = createMockBookRepository(null);
    const mockAladinClient = createMockAladinClient(null);
    const plannedRepo = {
      deleteByLibraryBiblioId: vi.fn().mockResolvedValue(true),
    } as unknown as PlannedLoanRepository;

    await processChargesWithPlanningCleanup(
      charges,
      mockBookRepository,
      mockAladinClient,
      plannedRepo,
    );

    expect(plannedRepo.deleteByLibraryBiblioId).toHaveBeenCalledTimes(2);
    expect(plannedRepo.deleteByLibraryBiblioId).toHaveBeenCalledWith(99);
    expect(plannedRepo.deleteByLibraryBiblioId).toHaveBeenCalledWith(100);
  });
});

describe('processChargeHistory', () => {
  it('marks book as returned using charge_id match', async () => {
    const history = createMockChargeHistory({
      id: 999,
      dischargeDate: '2025-09-16 00:00:00',
    });

    const existingRecord = {
      id: 10,
      charge_id: String(history.id),
      isbn: history.biblio.isbn,
      isbn13: null,
      title: history.biblio.titleStatement,
      author: 'Author',
      publisher: 'Publisher',
      cover_url: 'https://existing-cover.jpg',
      description: 'Existing desc',
      pub_date: null,
      charge_date: history.chargeDate,
      due_date: history.dueDate,
      discharge_date: null,
      renew_count: 0,
      is_read: 0,
    };

    const mockBookRepository = {
      findByChargeId: vi.fn().mockResolvedValue(existingRecord),
      findByIsbn: vi.fn(),
      saveBook: vi.fn(),
    } as unknown as BookRepository;

    const status = await processChargeHistory(history, mockBookRepository);

    expect(status).toBe('returned');
    expect(mockBookRepository.saveBook).toHaveBeenCalledWith(
      expect.objectContaining({
        charge_id: String(history.id),
        discharge_date: '2025-09-16 00:00:00',
      }),
    );
  });

  it('falls back to ISBN match with chargeDate comparison when charge_id is unknown', async () => {
    const history = createMockChargeHistory({
      id: 777,
      chargeDate: '2025-01-01',
      dischargeDate: '2025-09-17 00:00:00',
      biblio: {
        id: 2,
        titleStatement: 'No Charge Match',
        isbn: '9780000000002',
        thumbnail: null,
      },
    });

    const existingRecord = {
      id: 11,
      charge_id: 'other',
      isbn: '9780000000002',
      isbn13: null,
      title: 'No Charge Match',
      author: 'Author',
      publisher: 'Publisher',
      cover_url: null,
      description: null,
      pub_date: null,
      charge_date: '2025-01-01', // Must match history.chargeDate
      due_date: history.dueDate,
      discharge_date: null,
      renew_count: 0,
      is_read: 0,
    };

    const mockBookRepository = {
      findByChargeId: vi.fn().mockResolvedValue(null),
      findByIsbn: vi.fn().mockResolvedValue([existingRecord]),
      saveBook: vi.fn(),
    } as unknown as BookRepository;

    const status = await processChargeHistory(history, mockBookRepository);

    expect(status).toBe('returned');
    expect(mockBookRepository.findByIsbn).toHaveBeenCalledWith(
      history.biblio.isbn,
      10,
    );
    expect(mockBookRepository.saveBook).toHaveBeenCalledWith(
      expect.objectContaining({
        discharge_date: '2025-09-17 00:00:00',
      }),
    );
  });

  it('skips ISBN match when chargeDate does not match', async () => {
    const history = createMockChargeHistory({
      id: 888,
      chargeDate: '2025-01-01',
      dischargeDate: '2025-09-18 00:00:00',
      biblio: {
        id: 3,
        titleStatement: 'Different Loan Cycle',
        isbn: '9780000000003',
        thumbnail: null,
      },
    });

    const existingRecord = {
      id: 13,
      charge_id: 'other',
      isbn: '9780000000003',
      isbn13: null,
      title: 'Different Loan Cycle',
      author: 'Author',
      publisher: 'Publisher',
      cover_url: null,
      description: null,
      pub_date: null,
      charge_date: '2025-06-01', // Different chargeDate - should not match
      due_date: '2025-06-15',
      discharge_date: null,
      renew_count: 0,
      is_read: 0,
    };

    const mockBookRepository = {
      findByChargeId: vi.fn().mockResolvedValue(null),
      findByIsbn: vi.fn().mockResolvedValue([existingRecord]),
      saveBook: vi.fn(),
    } as unknown as BookRepository;

    const status = await processChargeHistory(history, mockBookRepository);

    expect(status).toBe('unchanged');
    expect(mockBookRepository.saveBook).not.toHaveBeenCalled();
  });

  it('ignores already returned books', async () => {
    const history = createMockChargeHistory({
      dischargeDate: '2025-09-18 00:00:00',
    });

    const existingRecord = {
      id: 12,
      charge_id: String(history.id),
      isbn: history.biblio.isbn,
      isbn13: null,
      title: history.biblio.titleStatement,
      author: 'Author',
      publisher: 'Publisher',
      cover_url: null,
      description: null,
      pub_date: null,
      charge_date: history.chargeDate,
      due_date: history.dueDate,
      discharge_date: '2025-09-18 00:00:00',
      renew_count: 0,
      is_read: 0,
    };

    const mockBookRepository = {
      findByChargeId: vi.fn().mockResolvedValue(existingRecord),
      findByIsbn: vi.fn(),
      saveBook: vi.fn(),
    } as unknown as BookRepository;

    const status = await processChargeHistory(history, mockBookRepository);

    expect(status).toBe('unchanged');
    expect(mockBookRepository.saveBook).not.toHaveBeenCalled();
  });
});
