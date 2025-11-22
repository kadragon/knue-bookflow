/**
 * Books API handler
 * Serves normalized book list for the bookshelf frontend
 *
 * Trace: spec_id: SPEC-frontend-001, task_id: TASK-019
 */

import { createBookRepository } from '../services/book-repository';
import type { BookRecord, BookViewModel, DueStatus, Env } from '../types';

export type { BookViewModel, DueStatus };

const KST_OFFSET_MINUTES = 9 * 60; // UTC+9
const DUE_SOON_DAYS = 3;

function zoneDayNumber(ms: number, offsetMinutes: number): number {
  return Math.floor((ms + offsetMinutes * 60 * 1000) / (24 * 60 * 60 * 1000));
}

function computeDaysLeft(
  dueDate: string,
  now: Date,
  offsetMinutes: number,
): number {
  const dueDay = zoneDayNumber(
    Date.parse(`${dueDate}T00:00:00Z`),
    offsetMinutes,
  );
  const today = zoneDayNumber(now.getTime(), offsetMinutes);
  return dueDay - today;
}

export function deriveBookViewModel(
  record: BookRecord,
  now = new Date(),
  offsetMinutes = KST_OFFSET_MINUTES,
): BookViewModel {
  const daysLeft = computeDaysLeft(record.due_date, now, offsetMinutes);

  let dueStatus: DueStatus = 'ok';
  if (daysLeft < 0) {
    dueStatus = 'overdue';
  } else if (daysLeft <= DUE_SOON_DAYS) {
    dueStatus = 'due_soon';
  }

  return {
    id: record.charge_id,
    title: record.title,
    author: record.author,
    publisher: record.publisher,
    coverUrl: record.cover_url,
    description: record.description,
    chargeDate: record.charge_date,
    dueDate: record.due_date,
    renewCount: record.renew_count,
    daysLeft,
    dueStatus,
    loanState: 'on_loan',
    noteCount: 0,
    noteState: 'not_started',
  };
}

export function sortBooksByChargeDate(records: BookRecord[]): BookRecord[] {
  return [...records].sort((a, b) =>
    b.charge_date.localeCompare(a.charge_date),
  );
}

type BookRepo = Pick<ReturnType<typeof createBookRepository>, 'findAll'>;

export async function handleBooksApi(
  env: Env,
  repo: BookRepo = createBookRepository(env.DB),
): Promise<Response> {
  const records = await repo.findAll();
  const sorted = sortBooksByChargeDate(records);
  const view = sorted.map((record) => deriveBookViewModel(record));

  return new Response(JSON.stringify({ items: view }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
