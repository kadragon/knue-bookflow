/**
 * Cron runs handler tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ICronRunRepository } from '../../services/cron-run-repository';
import type { CronRunRecord, Env } from '../../types';
import {
  handleGetCronRuns,
  handleGetLatestCronRuns,
} from '../cron-runs-handler';

const mockRepo = {
  record: vi.fn(),
  findRecent: vi.fn<() => Promise<CronRunRecord[]>>(),
  findLatestPerPhase: vi.fn<() => Promise<CronRunRecord[]>>(),
} satisfies ICronRunRepository;

const env = {} as unknown as Env;

const SAMPLE_RUN: CronRunRecord = {
  id: 1,
  phase: 'renewal',
  status: 'success',
  started_at: '2026-04-28T03:00:00.000Z',
  finished_at: '2026-04-28T03:00:05.000Z',
  duration_ms: 5000,
  detail: 'renewed=0 failed=0',
  cron_expr: '0 3 * * *',
};

function makeRequest(path: string) {
  return new Request(`https://worker.example.com${path}`);
}

describe('handleGetCronRuns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo.findRecent.mockResolvedValue([SAMPLE_RUN]);
  });

  it('returns 200 with runs array', async () => {
    const response = await handleGetCronRuns(
      env,
      makeRequest('/api/cron-runs'),
      mockRepo,
    );

    expect(response.status).toBe(200);
    const body = await response.json<{ runs: CronRunRecord[] }>();
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0].phase).toBe('renewal');
  });

  it('uses default limit of 50 when no param given', async () => {
    await handleGetCronRuns(env, makeRequest('/api/cron-runs'), mockRepo);

    expect(mockRepo.findRecent).toHaveBeenCalledWith(50);
  });

  it('respects a valid ?limit= param', async () => {
    await handleGetCronRuns(
      env,
      makeRequest('/api/cron-runs?limit=10'),
      mockRepo,
    );

    expect(mockRepo.findRecent).toHaveBeenCalledWith(10);
  });

  it('clamps limit to 200 via Zod catch', async () => {
    await handleGetCronRuns(
      env,
      makeRequest('/api/cron-runs?limit=999'),
      mockRepo,
    );

    expect(mockRepo.findRecent).toHaveBeenCalledWith(200);
  });

  it('returns 400 for non-numeric limit', async () => {
    const response = await handleGetCronRuns(
      env,
      makeRequest('/api/cron-runs?limit=abc'),
      mockRepo,
    );

    expect(response.status).toBe(400);
    const body = await response.json<{ error: string }>();
    expect(body.error).toMatch(/positive integer/);
  });

  it('returns 400 for non-positive limit', async () => {
    const response = await handleGetCronRuns(
      env,
      makeRequest('/api/cron-runs?limit=0'),
      mockRepo,
    );

    expect(response.status).toBe(400);
  });

  it('sets Cache-Control: no-store', async () => {
    const response = await handleGetCronRuns(
      env,
      makeRequest('/api/cron-runs'),
      mockRepo,
    );

    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 500 when repo throws', async () => {
    mockRepo.findRecent.mockRejectedValue(new Error('D1 error'));

    const response = await handleGetCronRuns(
      env,
      makeRequest('/api/cron-runs'),
      mockRepo,
    );

    expect(response.status).toBe(500);
  });
});

describe('handleGetLatestCronRuns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo.findLatestPerPhase.mockResolvedValue([SAMPLE_RUN]);
  });

  it('returns 200 with one row per phase', async () => {
    const response = await handleGetLatestCronRuns(env, mockRepo);

    expect(response.status).toBe(200);
    const body = await response.json<{ runs: CronRunRecord[] }>();
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0].phase).toBe('renewal');
  });

  it('sets Cache-Control: no-store', async () => {
    const response = await handleGetLatestCronRuns(env, mockRepo);

    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 500 when repo throws', async () => {
    mockRepo.findLatestPerPhase.mockRejectedValue(new Error('D1 error'));

    const response = await handleGetLatestCronRuns(env, mockRepo);

    expect(response.status).toBe(500);
  });
});
