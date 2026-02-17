/**
 * Telegram webhook handler tests
 */

import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';
import { handleTelegramWebhook } from '../telegram-webhook-handler';

const BASE_ENV: Env = {
  DB: {} as D1Database,
  ASSETS: {} as Fetcher,
  LIBRARY_USER_ID: '',
  LIBRARY_PASSWORD: '',
  ALADIN_API_KEY: '',
  TELEGRAM_BOT_TOKEN: 'bot-token',
  TELEGRAM_CHAT_ID: '12345',
  TELEGRAM_WEBHOOK_SECRET: 'my-secret',
  ENVIRONMENT: 'test',
};

function makeRequest(body: unknown, secretHeader?: string): Request {
  return new Request('https://example.com/webhook/telegram', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secretHeader !== undefined
        ? { 'X-Telegram-Bot-Api-Secret-Token': secretHeader }
        : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('handleTelegramWebhook', () => {
  it('returns 401 when secret header is missing', async () => {
    const req = makeRequest({ update_id: 1 });
    const res = await handleTelegramWebhook(req, BASE_ENV, {
      findNoteIdByMessageId: vi.fn(),
      updateNote: vi.fn(),
      sendConfirmation: vi.fn(),
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when secret header is wrong', async () => {
    const req = makeRequest({ update_id: 1 }, 'wrong-secret');
    const res = await handleTelegramWebhook(req, BASE_ENV, {
      findNoteIdByMessageId: vi.fn(),
      updateNote: vi.fn(),
      sendConfirmation: vi.fn(),
    });
    expect(res.status).toBe(401);
  });

  it('returns 200 for non-reply messages (ignores them)', async () => {
    const req = makeRequest(
      {
        update_id: 2,
        message: {
          message_id: 100,
          chat: { id: 12345 },
          text: 'hello',
        },
      },
      'my-secret',
    );
    const res = await handleTelegramWebhook(req, BASE_ENV, {
      findNoteIdByMessageId: vi.fn(),
      updateNote: vi.fn(),
      sendConfirmation: vi.fn(),
    });
    expect(res.status).toBe(200);
  });

  it('returns 200 when reply message_id not found in mapping', async () => {
    const req = makeRequest(
      {
        update_id: 3,
        message: {
          message_id: 200,
          chat: { id: 12345 },
          text: 'correction',
          reply_to_message: { message_id: 999 },
        },
      },
      'my-secret',
    );
    const findNoteIdByMessageId = vi.fn().mockResolvedValue(null);
    const res = await handleTelegramWebhook(req, BASE_ENV, {
      findNoteIdByMessageId,
      updateNote: vi.fn(),
      sendConfirmation: vi.fn(),
    });
    expect(res.status).toBe(200);
    expect(findNoteIdByMessageId).toHaveBeenCalledWith(999);
  });

  it('updates note content when replying to a known note message', async () => {
    const req = makeRequest(
      {
        update_id: 4,
        message: {
          message_id: 300,
          chat: { id: 12345 },
          text: 'corrected text',
          reply_to_message: { message_id: 777 },
        },
      },
      'my-secret',
    );
    const findNoteIdByMessageId = vi.fn().mockResolvedValue(42);
    const updateNote = vi
      .fn()
      .mockResolvedValue({ id: 42, content: 'corrected text' });
    const sendConfirmation = vi.fn().mockResolvedValue(undefined);

    const res = await handleTelegramWebhook(req, BASE_ENV, {
      findNoteIdByMessageId,
      updateNote,
      sendConfirmation,
    });

    expect(res.status).toBe(200);
    expect(updateNote).toHaveBeenCalledWith(42, 'corrected text');
  });

  it('sends Telegram confirmation after successful update', async () => {
    const req = makeRequest(
      {
        update_id: 5,
        message: {
          message_id: 400,
          chat: { id: 12345 },
          text: 'fixed note',
          reply_to_message: { message_id: 888 },
        },
      },
      'my-secret',
    );
    const findNoteIdByMessageId = vi.fn().mockResolvedValue(55);
    const updateNote = vi
      .fn()
      .mockResolvedValue({ id: 55, content: 'fixed note' });
    const sendConfirmation = vi.fn().mockResolvedValue(undefined);

    await handleTelegramWebhook(req, BASE_ENV, {
      findNoteIdByMessageId,
      updateNote,
      sendConfirmation,
    });

    expect(sendConfirmation).toHaveBeenCalledWith(
      expect.stringContaining('fixed note'),
    );
  });

  it('returns 200 and ignores messages without text (photos, stickers)', async () => {
    const req = makeRequest(
      {
        update_id: 6,
        message: {
          message_id: 500,
          chat: { id: 12345 },
          // no text field
          photo: [{}],
          reply_to_message: { message_id: 777 },
        },
      },
      'my-secret',
    );
    const updateNote = vi.fn();
    const res = await handleTelegramWebhook(req, BASE_ENV, {
      findNoteIdByMessageId: vi.fn(),
      updateNote,
      sendConfirmation: vi.fn(),
    });
    expect(res.status).toBe(200);
    expect(updateNote).not.toHaveBeenCalled();
  });

  it('returns 200 even when sendConfirmation throws (best-effort)', async () => {
    const req = makeRequest(
      {
        update_id: 8,
        message: {
          message_id: 700,
          chat: { id: 12345 },
          text: 'fixed note',
          reply_to_message: { message_id: 888 },
        },
      },
      'my-secret',
    );
    const findNoteIdByMessageId = vi.fn().mockResolvedValue(55);
    const updateNote = vi
      .fn()
      .mockResolvedValue({ id: 55, content: 'fixed note' });
    const sendConfirmation = vi
      .fn()
      .mockRejectedValue(new Error('network error'));

    const res = await handleTelegramWebhook(req, BASE_ENV, {
      findNoteIdByMessageId,
      updateNote,
      sendConfirmation,
    });

    expect(res.status).toBe(200);
    expect(updateNote).toHaveBeenCalled();
  });

  it('returns 200 when message comes from wrong chat', async () => {
    const req = makeRequest(
      {
        update_id: 7,
        message: {
          message_id: 600,
          chat: { id: 99999 }, // different chat
          text: 'malicious',
          reply_to_message: { message_id: 777 },
        },
      },
      'my-secret',
    );
    const updateNote = vi.fn();
    const res = await handleTelegramWebhook(req, BASE_ENV, {
      findNoteIdByMessageId: vi.fn(),
      updateNote,
      sendConfirmation: vi.fn(),
    });
    expect(res.status).toBe(200);
    expect(updateNote).not.toHaveBeenCalled();
  });
});
