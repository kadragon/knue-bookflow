/**
 * Telegram webhook handler
 * Receives incoming Telegram updates and processes reply-based note corrections
 */

import { NoteRepository } from '../services/note-repository';
import { TelegramMessageRepository } from '../services/telegram-message-repository';
import type { Env, NoteRecord } from '../types';

interface TelegramMessage {
  message_id: number;
  chat: { id: number };
  text?: string;
  reply_to_message?: { message_id: number };
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramWebhookDeps {
  findNoteIdByMessageId(telegramMessageId: number): Promise<number | null>;
  updateNote(
    noteId: number,
    content: string,
  ): Promise<Pick<NoteRecord, 'id' | 'content'> | null>;
  sendConfirmation(text: string): Promise<void>;
}

export async function handleTelegramWebhook(
  request: Request,
  env: Env,
  deps: TelegramWebhookDeps,
): Promise<Response> {
  // Validate secret token
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!secret || secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json<TelegramUpdate>();
  } catch (error) {
    console.error('[TelegramWebhook] Failed to parse request body:', error);
    return new Response('Bad Request: Invalid JSON body', { status: 400 });
  }
  const message = update.message;

  // Ignore non-message updates, wrong chat, no text, non-reply messages
  if (
    !message ||
    String(message.chat.id) !== env.TELEGRAM_CHAT_ID ||
    !message.text ||
    !message.reply_to_message
  ) {
    return new Response('OK', { status: 200 });
  }

  const replyToId = message.reply_to_message.message_id;
  const noteId = await deps.findNoteIdByMessageId(replyToId);

  if (noteId === null) {
    return new Response('OK', { status: 200 });
  }

  const updated = await deps.updateNote(noteId, message.text);
  if (updated) {
    try {
      await deps.sendConfirmation(`✅ Note updated:\n${updated.content}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[TelegramWebhook] Confirmation send failed (best-effort): ${msg}`,
      );
    }
  }

  return new Response('OK', { status: 200 });
}

export function createTelegramWebhookDeps(
  env: Env,
  db: D1Database,
): TelegramWebhookDeps {
  const telegramRepo = new TelegramMessageRepository(db);
  const noteRepo = new NoteRepository(db);

  return {
    findNoteIdByMessageId: (id) => telegramRepo.findNoteIdByMessageId(id),
    updateNote: (noteId, content) => noteRepo.update(noteId, { content }),
    sendConfirmation: async (text) => {
      const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text,
        }),
      });
    },
  };
}
