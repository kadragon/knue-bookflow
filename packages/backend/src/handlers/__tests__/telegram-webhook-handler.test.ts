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
      setReaction: vi.fn(),
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when secret header is wrong', async () => {
    const req = makeRequest({ update_id: 1 }, 'wrong-secret');
    const res = await handleTelegramWebhook(req, BASE_ENV, {
      findNoteIdByMessageId: vi.fn(),
      updateNote: vi.fn(),
      setReaction: vi.fn(),
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
      setReaction: vi.fn(),
    });
    expect(res.status).toBe(200);
  });

  it('returns 200 and sends failure reaction when reply message_id not found in mapping', async () => {
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
    const setReaction = vi.fn().mockResolvedValue(undefined);
    const res = await handleTelegramWebhook(req, BASE_ENV, {
      findNoteIdByMessageId,
      updateNote: vi.fn(),
      setReaction,
    });
    expect(res.status).toBe(200);
    expect(findNoteIdByMessageId).toHaveBeenCalledWith(999);
    expect(setReaction).toHaveBeenCalledWith('12345', 200, '❌');
  });

  it('replaces only the first matching typo when reply text is "오탈 > 수정"', async () => {
    const req = makeRequest(
      {
        update_id: 4,
        message: {
          message_id: 300,
          chat: { id: 12345 },
          text: '오탈 > 수정',
          reply_to_message: { message_id: 777 },
        },
      },
      'my-secret',
    );
    const findNoteIdByMessageId = vi.fn().mockResolvedValue(42);
    const findNoteById = vi
      .fn()
      .mockResolvedValue({ id: 42, content: '오탈 문장 오탈' });
    const updateNote = vi
      .fn()
      .mockResolvedValue({ id: 42, content: '수정 문장 오탈' });
    const setReaction = vi.fn().mockResolvedValue(undefined);

    const res = await handleTelegramWebhook(req, BASE_ENV, {
      findNoteIdByMessageId,
      updateNote,
      setReaction,
      findNoteById,
    } as unknown as Parameters<typeof handleTelegramWebhook>[2]);

    expect(res.status).toBe(200);
    expect(findNoteById).toHaveBeenCalledWith(42);
    expect(updateNote).toHaveBeenCalledWith(42, '수정 문장 오탈');
    expect(setReaction).toHaveBeenCalledWith('12345', 300, '✅');
  });

  it('trims spaces around delimiter and applies exact-match replacement', async () => {
    const req = makeRequest(
      {
        update_id: 41,
        message: {
          message_id: 301,
          chat: { id: 12345 },
          text: '  오탈  >   수정  ',
          reply_to_message: { message_id: 778 },
        },
      },
      'my-secret',
    );
    const findNoteIdByMessageId = vi.fn().mockResolvedValue(42);
    const findNoteById = vi
      .fn()
      .mockResolvedValue({ id: 42, content: '오탈 문장' });
    const updateNote = vi
      .fn()
      .mockResolvedValue({ id: 42, content: '수정 문장' });
    const setReaction = vi.fn().mockResolvedValue(undefined);

    const res = await handleTelegramWebhook(req, BASE_ENV, {
      findNoteIdByMessageId,
      updateNote,
      setReaction,
      findNoteById,
    } as unknown as Parameters<typeof handleTelegramWebhook>[2]);

    expect(res.status).toBe(200);
    expect(updateNote).toHaveBeenCalledWith(42, '수정 문장');
    expect(setReaction).toHaveBeenCalledWith('12345', 301, '✅');
  });

  it('does not update note and sends failure notice when typo part is empty', async () => {
    const req = makeRequest(
      {
        update_id: 42,
        message: {
          message_id: 302,
          chat: { id: 12345 },
          text: '   > 수정',
          reply_to_message: { message_id: 779 },
        },
      },
      'my-secret',
    );
    const findNoteIdByMessageId = vi.fn().mockResolvedValue(42);
    const findNoteById = vi
      .fn()
      .mockResolvedValue({ id: 42, content: '오탈 문장' });
    const updateNote = vi
      .fn()
      .mockResolvedValue({ id: 42, content: '오탈 문장' });
    const setReaction = vi.fn().mockResolvedValue(undefined);

    const res = await handleTelegramWebhook(req, BASE_ENV, {
      findNoteIdByMessageId,
      updateNote,
      setReaction,
      findNoteById,
    } as unknown as Parameters<typeof handleTelegramWebhook>[2]);

    expect(res.status).toBe(200);
    expect(updateNote).not.toHaveBeenCalled();
    expect(setReaction).toHaveBeenCalledWith('12345', 302, '❌');
  });

  it('does not update note and sends failure notice when typo is not found', async () => {
    const req = makeRequest(
      {
        update_id: 43,
        message: {
          message_id: 303,
          chat: { id: 12345 },
          text: '없는문자열 > 수정',
          reply_to_message: { message_id: 780 },
        },
      },
      'my-secret',
    );
    const findNoteIdByMessageId = vi.fn().mockResolvedValue(42);
    const findNoteById = vi
      .fn()
      .mockResolvedValue({ id: 42, content: '원본 문장' });
    const updateNote = vi
      .fn()
      .mockResolvedValue({ id: 42, content: '원본 문장' });
    const setReaction = vi.fn().mockResolvedValue(undefined);

    const res = await handleTelegramWebhook(req, BASE_ENV, {
      findNoteIdByMessageId,
      updateNote,
      setReaction,
      findNoteById,
    } as unknown as Parameters<typeof handleTelegramWebhook>[2]);

    expect(res.status).toBe(200);
    expect(updateNote).not.toHaveBeenCalled();
    expect(setReaction).toHaveBeenCalledWith('12345', 303, '❌');
  });

  it('sends failure reaction when findNoteById dependency is missing', async () => {
    const req = makeRequest(
      {
        update_id: 44,
        message: {
          message_id: 304,
          chat: { id: 12345 },
          text: '오탈 > 수정',
          reply_to_message: { message_id: 781 },
        },
      },
      'my-secret',
    );
    const findNoteIdByMessageId = vi.fn().mockResolvedValue(42);
    const setReaction = vi.fn().mockResolvedValue(undefined);

    const res = await handleTelegramWebhook(req, BASE_ENV, {
      findNoteIdByMessageId,
      updateNote: vi.fn(),
      setReaction,
    });

    expect(res.status).toBe(200);
    expect(setReaction).toHaveBeenCalledWith('12345', 304, '❌');
  });

  it('sends failure reaction when updateNote returns null', async () => {
    const req = makeRequest(
      {
        update_id: 45,
        message: {
          message_id: 305,
          chat: { id: 12345 },
          text: '오탈 > 수정',
          reply_to_message: { message_id: 782 },
        },
      },
      'my-secret',
    );
    const findNoteIdByMessageId = vi.fn().mockResolvedValue(42);
    const findNoteById = vi
      .fn()
      .mockResolvedValue({ id: 42, content: '오탈 문장' });
    const updateNote = vi.fn().mockResolvedValue(null);
    const setReaction = vi.fn().mockResolvedValue(undefined);

    const res = await handleTelegramWebhook(req, BASE_ENV, {
      findNoteIdByMessageId,
      updateNote,
      setReaction,
      findNoteById,
    } as unknown as Parameters<typeof handleTelegramWebhook>[2]);

    expect(res.status).toBe(200);
    expect(updateNote).toHaveBeenCalledWith(42, '수정 문장');
    expect(setReaction).toHaveBeenCalledWith('12345', 305, '❌');
  });

  it('does not update note and sends failure notice when delimiter is missing', async () => {
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
    const findNoteById = vi
      .fn()
      .mockResolvedValue({ id: 55, content: 'before content' });
    const updateNote = vi
      .fn()
      .mockResolvedValue({ id: 55, content: 'fixed note' });
    const setReaction = vi.fn().mockResolvedValue(undefined);

    const res = await handleTelegramWebhook(req, BASE_ENV, {
      findNoteIdByMessageId,
      updateNote,
      setReaction,
      findNoteById,
    } as unknown as Parameters<typeof handleTelegramWebhook>[2]);

    expect(res.status).toBe(200);
    expect(findNoteById).not.toHaveBeenCalled();
    expect(updateNote).not.toHaveBeenCalled();
    expect(setReaction).toHaveBeenCalledWith('12345', 400, '❌');
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
      setReaction: vi.fn(),
    });
    expect(res.status).toBe(200);
    expect(updateNote).not.toHaveBeenCalled();
  });

  it('returns 200 even when setReaction throws (best-effort)', async () => {
    const req = makeRequest(
      {
        update_id: 8,
        message: {
          message_id: 700,
          chat: { id: 12345 },
          text: '오탈 > 수정',
          reply_to_message: { message_id: 888 },
        },
      },
      'my-secret',
    );
    const findNoteIdByMessageId = vi.fn().mockResolvedValue(55);
    const findNoteById = vi
      .fn()
      .mockResolvedValue({ id: 55, content: '오탈 문장' });
    const updateNote = vi
      .fn()
      .mockResolvedValue({ id: 55, content: '수정 문장' });
    const setReaction = vi.fn().mockRejectedValue(new Error('network error'));

    const res = await handleTelegramWebhook(req, BASE_ENV, {
      findNoteIdByMessageId,
      updateNote,
      setReaction,
      findNoteById,
    } as unknown as Parameters<typeof handleTelegramWebhook>[2]);

    expect(res.status).toBe(200);
    expect(updateNote).toHaveBeenCalled();
  });

  it('returns 400 when request body is not valid JSON', async () => {
    const req = new Request('https://example.com/webhook/telegram', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'my-secret',
      },
      body: 'not-json{{{',
    });
    const res = await handleTelegramWebhook(req, BASE_ENV, {
      findNoteIdByMessageId: vi.fn(),
      updateNote: vi.fn(),
      setReaction: vi.fn(),
    });
    expect(res.status).toBe(400);
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
      setReaction: vi.fn(),
    });
    expect(res.status).toBe(200);
    expect(updateNote).not.toHaveBeenCalled();
  });
});
