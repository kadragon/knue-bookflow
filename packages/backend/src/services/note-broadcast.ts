/**
 * Due-soon Telegram broadcast service
 * (Note broadcast removed; see note-selection.ts for practice-sheet selection)
 */

import type { BookRecord, Env } from '../types';
import {
  DAY_MS,
  DUE_SOON_BROADCAST_DAYS,
  daysFromToday,
  formatDate,
  getTodayString,
  KST_OFFSET_MINUTES,
  MAX_RENEWALS_PER_LOAN,
} from '../utils';
import { createBookRepository } from './book-repository';

const MARKDOWN_V2_SPECIAL_CHARS = /([_*[\]()~`>#+\-=|{}.!\\])/g;

export const DAILY_CRON = '0 3 * * *';

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
    const renewCount = book.renew_count ?? 0;
    const remainingRenewals = Math.max(0, MAX_RENEWALS_PER_LOAN - renewCount);
    const renewalLabel = escapeMarkdownV2(`연장 가능 ${remainingRenewals}회`);
    return `• ${title} — ${dueDate} \\(${dayLabel}\\) / ${renewalLabel}`;
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
      `[DueSoonBroadcast] Telegram send failed: ${response.status} ${response.statusText} ${details}`,
    );
    return null;
  }

  const data = await response.json<{ result?: { message_id?: number } }>();
  if (!data.result?.message_id) {
    console.error(
      '[DueSoonBroadcast] Telegram response missing result.message_id',
    );
    return null;
  }
  return data.result.message_id;
}

export interface DueSoonBroadcastDeps {
  fetchFn?: typeof fetch;
  bookRepository?: {
    findDueSoonBooks(fromDate: string, toDate: string): Promise<BookRecord[]>;
  };
}

export async function broadcastDueSoonBooks(
  env: Env,
  deps: DueSoonBroadcastDeps = {},
): Promise<boolean> {
  const fetchFn = deps.fetchFn ?? fetch;
  const bookRepository =
    deps.bookRepository ?? createBookRepository(env.DB as D1Database);

  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.warn(
      '[DueSoonBroadcast] Telegram credentials missing; skipping send',
    );
    return false;
  }

  try {
    const kstOffsetMs = KST_OFFSET_MINUTES * 60 * 1000;
    const today = getTodayString();
    const futureDate = formatDate(
      new Date(Date.now() + kstOffsetMs + DUE_SOON_BROADCAST_DAYS * DAY_MS),
    );
    const dueSoonBooks = await bookRepository.findDueSoonBooks(
      today,
      futureDate,
    );
    if (dueSoonBooks.length > 0) {
      const dueSoonMessage = formatDueSoonMessage(dueSoonBooks);
      const messageId = await sendTelegramMessage(
        env.TELEGRAM_BOT_TOKEN,
        env.TELEGRAM_CHAT_ID,
        dueSoonMessage,
        fetchFn,
      );
      return messageId !== null;
    }
    return false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[DueSoonBroadcast] Failed to send due-soon message: ${msg}`);
    throw err;
  }
}
