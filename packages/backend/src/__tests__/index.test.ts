import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../index';
import { NOTE_BROADCAST_CRON } from '../services';
import type { Env } from '../types';

// Trace: spec_id: SPEC-scheduler-001, task_id: TASK-070

describe('scheduled handler', () => {
  let mockEnv: Env;
  let mockCtx: ExecutionContext;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

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
    mockCtx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    // Spy on console.warn
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('should handle note broadcast cron and trigger broadcast and sync', async () => {
    const mockEvent = {
      cron: NOTE_BROADCAST_CRON,
      scheduledTime: Date.now(),
    } as ScheduledEvent;

    await worker.scheduled(mockEvent, mockEnv, mockCtx);

    // Should call waitUntil twice: once for broadcast, once for sync
    expect(mockCtx.waitUntil).toHaveBeenCalledTimes(2);
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
