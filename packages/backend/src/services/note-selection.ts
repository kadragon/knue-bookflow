/**
 * Note selection service for the writing practice sheet
 * Extracted from note-broadcast; no Telegram dependency.
 */

import type { BookRecord, Env, NoteRecord } from '../types';
import { DAY_MS, KST_OFFSET_MINUTES } from '../utils';

export const NOTE_COOLDOWN_DAYS = 7;

export interface NoteCandidate {
  book: BookRecord;
  note: NoteRecord;
  sendCount: number;
  lastSentAt: string | null;
}

export interface NoteSelectionRepository {
  getNoteCandidates(): Promise<NoteCandidate[]>;
  incrementSendCount(noteId: number, now?: Date): Promise<void>;
}

export interface NoteSelectionDeps {
  repository?: NoteSelectionRepository;
  randomFn?: () => number;
  /** Injected for tests; defaults to new Date() */
  now?: Date;
  cooldownDays?: number;
  /** When true, always draw + record even if today's note already exists */
  force?: boolean;
}

interface NoteCandidateRow {
  note_id: number;
  book_id: number;
  page_number: number;
  content: string;
  note_created_at?: string | null;
  note_updated_at?: string | null;
  charge_id: string;
  isbn: string;
  isbn13: string | null;
  title: string;
  author: string;
  publisher: string | null;
  cover_url: string | null;
  description: string | null;
  pub_date: string | null;
  charge_date: string;
  due_date: string;
  renew_count: number;
  is_read?: number | null;
  book_created_at?: string | null;
  book_updated_at?: string | null;
  send_count: number | null;
  last_sent_at: string | null;
}

class D1NoteSelectionRepository implements NoteSelectionRepository {
  constructor(private readonly db: D1Database) {}

  async getNoteCandidates(): Promise<NoteCandidate[]> {
    const result = await this.db
      .prepare(`
        SELECT
          n.id AS note_id,
          n.book_id,
          n.page_number,
          n.content,
          n.created_at AS note_created_at,
          n.updated_at AS note_updated_at,
          b.charge_id,
          b.isbn,
          b.isbn13,
          b.title,
          b.author,
          b.publisher,
          b.cover_url,
          b.description,
          b.pub_date,
          b.charge_date,
          b.due_date,
          b.renew_count,
          b.is_read,
          b.created_at AS book_created_at,
          b.updated_at AS book_updated_at,
          COALESCE(s.send_count, 0) AS send_count,
          s.last_sent_at
        FROM notes n
        JOIN books b ON b.id = n.book_id
        LEFT JOIN note_send_stats s ON s.note_id = n.id
      `)
      .all<NoteCandidateRow>();

    return result.results.map((row) => ({
      note: {
        id: row.note_id,
        book_id: row.book_id,
        page_number: row.page_number,
        content: row.content,
        created_at: row.note_created_at ?? undefined,
        updated_at: row.note_updated_at ?? undefined,
      },
      book: {
        id: row.book_id,
        charge_id: row.charge_id,
        isbn: row.isbn,
        isbn13: row.isbn13,
        title: row.title,
        author: row.author,
        publisher: row.publisher,
        cover_url: row.cover_url,
        description: row.description,
        pub_date: row.pub_date,
        charge_date: row.charge_date,
        due_date: row.due_date,
        renew_count: row.renew_count,
        is_read: row.is_read ?? 0,
        created_at: row.book_created_at ?? undefined,
        updated_at: row.book_updated_at ?? undefined,
      },
      sendCount: row.send_count ?? 0,
      lastSentAt: row.last_sent_at ?? null,
    }));
  }

  async incrementSendCount(noteId: number, now?: Date): Promise<void> {
    const nowIso = (now ?? new Date()).toISOString();
    await this.db
      .prepare(`
        INSERT INTO note_send_stats (note_id, send_count, last_sent_at)
        VALUES (?, 1, ?)
        ON CONFLICT(note_id)
        DO UPDATE SET
          send_count = send_count + 1,
          last_sent_at = excluded.last_sent_at
      `)
      .bind(noteId, nowIso)
      .run();
  }
}

