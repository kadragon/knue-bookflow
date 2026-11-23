import { z } from 'zod';
import { createBookRepository } from '../services/book-repository';
import { createDueDateCalendar } from '../services/due-date-calendar';
import type { Env } from '../types';
import { jsonResponse } from '../utils/response';

const tokenParams = z.tuple([z.string().min(1)]);
const cacheHeaders = { 'Cache-Control': 'private, no-store' };

async function matchesToken(token: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [actual, expected] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(token)),
    crypto.subtle.digest('SHA-256', encoder.encode(secret)),
  ]);
  return crypto.subtle.timingSafeEqual(actual, expected);
}

export async function handleGetCalendarFeed(
  method: string,
  params: URLSearchParams,
  env: Env,
): Promise<Response> {
  const token = tokenParams.safeParse(params.getAll('token'));
  if (
    (method !== 'GET' && method !== 'HEAD') ||
    !env.CALENDAR_FEED_TOKEN ||
    !token.success ||
    !(await matchesToken(token.data[0], env.CALENDAR_FEED_TOKEN))
  ) {
    return new Response('Not Found', { status: 404, headers: cacheHeaders });
  }

  try {
    const dueDates = await createBookRepository(
      env.DB,
    ).findActiveLoanDueDates();
    return new Response(
      method === 'HEAD' ? null : createDueDateCalendar(dueDates),
      {
        headers: {
          ...cacheHeaders,
          'Content-Type': 'text/calendar; charset=utf-8',
        },
      },
    );
  } catch (error) {
    console.error('[CalendarFeed] Failed to load loan due dates:', error);
    return jsonResponse(
      { error: 'Calendar feed unavailable' },
      {
        status: 500,
        headers: cacheHeaders,
      },
    );
  }
}
