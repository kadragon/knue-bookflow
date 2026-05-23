import type { BookRecord, BookViewModel, DueStatus, NoteState } from '../types';
import { DUE_SOON_DAYS, KST_OFFSET_MINUTES } from '../utils';
import { toReadStatus } from '../utils/read-status';
import type { createNoteRepository } from './note-repository';

type NoteRepo = Pick<
  ReturnType<typeof createNoteRepository>,
  'countNotesForBookIds'
>;

function zoneDayNumber(ms: number, offsetMinutes: number): number {
  return Math.floor((ms + offsetMinutes * 60 * 1000) / (24 * 60 * 60 * 1000));
}

function computeDaysLeft(
  dueDate: string,
  now: Date,
  offsetMinutes: number,
): number {
  const dueDateOnly = dueDate.split(' ')[0];
  const dueDay = zoneDayNumber(
    Date.parse(`${dueDateOnly}T00:00:00Z`),
    offsetMinutes,
  );
  const today = zoneDayNumber(now.getTime(), offsetMinutes);
  return dueDay - today;
}

function normalizeIsbn(value: string | null | undefined): string {
  return (value ?? '').replace(/[\s-]/g, '').toLowerCase();
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function bookGroupingKey(record: BookRecord): string {
  const isbn = normalizeIsbn(record.isbn);
  if (isbn) {
    return `isbn:${isbn}`;
  }
  return `fallback:${normalizeText(record.title)}|${normalizeText(record.author)}`;
}

function compareBookRecency(a: BookRecord, b: BookRecord): number {
  const dateDiff = a.charge_date.localeCompare(b.charge_date);
  if (dateDiff !== 0) {
    return dateDiff;
  }
  const idA = a.id ?? 0;
  const idB = b.id ?? 0;
  if (idA !== idB) {
    return idA - idB;
  }
  return a.charge_id.localeCompare(b.charge_id);
}

interface GroupedBook {
  representative: BookRecord;
  loanOrdinal: number;
}

function groupBooks(records: BookRecord[]): GroupedBook[] {
  const grouped = new Map<string, GroupedBook>();
  for (const record of records) {
    const key = bookGroupingKey(record);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { representative: record, loanOrdinal: 1 });
      continue;
    }
    existing.loanOrdinal += 1;
    if (compareBookRecency(record, existing.representative) > 0) {
      existing.representative = record;
    }
  }
  return Array.from(grouped.values());
}

export function sortBooks(records: BookRecord[]): BookRecord[] {
  return [...records].sort((a, b) => {
    const readA = a.is_read ?? 0;
    const readB = b.is_read ?? 0;
    if (readA !== readB) {
      return readA - readB;
    }
    return b.charge_date.localeCompare(a.charge_date);
  });
}

export function deriveBookViewModel(
  record: BookRecord,
  noteCount = 0,
  now = new Date(),
  offsetMinutes = KST_OFFSET_MINUTES,
): BookViewModel {
  const isReturned = Boolean(record.discharge_date);
  const daysLeft = isReturned
    ? 0
    : computeDaysLeft(record.due_date, now, offsetMinutes);

  let dueStatus: DueStatus = 'ok';
  if (!isReturned) {
    if (daysLeft < 0) {
      dueStatus = 'overdue';
    } else if (daysLeft <= DUE_SOON_DAYS) {
      dueStatus = 'due_soon';
    }
  }

  let noteState: NoteState = 'not_started';
  if (noteCount > 0) {
    noteState = 'in_progress';
  }

  return {
    id: record.charge_id,
    dbId: record.id || 0,
    title: record.title,
    author: record.author,
    publisher: record.publisher,
    coverUrl: record.cover_url,
    description: record.description,
    isbn13: record.isbn13,
    pubDate: record.pub_date,
    chargeDate: record.charge_date,
    dueDate: record.due_date,
    dischargeDate: record.discharge_date ?? null,
    renewCount: record.renew_count,
    daysLeft,
    dueStatus,
    loanState: isReturned ? 'returned' : 'on_loan',
    noteCount,
    noteState,
    readStatus: toReadStatus(record.is_read ?? 0),
    loanOrdinal: 1,
  };
}

export async function buildBookShelfView(
  records: BookRecord[],
  noteRepo: NoteRepo,
  now = new Date(),
  offsetMinutes = KST_OFFSET_MINUTES,
): Promise<BookViewModel[]> {
  const grouped = groupBooks(records);
  const sorted = sortBooks(grouped.map((item) => item.representative));
  const loanOrdinalByChargeId = new Map(
    grouped.map((item) => [item.representative.charge_id, item.loanOrdinal]),
  );

  const bookIds = sorted
    .map((r) => r.id)
    .filter((id): id is number => id !== undefined);
  const noteCounts = await noteRepo.countNotesForBookIds(bookIds);

  return sorted.map((record) => {
    const noteCount = record.id ? noteCounts.get(record.id) || 0 : 0;
    return {
      ...deriveBookViewModel(record, noteCount, now, offsetMinutes),
      loanOrdinal: loanOrdinalByChargeId.get(record.charge_id) ?? 1,
    };
  });
}
