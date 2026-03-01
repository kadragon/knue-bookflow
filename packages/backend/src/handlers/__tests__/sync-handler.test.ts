/**
 * Sync handler tests
 * Trace: spec_id: SPEC-bookinfo-001, SPEC-backend-refactor-001, task_id: TASK-032, TASK-073, TASK-074, TASK-081
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AladinClient } from '../../services/aladin-client';
import type { BookRepository } from '../../services/book-repository';
import { LibraryApiError } from '../../services/library-client';
import type { PlannedLoanRepository } from '../../services/planned-loan-repository';
import type { Charge, ChargeHistory, Env } from '../../types';
import {
  handleSyncBooks,
  parsePublication,
  processCharge,
  processChargeHistory,
  processChargesWithPlanningCleanup,
  syncBooksCore,
  syncRequestBooksToPlannedLoans,
} from '../sync-handler';

const mockLibraryClient = {
  login: vi.fn(),
  getCharges: vi.fn(),
  getChargeHistories: vi.fn(),
  getAllAcqRequests: vi.fn(),
};
const mockAladinClient = {
  lookupByIsbn: vi.fn(),
};
const mockBookRepository = {
  findByChargeId: vi.fn(),
  findByIsbn: vi.fn(),
  findByIsbnAndChargeDate: vi.fn(),
  saveBook: vi.fn(),
};
const mockPlannedLoanRepository = {
  findAllLibraryBiblioIds: vi.fn(),
  create: vi.fn(),
  deleteByLibraryBiblioId: vi.fn(),
  deleteByLibraryBiblioIds: vi.fn(),
};
const mockPlannedLoanDismissalRepository = {
  findAllLibraryBiblioIds: vi.fn(),
};

vi.mock('../../services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services')>();
  return {
    ...actual,
    createLibraryClient: () => mockLibraryClient,
    createAladinClient: () => mockAladinClient,
    createBookRepository: () => mockBookRepository,
    createPlannedLoanRepository: () => mockPlannedLoanRepository,
    createPlannedLoanDismissalRepository: () =>
      mockPlannedLoanDismissalRepository,
  };
});

const baseEnv: Env = {
  LIBRARY_USER_ID: 'user',
  LIBRARY_PASSWORD: 'pass' as never,
  ALADIN_API_KEY: 'key' as never,
  DB: {} as D1Database,
  ASSETS: {} as Fetcher,
  TELEGRAM_BOT_TOKEN: 'token',
  TELEGRAM_CHAT_ID: 'chatid',
  ENVIRONMENT: 'test',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPlannedLoanRepository.findAllLibraryBiblioIds.mockResolvedValue([]);
  mockPlannedLoanRepository.create.mockResolvedValue({});
  mockPlannedLoanDismissalRepository.findAllLibraryBiblioIds.mockResolvedValue(
    [],
  );
  mockLibraryClient.getAllAcqRequests.mockResolvedValue([]);
});

describe('handleSyncBooks error classification', () => {
  it('returns AUTH_FAILED when library auth fails', async () => {
    mockLibraryClient.login.mockRejectedValueOnce(
      new LibraryApiError('Unauthorized', 401),
    );

    const response = await handleSyncBooks(baseEnv);
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(401);
    expect(body.error).toBe('AUTH_FAILED');
    expect(body.message).toBe('Unauthorized');
  });

  it('returns LIBRARY_UNAVAILABLE when upstream is down', async () => {
    mockLibraryClient.login.mockRejectedValueOnce(
      new LibraryApiError('Service down', 503),
    );

    const response = await handleSyncBooks(baseEnv);
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(503);
    expect(body.error).toBe('LIBRARY_UNAVAILABLE');
    expect(body.message).toBe('Service down');
  });

  it('returns LIBRARY_ERROR when library responds with 4xx', async () => {
    mockLibraryClient.login.mockRejectedValueOnce(
      new LibraryApiError('Bad request', 400),
    );

    const response = await handleSyncBooks(baseEnv);
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(502);
    expect(body.error).toBe('LIBRARY_ERROR');
    expect(body.message).toBe('Bad request');
  });

  it('returns EXTERNAL_TIMEOUT for abort errors', async () => {
    mockLibraryClient.login.mockRejectedValueOnce(
      new DOMException('Aborted', 'AbortError'),
    );

    const response = await handleSyncBooks(baseEnv);
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(504);
    expect(body.error).toBe('EXTERNAL_TIMEOUT');
    expect(body.message).toBe('External request timed out');
  });

  it('returns UNKNOWN for unexpected errors', async () => {
    mockLibraryClient.login.mockRejectedValueOnce(new Error('boom'));

    const response = await handleSyncBooks(baseEnv);
    const body = (await response.json()) as { error: string; message: string };

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
      expect.anything(),
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
      null,
    );
  });
});

describe('parsePublication', () => {
  it('extracts publisher and year from standard Korean format', () => {
    expect(parsePublication('서울 : 테스트출판, 2025')).toEqual({
      publisher: '테스트출판',
      year: '2025',
    });
  });

  it('extracts publisher only when year is absent', () => {
    expect(parsePublication('서울 : 출판사')).toEqual({
      publisher: '출판사',
      year: null,
    });
  });

  it('returns nulls for null input', () => {
    expect(parsePublication(null)).toEqual({ publisher: null, year: null });
  });

  it('returns nulls when format does not match', () => {
    expect(parsePublication('출판사명만')).toEqual({
      publisher: null,
      year: null,
    });
  });
});

describe('syncRequestBooksToPlannedLoans', () => {
  it('adds only ON_SHELF request books and skips existing/dismissed biblios', async () => {
    const client = {
      getAllAcqRequests: vi.fn().mockResolvedValue([
        {
          id: 1,
          biblio: {
            id: 100,
            titleStatement: '배가완료 도서',
            author: '저자',
            publication: '서울 : 테스트출판, 2025',
            isbn: '9780000000001',
          },
          branch: {
            id: 1,
            name: '한국교원대학교도서관',
            alias: '한국',
            libraryCode: '243012',
            sortOrder: 1,
          },
          acqState: { id: 5, code: 'REGISTRATION', name: '등록' },
          itemState: { id: 5, code: 'ON_SHELF', name: '배가완료' },
          dateCreated: '2025-12-29 22:38:47',
          materialType: { id: 1, code: 'BK', name: '단행본', myParent: null },
        },
        {
          id: 2,
          biblio: {
            id: 101,
            titleStatement: '제외된 도서',
            author: '저자',
            publication: '서울 : 테스트출판, 2025',
            isbn: '9780000000002',
          },
          branch: null,
          acqState: null,
          itemState: { id: 6, code: 'LOAN', name: '대출중' },
          dateCreated: '2025-12-29 22:38:48',
          materialType: null,
        },
        {
          id: 3,
          biblio: {
            id: 200,
            titleStatement: '기존 planned',
            author: '저자',
            publication: '서울 : 테스트출판, 2025',
            isbn: '9780000000003',
          },
          branch: null,
          acqState: null,
          itemState: { id: 5, code: 'ON_SHELF', name: '배가완료' },
          dateCreated: '2025-12-29 22:38:49',
          materialType: null,
        },
        {
          id: 4,
          biblio: {
            id: 300,
            titleStatement: 'dismissed',
            author: '저자',
            publication: '서울 : 테스트출판, 2025',
            isbn: '9780000000004',
          },
          branch: null,
          acqState: null,
          itemState: { id: 5, code: 'ON_SHELF', name: '배가완료' },
          dateCreated: '2025-12-29 22:38:50',
          materialType: null,
        },
      ]),
    };
    const plannedRepo = {
      findAllLibraryBiblioIds: vi.fn().mockResolvedValue([200]),
      create: vi.fn().mockResolvedValue({}),
    };
    const dismissalRepo = {
      findAllLibraryBiblioIds: vi.fn().mockResolvedValue([300]),
    };

    const added = await syncRequestBooksToPlannedLoans(
      client as never,
      plannedRepo as never,
      dismissalRepo as never,
      createMockAladinClient(null),
    );

    expect(added).toBe(1);
    expect(plannedRepo.create).toHaveBeenCalledTimes(1);
    expect(plannedRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        author: '저자',
        library_biblio_id: 100,
        source: 'request_book',
      }),
    );
  });

  it('trims request book author before saving', async () => {
    const client = {
      getAllAcqRequests: vi.fn().mockResolvedValue([
        {
          id: 1,
          biblio: {
            id: 500,
            titleStatement: '공백 저자',
            author: '  저자 공백  ',
            publication: '서울 : 테스트출판, 2025',
            isbn: '9780000000500',
          },
          branch: null,
          acqState: null,
          itemState: { id: 5, code: 'ON_SHELF', name: '배가완료' },
          dateCreated: '2025-12-29 22:38:47',
          materialType: null,
        },
      ]),
    };
    const plannedRepo = {
      findAllLibraryBiblioIds: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    };
    const dismissalRepo = {
      findAllLibraryBiblioIds: vi.fn().mockResolvedValue([]),
    };

    await syncRequestBooksToPlannedLoans(
      client as never,
      plannedRepo as never,
      dismissalRepo as never,
      createMockAladinClient(null),
    );

    expect(plannedRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        author: '저자 공백',
        library_biblio_id: 500,
      }),
    );
  });

  it('fetches cover_url from Aladin when ISBN is present', async () => {
    const client = {
      getAllAcqRequests: vi.fn().mockResolvedValue([
        {
          id: 1,
          biblio: {
            id: 100,
            titleStatement: '표지 테스트',
            author: '저자',
            publication: '서울 : 테스트출판, 2025',
            isbn: '9781234567890',
          },
          branch: null,
          acqState: null,
          itemState: { id: 5, code: 'ON_SHELF', name: '배가완료' },
          dateCreated: '2025-12-29 22:38:47',
          materialType: null,
        },
      ]),
    };
    const plannedRepo = {
      findAllLibraryBiblioIds: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    };
    const dismissalRepo = {
      findAllLibraryBiblioIds: vi.fn().mockResolvedValue([]),
    };
    const aladinMock = createMockAladinClient({
      coverUrl: 'https://covers.aladin.co.kr/test.jpg',
    });

    await syncRequestBooksToPlannedLoans(
      client as never,
      plannedRepo as never,
      dismissalRepo as never,
      aladinMock,
    );

    expect(aladinMock.lookupByIsbn).toHaveBeenCalledWith('9781234567890');
    expect(plannedRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        cover_url: 'https://covers.aladin.co.kr/test.jpg',
      }),
    );
  });

  it('skips Aladin lookup and sets cover_url null when ISBN is null', async () => {
    const client = {
      getAllAcqRequests: vi.fn().mockResolvedValue([
        {
          id: 1,
          biblio: {
            id: 100,
            titleStatement: 'ISBN 없는 도서',
            author: '저자',
            publication: '서울 : 테스트출판, 2025',
            isbn: null,
          },
          branch: null,
          acqState: null,
          itemState: { id: 5, code: 'ON_SHELF', name: '배가완료' },
          dateCreated: '2025-12-29 22:38:47',
          materialType: null,
        },
      ]),
    };
    const plannedRepo = {
      findAllLibraryBiblioIds: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    };
    const dismissalRepo = {
      findAllLibraryBiblioIds: vi.fn().mockResolvedValue([]),
    };
    const aladinMock = createMockAladinClient(null);

    await syncRequestBooksToPlannedLoans(
      client as never,
      plannedRepo as never,
      dismissalRepo as never,
      aladinMock,
    );

    expect(aladinMock.lookupByIsbn).not.toHaveBeenCalled();
    expect(plannedRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        cover_url: null,
      }),
    );
  });

  it('sets cover_url null when Aladin lookup fails', async () => {
    const client = {
      getAllAcqRequests: vi.fn().mockResolvedValue([
        {
          id: 1,
          biblio: {
            id: 100,
            titleStatement: 'Aladin 실패 도서',
            author: '저자',
            publication: '서울 : 테스트출판, 2025',
            isbn: '9781234567890',
          },
          branch: null,
          acqState: null,
          itemState: { id: 5, code: 'ON_SHELF', name: '배가완료' },
          dateCreated: '2025-12-29 22:38:47',
          materialType: null,
        },
      ]),
    };
    const plannedRepo = {
      findAllLibraryBiblioIds: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    };
    const dismissalRepo = {
      findAllLibraryBiblioIds: vi.fn().mockResolvedValue([]),
    };
    const aladinMock = {
      lookupByIsbn: vi.fn().mockRejectedValue(new Error('Aladin API error')),
    } as unknown as AladinClient;

    const added = await syncRequestBooksToPlannedLoans(
      client as never,
      plannedRepo as never,
      dismissalRepo as never,
      aladinMock,
    );

    expect(added).toBe(1);
    expect(aladinMock.lookupByIsbn).toHaveBeenCalledWith('9781234567890');
    expect(plannedRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        cover_url: null,
      }),
    );
  });
});

describe('processChargesWithPlanningCleanup', () => {
  it('deduplicates planned loan deletions by biblio id', async () => {
    const charges = [
      createMockCharge({
        id: 1,
        biblio: {
          id: 99,
          isbn: '9781',
          titleStatement: 'Book 1',
          thumbnail: null,
        },
      }),
      createMockCharge({
        id: 2,
        biblio: {
          id: 99,
          isbn: '9781',
          titleStatement: 'Book 1',
          thumbnail: null,
        },
      }),
      createMockCharge({
        id: 3,
        biblio: {
          id: 100,
          isbn: '9782',
          titleStatement: 'Book 2',
          thumbnail: null,
        },
      }),
    ];

    const mockBookRepository = createMockBookRepository(null);
    const mockAladinClient = createMockAladinClient(null);
    const plannedRepo = {
      deleteByLibraryBiblioIds: vi.fn().mockResolvedValue(2),
    } as unknown as PlannedLoanRepository;

    await processChargesWithPlanningCleanup(
      charges,
      mockBookRepository,
      mockAladinClient,
      plannedRepo,
    );

    expect(plannedRepo.deleteByLibraryBiblioIds).toHaveBeenCalledTimes(1);
    expect(plannedRepo.deleteByLibraryBiblioIds).toHaveBeenCalledWith([
      99, 100,
    ]);
  });
});

describe('syncBooksCore request book sync behavior', () => {
  it('runs request-book sync even when there are no charges', async () => {
    mockLibraryClient.login.mockResolvedValue(undefined);
    mockLibraryClient.getCharges.mockResolvedValue([]);
    mockLibraryClient.getAllAcqRequests.mockResolvedValue([
      {
        id: 1,
        biblio: {
          id: 700,
          titleStatement: '희망도서',
          author: null,
          publication: null,
          isbn: null,
        },
        branch: null,
        acqState: null,
        itemState: { id: 5, code: 'ON_SHELF', name: '배가완료' },
        dateCreated: '2025-12-29 22:38:47',
        materialType: null,
      },
    ]);

    const summary = await syncBooksCore(baseEnv);

    expect(summary.total_charges).toBe(0);
    expect(mockPlannedLoanRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        library_biblio_id: 700,
        source: 'request_book',
      }),
    );
  });

  it('continues main sync when request-book sync fails', async () => {
    mockLibraryClient.login.mockResolvedValue(undefined);
    mockLibraryClient.getCharges.mockResolvedValue([
      createMockCharge({ id: 10 }),
    ]);
    mockLibraryClient.getChargeHistories.mockResolvedValue([]);
    mockLibraryClient.getAllAcqRequests.mockRejectedValue(
      new Error('acq failed'),
    );
    mockBookRepository.findByChargeId.mockResolvedValue(null);
    mockBookRepository.saveBook.mockResolvedValue(undefined);
    mockAladinClient.lookupByIsbn.mockResolvedValue(null);

    const summary = await syncBooksCore(baseEnv);

    expect(summary.total_charges).toBe(1);
    expect(summary.added).toBe(1);
    expect(mockBookRepository.saveBook).toHaveBeenCalled();
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
      findByIsbnAndChargeDate: vi.fn(),
      saveBook: vi.fn(),
    } as unknown as BookRepository;

    const status = await processChargeHistory(history, mockBookRepository);

    expect(status).toBe('returned');
    expect(mockBookRepository.saveBook).toHaveBeenCalledWith(
      expect.objectContaining({
        charge_id: String(history.id),
        discharge_date: '2025-09-16 00:00:00',
      }),
      existingRecord,
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
      findByIsbn: vi.fn(),
      findByIsbnAndChargeDate: vi.fn().mockResolvedValue(existingRecord),
      saveBook: vi.fn(),
    } as unknown as BookRepository;

    const status = await processChargeHistory(history, mockBookRepository);

    expect(status).toBe('returned');
    expect(mockBookRepository.findByIsbnAndChargeDate).toHaveBeenCalledWith(
      history.biblio.isbn,
      history.chargeDate,
    );
    expect(mockBookRepository.saveBook).toHaveBeenCalledWith(
      expect.objectContaining({
        discharge_date: '2025-09-17 00:00:00',
      }),
      existingRecord,
    );
  });

  it('skips when ISBN+chargeDate fallback has no match', async () => {
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

    const mockBookRepository = {
      findByChargeId: vi.fn().mockResolvedValue(null),
      findByIsbn: vi.fn(),
      findByIsbnAndChargeDate: vi.fn().mockResolvedValue(null),
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
      findByIsbnAndChargeDate: vi.fn(),
      saveBook: vi.fn(),
    } as unknown as BookRepository;

    const status = await processChargeHistory(history, mockBookRepository);

    expect(status).toBe('unchanged');
    expect(mockBookRepository.saveBook).not.toHaveBeenCalled();
  });
});
