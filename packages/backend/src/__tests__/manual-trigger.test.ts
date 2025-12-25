/**
 * Manual trigger workflow tests
 * Trace: spec_id: SPEC-backend-refactor-001, task_id: TASK-075
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenewalResult } from '../services';
import type { Charge, Env } from '../types';

const mockLibraryClient = {
  login: vi.fn(),
  getCharges: vi.fn(),
};
const mockBookRepository = {
  logRenewal: vi.fn(),
};
const mockAladinClient = {};
const mockProcessCharge = vi.fn();
const mockFetchAndProcessReturns = vi.fn();
const mockCheckAndRenewBooks = vi.fn();

vi.mock('../services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services')>();
  return {
    ...actual,
    createLibraryClient: () => mockLibraryClient,
    createAladinClient: () => mockAladinClient,
    createBookRepository: () => mockBookRepository,
    checkAndRenewBooks: mockCheckAndRenewBooks,
  };
});

vi.mock('../handlers/sync-handler', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../handlers/sync-handler')>();
  return {
    ...actual,
    processCharge: mockProcessCharge,
    fetchAndProcessReturns: mockFetchAndProcessReturns,
  };
});

const baseEnv: Env = {
  DB: {} as D1Database,
  ASSETS: {} as Fetcher,
  ALADIN_API_KEY: 'test-key',
  LIBRARY_USER_ID: 'test-user',
  LIBRARY_PASSWORD: 'test-pass',
  TELEGRAM_BOT_TOKEN: 'test-token',
  TELEGRAM_CHAT_ID: 'test-chat',
  ENVIRONMENT: 'test',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('manual trigger workflow', () => {
  it('records renewals and completes even when sync partially fails', async () => {
    const charges = [{ id: 1 } as Charge, { id: 2 } as Charge];
    const renewalResults: RenewalResult[] = [
      {
        chargeId: 1,
        title: 'First Book',
        success: true,
        newDueDate: '2025-01-20',
        newRenewCount: 1,
      },
      {
        chargeId: 2,
        title: 'Second Book',
        success: false,
        errorMessage: 'renewal failed',
      },
    ];

    mockLibraryClient.login.mockResolvedValue(undefined);
    mockLibraryClient.getCharges.mockResolvedValue(charges);
    mockCheckAndRenewBooks.mockResolvedValue(renewalResults);
    mockProcessCharge
      .mockResolvedValueOnce('added')
      .mockRejectedValueOnce(new Error('sync boom'));
    mockFetchAndProcessReturns.mockResolvedValue(0);
    mockBookRepository.logRenewal.mockResolvedValue(undefined);

    const worker = (await import('../index')).default;

    const request = new Request('https://example.com/trigger', {
      method: 'POST',
    });

    let waitUntilPromise: Promise<void> | undefined;
    const ctx = {
      waitUntil: vi.fn((promise: Promise<void>) => {
        waitUntilPromise = promise;
      }),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    const response = await worker.fetch(request, baseEnv, ctx);

    expect(response.status).toBe(200);
    expect(ctx.waitUntil).toHaveBeenCalledOnce();
    expect(waitUntilPromise).toBeDefined();

    await expect(waitUntilPromise).resolves.toBeUndefined();

    expect(mockBookRepository.logRenewal).toHaveBeenCalledTimes(2);
    expect(mockFetchAndProcessReturns).toHaveBeenCalledOnce();
  });
});
