/**
 * TelegramMessageRepository tests
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { TelegramMessageRepository } from '../telegram-message-repository';

const SQL_INSERT =
  'INSERT OR REPLACE INTO telegram_message_notes (telegram_message_id, note_id) VALUES (?, ?)';
const SQL_SELECT =
  'SELECT note_id FROM telegram_message_notes WHERE telegram_message_id = ?';

function makeMockDb() {
  const store = new Map<number, number>();

  return {
    store,
    db: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => {
          if (sql === SQL_INSERT) {
            const [msgId, noteId] = args as [number, number];
            return {
              run: async () => {
                store.set(msgId, noteId);
                return { meta: { changes: 1 } };
              },
            };
          }
          if (sql === SQL_SELECT) {
            const [telegramId] = args as [number];
            return {
              first: async <T>() => {
                const noteId = store.get(telegramId);
                if (noteId === undefined) return null;
                return { note_id: noteId } as T;
              },
            };
          }
          return { run: async () => {}, first: async () => null };
        },
      }),
    } as unknown as D1Database,
  };
}

describe('TelegramMessageRepository', () => {
  let repo: TelegramMessageRepository;
  let mockDb: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    mockDb = makeMockDb();
    repo = new TelegramMessageRepository(mockDb.db);
  });

  it('save() stores a telegram_message_id -> note_id mapping', async () => {
    await repo.save(1001, 42);

    expect(mockDb.store.get(1001)).toBe(42);
  });

  it('findNoteIdByMessageId() returns note_id when mapping exists', async () => {
    await repo.save(2002, 99);

    const noteId = await repo.findNoteIdByMessageId(2002);

    expect(noteId).toBe(99);
  });

  it('findNoteIdByMessageId() returns null when mapping does not exist', async () => {
    const noteId = await repo.findNoteIdByMessageId(9999);

    expect(noteId).toBeNull();
  });
});
