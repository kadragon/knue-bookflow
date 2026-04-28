/**
 * Cron runs handler
 * Read-only API exposing cron phase run history from D1
 */

import { z } from 'zod';
import { createCronRunRepository, type ICronRunRepository } from '../services';
import type { Env } from '../types';

const limitParamSchema = z.coerce.number().int().positive();

export async function handleGetCronRuns(
  env: Env,
  request: Request,
  repo: ICronRunRepository = createCronRunRepository(env.DB as D1Database),
): Promise<Response> {
  const url = new URL(request.url);
  const rawLimit = url.searchParams.get('limit');

  let limit = 50;
  if (rawLimit !== null) {
    const parsed = limitParamSchema.safeParse(rawLimit);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'limit must be a positive integer' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
    limit = Math.min(parsed.data, 200);
  }

  try {
    const runs = await repo.findRecent(limit);
    return new Response(JSON.stringify({ runs }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[CronRuns] Failed to fetch cron runs', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function handleGetLatestCronRuns(
  env: Env,
  repo: ICronRunRepository = createCronRunRepository(env.DB as D1Database),
): Promise<Response> {
  try {
    const runs = await repo.findLatestPerPhase();
    return new Response(JSON.stringify({ runs }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[CronRuns] Failed to fetch latest cron runs', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
