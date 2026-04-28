/**
 * Manual trigger workflow tests (POST /trigger)
 * Verifies that renewal and sync phases run sequentially and are observable.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types';

const mockLibraryClient = {
  login: vi.fn(),
  getCharges: vi.fn(),
};
const mockCheckAndRenewBooks = vi.fn();
const mockLogRenewalResults = vi.fn();
const mockSyncBooksCore = vi.fn();
const mockCronRunRepo = {
  record: vi.fn().mockResolvedValue(undefined),
  findRecent: vi.fn().mockResolvedValue([]),
  findLatestPerPhase: vi.fn().mockResolvedValue([]),
};

vi.mock('../services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services')>();
  return {
    ...actual,
    createLibraryClient: () => mockLibraryClient,
    createBookRepository: () => ({}),
    createCronRunRepository: () => mockCronRunRepo,
    checkAndRenewBooks: mockCheckAndRenewBooks,
    logRenewalResults: mockLogRenewalResults,
  };
});

vi.mock('../handlers/sync-handler', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../handlers/sync-handler')>();
  return {
    ...actual,
    syncBooksCore: mockSyncBooksCore,
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

describe('POST /trigger', () => {
  it('runs renewal and sync phases, responding 200 immediately', async () => {
    mockLibraryClient.login.mockResolvedValue(undefined);
    mockLibraryClient.getCharges.mockResolvedValue([]);
    mockCheckAndRenewBooks.mockResolvedValue([]);
    mockSyncBooksCore.mockResolvedValue({
      total_charges: 0,
      added: 0,
      updated: 0,
      unchanged: 0,
      returned: 0,
    });

    const worker = (await import('../index')).default;
    const request = new Request('https://example.com/trigger', {
      method: 'POST',
    });

    let waitUntilPromise: Promise<unknown> | undefined;
    const ctx = {
      waitUntil: vi.fn((p: Promise<unknown>) => {
        waitUntilPromise = p;
      }),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    const response = await worker.fetch(request, baseEnv, ctx);

    expect(response.status).toBe(200);
    expect(ctx.waitUntil).toHaveBeenCalledOnce();

    await expect(waitUntilPromise).resolves.toBeUndefined();

    expect(mockCronRunRepo.record).toHaveBeenCalledTimes(2);
    expect(mockCronRunRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'renewal', cron_expr: 'manual' }),
    );
    expect(mockCronRunRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'sync', cron_expr: 'manual' }),
    );
  });

  it('records sync phase as failure when syncBooksCore throws', async () => {
    mockLibraryClient.login.mockResolvedValue(undefined);
    mockLibraryClient.getCharges.mockResolvedValue([]);
    mockCheckAndRenewBooks.mockResolvedValue([]);
    mockSyncBooksCore.mockRejectedValue(new Error('sync boom'));

    const worker = (await import('../index')).default;
    const request = new Request('https://example.com/trigger', {
      method: 'POST',
    });

    let waitUntilPromise: Promise<unknown> | undefined;
    const ctx = {
      waitUntil: vi.fn((p: Promise<unknown>) => {
        waitUntilPromise = p;
      }),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    await worker.fetch(request, baseEnv, ctx);
    await expect(waitUntilPromise).resolves.toBeUndefined();

    const syncCall = mockCronRunRepo.record.mock.calls.find(
      (c) => c[0].phase === 'sync',
    );
    expect(syncCall?.[0].status).toBe('failure');
  });
});
