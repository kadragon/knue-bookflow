/**
 * Daily Telegram note broadcast service
 * Trace: spec_id: SPEC-notes-telegram-002, task_id: TASK-036
 */

import type { BookRecord, Env, NoteRecord } from '../types';
import {
  DAY_MS,
  DUE_SOON_BROADCAST_DAYS,
  daysFromToday,
  formatDate,
  KST_OFFSET_MINUTES,
} from '../utils';
import { createBookRepository } from './book-repository';
import { createTelegramMessageRepository } from './telegram-message-repository';

const MARKDOWN_V2_SPECIAL_CHARS = /([_*[\]()~`>#+\-=|{}.!\\])/g;

export const NOTE_BROADCAST_CRON = '0 3 * * *';

export interface NoteCandidate {
  book: BookRecord;
  note: NoteRecord;
  sendCount: number;
}

export interface NoteBroadcastRepository {
  getNoteCandidates(): Promise<NoteCandidate[]>;
  incrementSendCount(noteId: number): Promise<void>;
}

export interface NoteBroadcastDeps {
  repository?: NoteBroadcastRepository;
  fetchFn?: typeof fetch;
  randomFn?: () => number;
  telegramMessageRepository?: {
    save(telegramMessageId: number, noteId: number): Promise<void>;
  };
  bookRepository?: {
    findDueSoonBooks(fromDate: string, toDate: string): Promise<BookRecord[]>;
  };
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
}

export function createNoteBroadcastRepository(
  db: D1Database,
): NoteBroadcastRepository {
  return new D1NoteBroadcastRepository(db);
}

class D1NoteBroadcastRepository implements NoteBroadcastRepository {
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
          COALESCE(s.send_count, 0) AS send_count
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
    }));
  }

  async incrementSendCount(noteId: number): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .prepare(`
        INSERT INTO note_send_stats (note_id, send_count, last_sent_at)
        VALUES (?, 1, ?)
        ON CONFLICT(note_id)
        DO UPDATE SET
          send_count = send_count + 1,
          last_sent_at = excluded.last_sent_at
      `)
      .bind(noteId, now)
      .run();
  }
}

export function selectNoteCandidate(
  candidates: NoteCandidate[],
  randomFn: () => number = Math.random,
): NoteCandidate | null {
  if (candidates.length === 0) {
    return null;
  }

  const minSendCount = candidates.reduce(
    (min, c) => Math.min(min, c.sendCount),
    Infinity,
  );

  const lowest = candidates.filter((c) => c.sendCount === minSendCount);
  const idx = Math.floor(randomFn() * lowest.length);
  return lowest[idx] ?? null;
}

export function formatNoteMessage(candidate: NoteCandidate): string {
  const { book, note } = candidate;
  const escapeMarkdownV2 = (value: string): string =>
    value.replace(MARKDOWN_V2_SPECIAL_CHARS, '\\$1');

  const quoteLines = (value: string): string =>
    value
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');

  const title = escapeMarkdownV2(book.title);
  const authorLine = book.author
    ? `_${escapeMarkdownV2(book.author)}_\n`
    : '_(Unknown Author)_\n';
  const pageValue = note.page_number ?? '?';
  const page = escapeMarkdownV2(`p.${pageValue}`);
  const content = note.content
    ? quoteLines(escapeMarkdownV2(note.content))
    : '';

  const contentSection = content ? `\n\n${content}` : '';

  return `📚 *${title}*\n${authorLine}${page}${contentSection}`;
}

export function formatDueSoonMessage(books: BookRecord[]): string {
  if (books.length === 0) return '';

  const escapeMarkdownV2 = (value: string): string =>
    value.replace(MARKDOWN_V2_SPECIAL_CHARS, '\\$1');

  const header = '📅 반납 예정 도서\n─────────────';
  const items = books.map((book) => {
    const title = escapeMarkdownV2(book.title);
    const dueDate = escapeMarkdownV2(book.due_date);
    const days = daysFromToday(book.due_date);
    const dayLabel = days > 0 ? `${days}일 남음` : '오늘';
    return `• ${title} — ${dueDate} \\(${dayLabel}\\)`;
  });

  return [header, ...items].join('\n');
}

async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
  fetchFn: typeof fetch,
): Promise<number | null> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    console.error(
      `[NoteBroadcast] Telegram send failed: ${response.status} ${response.statusText} ${details}`,
    );
    return null;
  }

  const data = await response.json<{ result?: { message_id?: number } }>();
  if (!data.result?.message_id) {
    console.error(
      '[NoteBroadcast] Telegram response missing result.message_id',
    );
    return null;
  }
  return data.result.message_id;
}

export async function broadcastDailyNote(
  env: Env,
  deps: NoteBroadcastDeps = {},
): Promise<boolean> {
  const repository =
    deps.repository ?? createNoteBroadcastRepository(env.DB as D1Database);
  const fetchFn = deps.fetchFn ?? fetch;
  const randomFn = deps.randomFn ?? Math.random;
  const telegramMessageRepository =
    deps.telegramMessageRepository ??
    createTelegramMessageRepository(env.DB as D1Database);
  const bookRepository =
    deps.bookRepository ?? createBookRepository(env.DB as D1Database);

  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.warn('[NoteBroadcast] Telegram credentials missing; skipping send');
    return false;
  }

  const candidates = await repository.getNoteCandidates();
  const candidate = selectNoteCandidate(candidates, randomFn);

  if (!candidate) {
    console.log('[NoteBroadcast] No notes available to send; skipping');
    return false;
  }

  const message = formatNoteMessage(candidate);
  const messageId = await sendTelegramMessage(
    env.TELEGRAM_BOT_TOKEN,
    env.TELEGRAM_CHAT_ID,
    message,
    fetchFn,
  );

  if (messageId === null) {
    return false;
  }

  if (candidate.note.id) {
    // Save mapping first. If it fails, skip incrementSendCount to keep
    // both writes consistent (no mapping → no send count increment).
    try {
      await telegramMessageRepository.save(messageId, candidate.note.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[NoteBroadcast] Failed to save message mapping: ${msg}`);
      return false;
    }
    await repository.incrementSendCount(candidate.note.id);
  }

  // Send due-soon books as a separate message
  try {
    const kstOffsetMs = KST_OFFSET_MINUTES * 60 * 1000;
    const today = formatDate(new Date(Date.now() + kstOffsetMs));
    const futureDate = formatDate(
      new Date(Date.now() + kstOffsetMs + DUE_SOON_BROADCAST_DAYS * DAY_MS),
    );
    const dueSoonBooks = await bookRepository.findDueSoonBooks(
      today,
      futureDate,
    );
    if (dueSoonBooks.length > 0) {
      const dueSoonMessage = formatDueSoonMessage(dueSoonBooks);
      await sendTelegramMessage(
        env.TELEGRAM_BOT_TOKEN,
        env.TELEGRAM_CHAT_ID,
        dueSoonMessage,
        fetchFn,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[NoteBroadcast] Failed to send due-soon message: ${msg}`);
  }

  return true;
}
