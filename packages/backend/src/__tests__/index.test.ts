import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncBooksCore } from '../handlers/sync-handler';
import worker from '../index';
import { NOTE_BROADCAST_CRON } from '../services';
import type { Env } from '../types';

// Trace: spec_id: SPEC-scheduler-001, task_id: TASK-070

vi.mock('../handlers/sync-handler', async () => {
  const actual = await vi.importActual<
    typeof import('../handlers/sync-handler')
  >('../handlers/sync-handler');
  return {
    ...actual,
    syncBooksCore: vi.fn(),
  };
});

describe('scheduled handler', () => {
  let mockEnv: Env;
  let mockCtx: ExecutionContext;
  let waitUntilSpy: ReturnType<typeof vi.fn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  const collectWaitUntilPromises = (): Promise<unknown>[] => {
    const pending: Promise<unknown>[] = [];
    const calls = waitUntilSpy.mock.calls as Array<[Promise<unknown>]>;
    for (const call of calls) {
      pending.push(call[0]);
    }
    return pending;
  };

  beforeEach(() => {
    // Create mock environment
    mockEnv = {
      DB: {} as D1Database,
      ALADIN_API_KEY: 'test-key',
      LIBRARY_USER_ID: 'test-user',
      LIBRARY_PASSWORD: 'test-password',
      TELEGRAM_BOT_TOKEN: 'test-token',
      TELEGRAM_CHAT_ID: 'test-chat-id',
      ENVIRONMENT: 'test',
      ASSETS: {} as Fetcher,
    };

    // Create mock execution context
    waitUntilSpy = vi.fn();
    mockCtx = {
      waitUntil: waitUntilSpy as ExecutionContext['waitUntil'],
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    // Spy on console.warn
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.mocked(syncBooksCore).mockResolvedValue({
      total_charges: 0,
      added: 0,
      updated: 0,
      unchanged: 0,
      returned: 0,
    });
  });

  it('should handle note broadcast cron and trigger broadcast and sync', async () => {
    const mockEvent = {
      cron: NOTE_BROADCAST_CRON,
      scheduledTime: Date.now(),
    } as ScheduledEvent;

    await worker.scheduled(mockEvent, mockEnv, mockCtx);

    // Should call waitUntil twice: once for broadcast, once for sync
    expect(waitUntilSpy).toHaveBeenCalledTimes(2);

    const pending = collectWaitUntilPromises();
    await Promise.allSettled(pending);
  });

  it('should log scheduled sync start when cron triggers', async () => {
    const mockEvent = {
      cron: NOTE_BROADCAST_CRON,
      scheduledTime: Date.now(),
    } as ScheduledEvent;

    await worker.scheduled(mockEvent, mockEnv, mockCtx);

    const pending = collectWaitUntilPromises();
    await Promise.allSettled(pending);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ScheduledSync] Triggered by cron'),
    );
  });

  it('should send a Telegram alert when scheduled sync fails', async () => {
    const error = new Error('boom');
    vi.mocked(syncBooksCore).mockRejectedValueOnce(error);

    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response('ok', { status: 200 }));
    globalThis.fetch = mockFetch as typeof fetch;

    const mockEvent = {
      cron: NOTE_BROADCAST_CRON,
      scheduledTime: Date.now(),
    } as ScheduledEvent;

    await worker.scheduled(mockEvent, mockEnv, mockCtx);

    const pending = collectWaitUntilPromises();
    await Promise.allSettled(pending);

    expect(mockFetch).toHaveBeenCalled();
    const [, requestInit] = mockFetch.mock.calls[0];
    const body = (requestInit as RequestInit)?.body as string;
    expect(body).toContain('boom');
  });

  it('should log a scheduled sync summary when completed', async () => {
    consoleLogSpy.mockClear();
    const mockEvent = {
      cron: NOTE_BROADCAST_CRON,
      scheduledTime: Date.now(),
    } as ScheduledEvent;

    await worker.scheduled(mockEvent, mockEnv, mockCtx);

    const pending = collectWaitUntilPromises();
    await Promise.allSettled(pending);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /\[ScheduledSync\] Summary total=\d+ added=\d+ updated=\d+ unchanged=\d+ returned=\d+/,
      ),
    );
  });

  it('should log warning for unknown cron and skip renewal workflow', async () => {
    const unknownCron = '0 5 * * *';
    const mockEvent = {
      cron: unknownCron,
      scheduledTime: Date.now(),
    } as ScheduledEvent;

    await worker.scheduled(mockEvent, mockEnv, mockCtx);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      `[BookFlow] Unknown cron '${unknownCron}', skipping renewal workflow`,
    );
    expect(mockCtx.waitUntil).not.toHaveBeenCalled();
  });

  it('should not trigger renewal workflow for unknown cron', async () => {
    const oldRenewalCron = '0 10 * * *'; // Old removed renewal cron
    const mockEvent = {
      cron: oldRenewalCron,
      scheduledTime: Date.now(),
    } as ScheduledEvent;

    await worker.scheduled(mockEvent, mockEnv, mockCtx);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      `[BookFlow] Unknown cron '${oldRenewalCron}', skipping renewal workflow`,
    );
    expect(mockCtx.waitUntil).not.toHaveBeenCalled();
  });
});

describe('POST /webhook/telegram', () => {
  it('routes to telegram webhook handler and returns 401 without secret', async () => {
    const env: Env = {
      DB: {} as D1Database,
      ALADIN_API_KEY: '',
      LIBRARY_USER_ID: '',
      LIBRARY_PASSWORD: '',
      TELEGRAM_BOT_TOKEN: 'tok',
      TELEGRAM_CHAT_ID: '123',
      TELEGRAM_WEBHOOK_SECRET: 'secret',
      ENVIRONMENT: 'test',
      ASSETS: {} as Fetcher,
    };
    const ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    const req = new Request('https://example.com/webhook/telegram', {
      method: 'POST',
      body: JSON.stringify({ update_id: 1 }),
    });

    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(401);
  });
});
