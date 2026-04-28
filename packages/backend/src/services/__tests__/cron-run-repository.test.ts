/**
 * CronRunRepository tests
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { CronPhase, CronRunRecord } from '../../types';
import { CronRunRepository } from '../cron-run-repository';

type StoredRow = Omit<CronRunRecord, 'id'> & { id: number };

function makeMockDb() {
  const rows: StoredRow[] = [];
  let nextId = 1;

  const db = {
    prepare: (sql: string) => {
      if (sql.includes('INSERT INTO cron_runs')) {
        return {
          bind: (
            phase: CronPhase,
            status: string,
            startedAt: string,
            finishedAt: string,
            durationMs: number,
            detail: string | null,
            cronExpr: string,
          ) => ({
            run: async () => {
              rows.push({
                id: nextId++,
                phase,
                status: status as CronRunRecord['status'],
                started_at: startedAt,
                finished_at: finishedAt,
                duration_ms: durationMs,
                detail,
                cron_expr: cronExpr,
              });
              return { meta: { changes: 1 } };
            },
          }),
        };
      }

      if (sql.includes('ORDER BY started_at DESC') && sql.includes('LIMIT')) {
        return {
          bind: (limit: number) => ({
            all: async <T>() => ({
              results: [...rows]
                .sort((a, b) => b.started_at.localeCompare(a.started_at))
                .slice(0, limit) as unknown as T[],
            }),
          }),
        };
      }

      // findLatestPerPhase
      if (sql.includes('PARTITION BY phase')) {
        return {
          all: async <T>() => {
            const latestByPhase = new Map<string, StoredRow>();
            for (const row of rows) {
              const existing = latestByPhase.get(row.phase);
              if (!existing || row.started_at > existing.started_at) {
                latestByPhase.set(row.phase, row);
              }
            }
            return {
              results: [...latestByPhase.values()].sort((a, b) =>
                a.phase.localeCompare(b.phase),
              ) as unknown as T[],
            };
          },
        };
      }

      return {
        bind: () => ({
          run: async () => {},
          all: async () => ({ results: [] }),
        }),
        all: async () => ({ results: [] }),
      };
    },
  } as unknown as D1Database;

  return { db, rows };
}

const BASE: Omit<CronRunRecord, 'id'> = {
  phase: 'renewal',
  status: 'success',
  started_at: '2026-04-28T03:00:00.000Z',
  finished_at: '2026-04-28T03:00:05.000Z',
  duration_ms: 5000,
  detail: 'renewed=0 failed=0',
  cron_expr: '0 3 * * *',
};

describe('CronRunRepository', () => {
  let repo: CronRunRepository;
  let mockDb: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    mockDb = makeMockDb();
    repo = new CronRunRepository(mockDb.db);
  });

  it('record() inserts a row into the store', async () => {
    await repo.record(BASE);

    expect(mockDb.rows).toHaveLength(1);
    expect(mockDb.rows[0].phase).toBe('renewal');
    expect(mockDb.rows[0].status).toBe('success');
    expect(mockDb.rows[0].duration_ms).toBe(5000);
  });

  it('findRecent() returns rows ordered by started_at DESC, respecting limit', async () => {
    const older = {
      ...BASE,
      started_at: '2026-04-27T03:00:00.000Z',
      finished_at: '2026-04-27T03:00:05.000Z',
    };
    const newer = {
      ...BASE,
      started_at: '2026-04-28T03:00:00.000Z',
      finished_at: '2026-04-28T03:00:05.000Z',
    };
    await repo.record(older);
    await repo.record(newer);

    const results = await repo.findRecent(10);
    expect(results).toHaveLength(2);
    expect(results[0].started_at).toBe('2026-04-28T03:00:00.000Z');
    expect(results[1].started_at).toBe('2026-04-27T03:00:00.000Z');
  });

  it('findRecent() respects the limit parameter', async () => {
    for (let i = 0; i < 5; i++) {
      await repo.record({
        ...BASE,
        started_at: `2026-04-${20 + i}T03:00:00.000Z`,
        finished_at: `2026-04-${20 + i}T03:00:05.000Z`,
      });
    }

    const results = await repo.findRecent(3);
    expect(results).toHaveLength(3);
  });

  it('findLatestPerPhase() returns one row per phase', async () => {
    const sync = { ...BASE, phase: 'sync' as CronPhase };
    const noteBroadcast = {
      ...BASE,
      phase: 'note_broadcast' as CronPhase,
      started_at: '2026-04-28T03:01:00.000Z',
      finished_at: '2026-04-28T03:01:01.000Z',
    };
    const renewalOld = {
      ...BASE,
      started_at: '2026-04-27T03:00:00.000Z',
      finished_at: '2026-04-27T03:00:05.000Z',
    };
    const renewalNew = { ...BASE, started_at: '2026-04-28T03:00:00.000Z' };
    await repo.record(sync);
    await repo.record(noteBroadcast);
    await repo.record(renewalOld);
    await repo.record(renewalNew);

    const results = await repo.findLatestPerPhase();
    const phases = results.map((r) => r.phase).sort();
    expect(phases).toEqual(['note_broadcast', 'renewal', 'sync']);

    const renewal = results.find((r) => r.phase === 'renewal');
    expect(renewal?.started_at).toBe('2026-04-28T03:00:00.000Z');
  });

  it('record() stores null detail correctly', async () => {
    await repo.record({ ...BASE, detail: null });

    expect(mockDb.rows[0].detail).toBeNull();
  });

  it('record() stores failure status', async () => {
    await repo.record({ ...BASE, status: 'failure', detail: 'login failed' });

    expect(mockDb.rows[0].status).toBe('failure');
    expect(mockDb.rows[0].detail).toBe('login failed');
  });
});
