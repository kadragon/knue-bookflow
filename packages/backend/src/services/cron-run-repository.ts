/**
 * Repository for cron_runs table
 * Records per-phase outcome of the daily cron pipeline
 */

import type { CronRunRecord } from '../types';

export interface ICronRunRepository {
  record(input: Omit<CronRunRecord, 'id'>): Promise<void>;
  findRecent(limit: number): Promise<CronRunRecord[]>;
  findLatestPerPhase(): Promise<CronRunRecord[]>;
}

export class CronRunRepository implements ICronRunRepository {
  constructor(private readonly db: D1Database) {}

  async record(input: Omit<CronRunRecord, 'id'>): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO cron_runs
           (phase, status, started_at, finished_at, duration_ms, detail, cron_expr)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.phase,
        input.status,
        input.started_at,
        input.finished_at,
        input.duration_ms,
        input.detail,
        input.cron_expr,
      )
      .run();
  }

  async findRecent(limit: number): Promise<CronRunRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT id, phase, status, started_at, finished_at, duration_ms, detail, cron_expr
           FROM cron_runs
          ORDER BY started_at DESC
          LIMIT ?`,
      )
      .bind(limit)
      .all<CronRunRecord>();

    return result.results;
  }

  async findLatestPerPhase(): Promise<CronRunRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT c.id, c.phase, c.status, c.started_at, c.finished_at,
                c.duration_ms, c.detail, c.cron_expr
           FROM cron_runs c
           INNER JOIN (
             SELECT phase, MAX(started_at) AS latest
               FROM cron_runs
              GROUP BY phase
           ) m ON c.phase = m.phase AND c.started_at = m.latest
          ORDER BY c.phase`,
      )
      .all<CronRunRecord>();

    return result.results;
  }
}

export function createCronRunRepository(db: D1Database): CronRunRepository {
  return new CronRunRepository(db);
}
