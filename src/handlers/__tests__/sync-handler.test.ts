/**
 * Sync handler tests
 * Trace: spec_id: SPEC-bookinfo-001, task_id: TASK-032
 */

import { describe, expect, it, vi } from 'vitest';
import type { AladinClient } from '../../services/aladin-client';
import type { BookRepository } from '../../services/book-repository';
import type { Charge } from '../../types';
import { processCharge } from '../sync-handler';

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
  categoryName: 'Category',
};

describe('processCharge', () => {
  it('refreshes cover when existing record has none', async () => {
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

  it('handles Aladin lookup failure gracefully', async () => {
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

    const mockAladinClient = {
      lookupByIsbn: vi.fn().mockRejectedValue(new Error('API timeout')),
    } as unknown as AladinClient;

    const status = await processCharge(
      charge,
      mockBookRepository,
      mockAladinClient,
    );

    expect(status).toBe('unchanged');
    expect(mockAladinClient.lookupByIsbn).toHaveBeenCalled();
    expect(mockBookRepository.saveBook).not.toHaveBeenCalled();
  });

  it('handles Aladin returning null', async () => {
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
