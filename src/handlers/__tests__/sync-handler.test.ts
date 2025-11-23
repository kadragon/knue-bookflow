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
  return {
    id: overrides.id ?? 1,
    barcode: '123456',
    biblio: {
      id: 1,
      titleStatement: overrides.biblio?.titleStatement ?? 'Test Book',
      isbn: overrides.biblio?.isbn ?? '9781234567890',
      thumbnail: null,
    },
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

describe('processCharge', () => {
  it('refreshes cover when existing record has none', async () => {
    const charge = createMockCharge();

    const mockBookRepository = {
      findByChargeId: vi.fn().mockResolvedValue({
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
      }),
      saveBook: vi.fn(),
    } as unknown as BookRepository;

    const mockAladinClient = {
      lookupByIsbn: vi.fn().mockResolvedValue({
        isbn: charge.biblio.isbn,
        isbn13: charge.biblio.isbn,
        title: 'Test Book',
        author: 'Author',
        publisher: 'Publisher',
        pubDate: '2025-01-01',
        description: 'Desc',
        coverUrl: 'https://covers.aladin.co.kr/Big/9781234567890.jpg',
        categoryName: 'Category',
      }),
    } as unknown as AladinClient;

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
});