export function createNoteSelectionRepository(
  db: D1Database,
): NoteSelectionRepository {
  return new D1NoteSelectionRepository(db);
}

/**
 * Select a note candidate using weighted-random + cooldown filtering.
 * Weights: 1/(sendCount+1) — unsent notes preferred; all-in-cooldown falls back to full pool.
 */
export function selectNoteCandidate(
  candidates: NoteCandidate[],
  randomFn: () => number = Math.random,
  options?: { now?: Date; cooldownDays?: number },
): NoteCandidate | null {
  if (candidates.length === 0) {
    return null;
  }

  const now = options?.now ?? new Date();
  const cooldownDays = options?.cooldownDays ?? NOTE_COOLDOWN_DAYS;
  const threshold = now.getTime() - cooldownDays * DAY_MS;

  const eligible = candidates.filter((c) => {
    if (!c.lastSentAt) return true;
    const ts = new Date(c.lastSentAt).getTime();
    return Number.isFinite(ts) && ts < threshold;
  });

  if (eligible.length === 0) {
    console.warn(
      '[NoteSelection] All candidates in cooldown; bypassing filter',
    );
  }
  const pool = eligible.length > 0 ? eligible : candidates;

  const weights = pool.map((c) => 1 / (c.sendCount + 1));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const target = randomFn() * total;

  let cumulative = 0;
  for (let i = 0; i < pool.length; i++) {
    cumulative += weights[i]!;
    if (target < cumulative) {
      return pool[i]!;
    }
  }
  return pool[pool.length - 1]!;
}

/**
 * Return today's KST day number from a Date.
 * Day number = floor((utcMs + kstOffsetMs) / DAY_MS)
 */
function kstDayNumber(date: Date): number {
  return Math.floor((date.getTime() + KST_OFFSET_MINUTES * 60 * 1000) / DAY_MS);
}

/**
 * Draw today's practice note (idempotent per KST day).
 *
 * - If a candidate was already recorded today (KST), return it without re-recording.
 * - Otherwise, pick via selectNoteCandidate and call incrementSendCount.
 * - force=true always re-draws and records (for the "다시 뽑기" button).
 */
export async function drawPracticeNote(
  env: Env,
  deps: NoteSelectionDeps = {},
): Promise<NoteCandidate | null> {
  const repository =
    deps.repository ?? createNoteSelectionRepository(env.DB as D1Database);
  const randomFn = deps.randomFn ?? Math.random;
  const now = deps.now ?? new Date();
  const force = deps.force ?? false;

  const candidates = await repository.getNoteCandidates();

  if (candidates.length === 0) {
    return null;
  }

  const todayKST = kstDayNumber(now);
  const alreadyDrawnNoteId = candidates.reduce<number | null>((found, c) => {
    if (found !== null) return found;
    if (!c.lastSentAt) return null;
    const ts = new Date(c.lastSentAt).getTime();
    if (!Number.isFinite(ts)) return null;
    return kstDayNumber(new Date(ts)) === todayKST ? (c.note.id ?? null) : null;
  }, null);

  if (!force && alreadyDrawnNoteId !== null) {
    const alreadyDrawn = candidates.find(
      (c) => c.note.id === alreadyDrawnNoteId,
    );
    if (alreadyDrawn) return alreadyDrawn;
  }

  const pool =
    force && alreadyDrawnNoteId !== null
      ? (() => {
          const filtered = candidates.filter(
            (c) => c.note.id !== alreadyDrawnNoteId,
          );
          return filtered.length > 0 ? filtered : candidates;
        })()
      : candidates;

  const selected = selectNoteCandidate(pool, randomFn, {
    now,
    cooldownDays: deps.cooldownDays,
  });

  if (!selected) {
    return null;
  }

  if (selected.note.id) {
    await repository.incrementSendCount(selected.note.id, now);
  }

  return selected;
}
